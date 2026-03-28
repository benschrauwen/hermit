import { spawn, type ChildProcessByStdio } from "node:child_process";
import process from "node:process";
import type { Readable } from "node:stream";

import type { AgentSession } from "@mariozechner/pi-coding-agent";
import {
  CombinedAutocompleteProvider,
  Key,
  ProcessTerminal,
  TUI,
  matchesKey,
  truncateToWidth,
  type Component,
  type Focusable,
} from "@mariozechner/pi-tui";

import { isAbortError } from "./abort.js";
import { runHeartbeatDaemonLoop } from "./cli-heartbeat.js";
import { createHeartbeatDaemonController, parseHeartbeatDaemonInterval } from "./heartbeat-daemon.js";
import {
  InteractiveSessionController,
  isExitCommand,
  normalizeChatInput,
  type InteractiveSessionStreamingHandle,
} from "./interactive-session-controller.js";
import { formatUserPromptEcho } from "./session-formatting.js";
import { createSessionStreamHandler, type SessionOutputSink } from "./session-terminal.js";
import type { InteractiveChatSession } from "./session-runtime.js";
import type { RoleSwitchRequest } from "./types.js";
import { readHermitTailscaleNotice, readHermitTailscaleUrl } from "./tailscale.js";
import type { TelemetryRecorder } from "./telemetry-recorder.js";
import {
  ANSI_BOLD,
  ANSI_DIM,
  ANSI_RESET,
  AnsiTextBuffer,
  RoleLabeledEditor,
  StatusLine,
  colorize,
  editorTheme,
} from "./tui-components.js";
import { createWorkspaceTurnCoordinator, formatWorkspaceTurnOwner } from "./turn-control.js";
import {
  extractExplorerUrl,
  renderAnsiTextBlock,
  resolveWorkspaceStartLayout,
} from "./workspace-start-display.js";

export { extractExplorerUrl, renderAnsiTextBlock, resolveWorkspaceStartLayout };

const DEFAULT_EXPLORER_PORT = 4321;
const DEFAULT_EXPLORER_URL = `http://localhost:${DEFAULT_EXPLORER_PORT}`;
const CHILD_STOP_TIMEOUT_MS = 15_000;

export interface WorkspaceStartLoopOptions {
  workspaceRoot: string;
  frameworkRoot: string;
  heartbeatInterval: string;
  initialHeartbeatDelay?: string;
  continueHeartbeatSessions?: boolean;
  gitCheckpointsEnabled?: boolean;
  initialSession: InteractiveChatSession;
  initialPrompt?: string;
  initialImages?: string[];
  showInitialPromptEcho?: boolean;
  onRoleSwitch?: (request: RoleSwitchRequest, previousRoleLabel: string) => Promise<InteractiveChatSession>;
}

interface ChildProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

function mergeNodeOptions(existing: string | undefined, option: string): string {
  const normalizedExisting = existing?.trim() ?? "";
  if (!normalizedExisting) {
    return option;
  }

  return normalizedExisting.includes(option) ? normalizedExisting : `${normalizedExisting} ${option}`;
}

function createBlankLines(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, () => "");
}

function formatChildProcessResult(result: ChildProcessResult): string {
  if (result.error) {
    return `failed to start: ${result.error.message}`;
  }
  if (result.signal) {
    return `signal ${result.signal}`;
  }
  if (typeof result.code === "number") {
    return `exit code ${result.code}`;
  }
  return "unknown reason";
}

function renderHeader(title: string, detail: string | undefined, width: number): string {
  const line = detail ? `${title} ${colorize(ANSI_DIM, `| ${detail}`)}` : title;
  return truncateToWidth(line, Math.max(1, width));
}

class WorkspaceStartLayout implements Component, Focusable {
  private readonly heartbeatLog = new AnsiTextBuffer(renderAnsiTextBlock);
  private readonly transcript = new AnsiTextBuffer(renderAnsiTextBlock);
  private readonly status: StatusLine;
  private readonly editor: RoleLabeledEditor;
  private activeRoleLabel: string;
  private modelLabel: string;
  private explorerStatus = `starting on ${DEFAULT_EXPLORER_URL}`;
  private tailscaleStatus: string | undefined;
  private queuedFollowUpCount = 0;

  private _focused = false;

  constructor(private readonly tui: TUI, activeRoleLabel: string, modelLabel: string) {
    this.activeRoleLabel = activeRoleLabel;
    this.modelLabel = modelLabel;
    this.status = new StatusLine(() => this.tui.requestRender());
    this.editor = new RoleLabeledEditor(this.tui, editorTheme, activeRoleLabel);
  }

  get focused(): boolean {
    return this._focused;
  }

  set focused(value: boolean) {
    this._focused = value;
    this.editor.focused = value;
  }

  getEditor(): RoleLabeledEditor {
    return this.editor;
  }

  getActiveRoleLabel(): string {
    return this.activeRoleLabel;
  }

  setActiveSession(activeRoleLabel: string, modelLabel: string): void {
    this.activeRoleLabel = activeRoleLabel;
    this.modelLabel = modelLabel;
    this.editor.setRoleLabel(activeRoleLabel);
    this.tui.requestRender();
  }

  setExplorerStatus(status: string): void {
    if (this.explorerStatus === status) {
      return;
    }

    this.explorerStatus = status;
    this.tui.requestRender();
  }

  setTailscaleStatus(status: string | undefined): void {
    const normalized = status?.trim() || undefined;
    if (this.tailscaleStatus === normalized) {
      return;
    }

    this.tailscaleStatus = normalized;
    this.tui.requestRender();
  }

  setQueuedFollowUpCount(count: number): void {
    const normalized = Math.max(0, Math.floor(count));
    if (this.queuedFollowUpCount === normalized) {
      return;
    }

    this.queuedFollowUpCount = normalized;
    this.tui.requestRender();
  }

  appendHeartbeatOutput(text: string): void {
    this.heartbeatLog.appendText(text);
    this.tui.requestRender();
  }

  appendChatText(text: string): void {
    this.transcript.appendText(text);
    this.tui.requestRender();
  }

  showStatus(text: string): void {
    this.status.setMessage(text);
  }

  clearStatus(): void {
    this.status.clear();
  }

  handleInput(data: string): void {
    this.editor.handleInput(data);
  }

  invalidate(): void {
    this.heartbeatLog.invalidate();
    this.transcript.invalidate();
    this.status.invalidate();
    this.editor.invalidate();
  }

  render(width: number): string[] {
    const totalRows = Math.max(3, this.tui.terminal.rows);
    const { heartbeatHeight, chatHeight } = resolveWorkspaceStartLayout(totalRows);
    const divider = colorize(ANSI_DIM, "─".repeat(Math.max(1, width)));

    return [
      ...this.renderHeartbeatPane(width, heartbeatHeight),
      truncateToWidth(divider, Math.max(1, width)),
      ...this.renderChatPane(width, chatHeight),
    ];
  }

  private renderHeartbeatPane(width: number, height: number): string[] {
    const detail = [
      `Explorer ${this.explorerStatus}`,
      ...(this.tailscaleStatus ? [`Tailscale ${this.tailscaleStatus}`] : []),
    ].join(" | ");
    const header = renderHeader(
      `${ANSI_BOLD}Heartbeat daemon${ANSI_RESET}`,
      detail,
      width,
    );
    const bodyHeight = Math.max(0, height - 1);
    const bodyLines = this.heartbeatLog.render(width).slice(-bodyHeight);
    return [header, ...bodyLines, ...createBlankLines(bodyHeight - bodyLines.length)];
  }

  private renderChatPane(width: number, height: number): string[] {
    const detail = [
      `model ${this.modelLabel}`,
      ...(this.queuedFollowUpCount > 0
        ? [`${this.queuedFollowUpCount} queued follow-up${this.queuedFollowUpCount === 1 ? "" : "s"}`]
        : []),
      "Ctrl-C exits and cancels live sessions",
    ].join(" | ");
    const header = renderHeader(
      `${ANSI_BOLD}Chat${ANSI_RESET}`,
      detail,
      width,
    );

    if (height <= 1) {
      return [header];
    }

    let statusLines = this.status.render(width);
    let editorLines = this.editor.render(width);
    const maxBodyLines = Math.max(0, height - 1);

    if (statusLines.length + editorLines.length > maxBodyLines) {
      statusLines = [];
      if (editorLines.length > maxBodyLines) {
        editorLines = maxBodyLines === 0 ? [] : editorLines.slice(editorLines.length - maxBodyLines);
      }
    }

    const transcriptHeight = Math.max(0, maxBodyLines - statusLines.length - editorLines.length);
    const transcriptLines = this.transcript.render(width).slice(-transcriptHeight);

    return [
      header,
      ...createBlankLines(transcriptHeight - transcriptLines.length),
      ...transcriptLines,
      ...statusLines,
      ...editorLines,
    ];
  }
}

class WorkspaceStartTui implements SessionOutputSink {
  private readonly terminal = new ProcessTerminal();
  private readonly tui = new TUI(this.terminal);
  private readonly layout: WorkspaceStartLayout;
  private readonly removeInputListener: () => void;
  private submitHandler: ((value: string) => void) | undefined;
  private shutdownRequested = false;
  private shutdownHandler: (() => Promise<void>) | undefined;

  constructor(activeRoleLabel: string, modelLabel: string) {
    this.layout = new WorkspaceStartLayout(this.tui, activeRoleLabel, modelLabel);
    this.tui.addChild(this.layout);
    this.tui.setFocus(this.layout);

    const editor = this.layout.getEditor();
    editor.disableSubmit = true;
    editor.setAutocompleteProvider(
      new CombinedAutocompleteProvider(
        [
          { name: "exit", description: "Stop Hermit and close the workspace screen." },
          { name: "quit", description: "Stop Hermit and close the workspace screen." },
        ],
        process.cwd(),
      ),
    );
    editor.onSubmit = (submittedValue) => {
      if (this.shutdownRequested || !this.submitHandler) {
        return;
      }

      if (submittedValue.trim().length > 0) {
        editor.addToHistory(submittedValue);
      }
      this.submitHandler(submittedValue);
    };

    this.removeInputListener = this.tui.addInputListener((data) => {
      if (matchesKey(data, Key.ctrl("c"))) {
        this.requestShutdown("Shutting down Hermit, stopping the explorer, and canceling live sessions...");
        return { consume: true };
      }

      if (matchesKey(data, Key.ctrl("d")) && editor.getExpandedText().length === 0) {
        this.requestShutdown("Shutting down Hermit.");
        return { consume: true };
      }

      return undefined;
    });

    this.terminal.setTitle(`Hermit start: ${activeRoleLabel}`);
    this.tui.start();
  }

  setActiveSession(activeRoleLabel: string, modelLabel: string): void {
    this.layout.setActiveSession(activeRoleLabel, modelLabel);
    this.terminal.setTitle(`Hermit start: ${activeRoleLabel}`);
  }

  setExplorerStatus(status: string): void {
    this.layout.setExplorerStatus(status);
  }

  setTailscaleStatus(status: string | undefined): void {
    this.layout.setTailscaleStatus(status);
  }

  setShutdownHandler(handler: () => Promise<void>): void {
    this.shutdownHandler = handler;
  }

  setSubmitHandler(handler: ((value: string) => void) | undefined): void {
    this.submitHandler = handler;
    const editor = this.layout.getEditor();
    editor.disableSubmit = handler === undefined;
    this.tui.setFocus(this.layout);
    this.tui.requestRender();
  }

  setQueuedFollowUpCount(count: number): void {
    this.layout.setQueuedFollowUpCount(count);
  }

  requestShutdown(message?: string): void {
    if (this.shutdownRequested) {
      return;
    }

    this.shutdownRequested = true;
    this.clearStatus();
    if (message) {
      this.appendSystemNotice(message);
    }

    const editor = this.layout.getEditor();
    editor.disableSubmit = true;

    if (this.shutdownHandler) {
      void this.shutdownHandler();
    }
  }

  appendHeartbeatOutput(text: string): void {
    this.layout.appendHeartbeatOutput(text);
  }

  appendUserPrompt(prompt: string, options: { queued?: boolean } = {}): void {
    this.appendText(formatUserPromptEcho(prompt, this.layout.getActiveRoleLabel()));
    if (options.queued) {
      this.appendText(`${colorize(ANSI_DIM, "Queued as a follow-up.")}\n\n`);
    }
  }

  appendSystemNotice(text: string): void {
    this.appendText(`${colorize(ANSI_DIM, text)}\n`);
  }

  appendText(text: string): void {
    this.layout.appendChatText(text);
  }

  appendToolStatus(text: string): void {
    this.layout.appendChatText(`${colorize(ANSI_DIM, text)}\n`);
  }

  showStatus(text: string): void {
    this.layout.showStatus(text);
  }

  clearStatus(): void {
    this.layout.clearStatus();
  }

  async close(): Promise<void> {
    this.removeInputListener();
    this.clearStatus();

    const editor = this.layout.getEditor();
    editor.disableSubmit = true;

    await this.terminal.drainInput().catch(() => undefined);
    this.tui.stop();
  }
}

class ManagedChildProcess {
  private result: ChildProcessResult | undefined;
  private readonly resultPromise: Promise<ChildProcessResult>;

  constructor(
    private readonly child: ChildProcessByStdio<null, Readable, Readable>,
    options: {
      onText?: (text: string) => void;
      onResult?: (result: ChildProcessResult) => void;
    } = {},
  ) {
    const { onText, onResult } = options;
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string | Buffer) => {
      onText?.(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });
    this.child.stderr.on("data", (chunk: string | Buffer) => {
      onText?.(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });

    this.resultPromise = new Promise((resolve) => {
      const finalize = (result: ChildProcessResult) => {
        if (this.result) {
          return;
        }

        this.result = result;
        onResult?.(result);
        resolve(result);
      };

      this.child.once("error", (error) => {
        finalize({
          code: null,
          signal: null,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });

      this.child.once("exit", (code, signal) => {
        finalize({ code, signal });
      });
    });
  }

  async stop(timeoutMs = CHILD_STOP_TIMEOUT_MS): Promise<ChildProcessResult> {
    if (this.result) {
      return this.result;
    }

    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill("SIGTERM");
    }

    const timedResult = await Promise.race([
      this.resultPromise,
      new Promise<undefined>((resolve) => {
        setTimeout(resolve, timeoutMs);
      }),
    ]);
    if (timedResult) {
      return timedResult;
    }

    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill("SIGKILL");
    }

    return this.resultPromise;
  }
}

function attachWorkspaceStartStreaming(
  session: AgentSession,
  tui: WorkspaceStartTui,
  telemetry?: TelemetryRecorder,
): () => void {
  return session.subscribe(createSessionStreamHandler(tui, telemetry));
}

class WorkspaceStartHeartbeatSink implements SessionOutputSink {
  constructor(private readonly ui: WorkspaceStartTui) {}

  appendText(text: string): void {
    this.ui.appendHeartbeatOutput(text);
  }

  appendToolStatus(text: string): void {
    this.ui.appendHeartbeatOutput(`${colorize(ANSI_DIM, text)}\n`);
  }

  showStatus(_text: string): void {}

  clearStatus(): void {}
}

function spawnManagedProcess(options: {
  cwd: string;
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  onText?: (text: string) => void;
  onResult?: (result: ChildProcessResult) => void;
}): ManagedChildProcess {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  return new ManagedChildProcess(child, {
    ...(options.onText ? { onText: options.onText } : {}),
    ...(options.onResult ? { onResult: options.onResult } : {}),
  });
}

export async function runWorkspaceStartLoop(options: WorkspaceStartLoopOptions): Promise<void> {
  if (!(process.stdin.isTTY && process.stdout.isTTY)) {
    throw new Error("The combined `start` command requires an interactive terminal.");
  }

  const ui = new WorkspaceStartTui(options.initialSession.activeRoleLabel, options.initialSession.modelLabel);
  const heartbeatSessionSink = new WorkspaceStartHeartbeatSink(ui);
  let explorerProcess: ManagedChildProcess | undefined;
  const heartbeatController = createHeartbeatDaemonController({
    onAbortError: (error) => {
      ui.appendHeartbeatOutput(`[supervisor] Failed to abort active heartbeat session: ${error instanceof Error ? error.message : String(error)}.\n`);
    },
  });
  const turnCoordinator = createWorkspaceTurnCoordinator();
  let heartbeatLoopPromise: Promise<void> | undefined;
  let shutdownRequested = false;
  let shutdownPromise: Promise<void> | undefined;
  let loopSettled = false;
  let resolveLoop!: () => void;
  let rejectLoop!: (error: unknown) => void;
  const loopDone = new Promise<void>((resolve, reject) => {
    resolveLoop = () => {
      if (loopSettled) {
        return;
      }
      loopSettled = true;
      resolve();
    };
    rejectLoop = (error) => {
      if (loopSettled) {
        return;
      }
      loopSettled = true;
      reject(error);
    };
  });
  let explorerReadyNotified = false;
  let explorerUrl = DEFAULT_EXPLORER_URL;
  const pendingQueuedFollowUps: Array<{ prompt: string }> = [];
  let activePromptPromise: Promise<void> | undefined;
  const sessionController = new InteractiveSessionController({
    root: options.workspaceRoot,
    initialSession: options.initialSession,
    ...(options.gitCheckpointsEnabled !== undefined ? { gitCheckpointsEnabled: options.gitCheckpointsEnabled } : {}),
    turnCoordinator,
    ...(options.onRoleSwitch ? { onRoleSwitch: options.onRoleSwitch } : {}),
    shouldHandleRoleSwitch: () => !shutdownRequested,
    attachStreaming: (session): InteractiveSessionStreamingHandle => ({
      stop: attachWorkspaceStartStreaming(session.session, ui, session.telemetry),
    }),
    onActiveSessionChange: (session) => {
      ui.setActiveSession(session.activeRoleLabel, session.modelLabel);
    },
    onRedundantRoleSwitch: (activeRoleLabel) => {
      ui.appendSystemNotice(`Ignored redundant role switch to ${activeRoleLabel}.`);
    },
    onRoleSwitched: (session) => {
      ui.appendSystemNotice(`Switched active role to ${session.activeRoleLabel} using ${session.modelLabel}.`);
    },
    onTurnStateChange: (state) => {
      if (state !== "running") {
        return;
      }

      while (pendingQueuedFollowUps.length > 0) {
        const nextPrompt = pendingQueuedFollowUps[0];
        if (!nextPrompt || !sessionController.queueFollowUp(nextPrompt.prompt)) {
          break;
        }
        pendingQueuedFollowUps.shift();
      }
      ui.setQueuedFollowUpCount(pendingQueuedFollowUps.length + sessionController.getQueuedFollowUpCount());
    },
    onQueuedFollowUpCountChange: (count) => {
      ui.setQueuedFollowUpCount(pendingQueuedFollowUps.length + count);
    },
  });

  const requestShutdown = async (): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownRequested = true;
    resolveLoop();
    ui.setExplorerStatus("stopping...");
    ui.clearStatus();

    shutdownPromise = (async () => {
      heartbeatController.stop();
      const results = await Promise.allSettled([
        sessionController.getActiveSession().session.abort(),
        heartbeatLoopPromise,
        explorerProcess?.stop(),
      ]);

      for (const result of results) {
        if (result.status !== "rejected" || isAbortError(result.reason)) {
          continue;
        }
        ui.appendSystemNotice(`Shutdown cleanup error: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      }
    })();

    return shutdownPromise;
  };

  ui.setShutdownHandler(requestShutdown);
  ui.appendSystemNotice(`Using model ${sessionController.getActiveSession().modelLabel}.`);
  ui.setExplorerStatus(`starting on ${DEFAULT_EXPLORER_URL}`);
  const tailscaleUrl = readHermitTailscaleUrl();
  if (tailscaleUrl) {
    ui.setTailscaleStatus(`up at ${tailscaleUrl}`);
    ui.appendSystemNotice(`Tailscale up at ${tailscaleUrl}.`);
  } else {
    const tailscaleNotice = readHermitTailscaleNotice();
    if (tailscaleNotice) {
      ui.appendSystemNotice(tailscaleNotice);
    }
  }

  const onSignal = (signal: NodeJS.Signals) => {
    ui.requestShutdown(`Received ${signal}. Stopping Hermit and canceling live sessions...`);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const updateQueuedFollowUpCount = (): void => {
    ui.setQueuedFollowUpCount(pendingQueuedFollowUps.length + sessionController.getQueuedFollowUpCount());
  };

  async function promptActiveSession(prompt: string, imagePaths: string[] = []): Promise<void> {
    try {
      let waitingStatusShown = false;
      await sessionController.prompt(prompt, imagePaths, (owner) => {
        if (waitingStatusShown) {
          return;
        }
        waitingStatusShown = true;
        ui.showStatus(`Waiting for ${formatWorkspaceTurnOwner(owner)} to finish`);
      });
    } catch (error) {
      if (shutdownRequested && isAbortError(error)) {
        return;
      }
      throw error;
    }

    if (shutdownRequested) {
      return;
    }
    ui.clearStatus();
  }

  function startPromptSubmission(
    prompt: string,
    imagePaths: string[] = [],
    options: { echoPrompt?: boolean } = {},
  ): void {
    if (options.echoPrompt !== false) {
      ui.appendUserPrompt(prompt);
    }

    activePromptPromise = promptActiveSession(prompt, imagePaths)
      .catch((error) => {
        if (shutdownRequested && isAbortError(error)) {
          return;
        }

        const detail = error instanceof Error ? error.message : String(error);
        ui.appendSystemNotice(`Chat failed (${detail}).`);
        rejectLoop(error);
        ui.requestShutdown(`Shutting down Hermit after chat failure (${detail}).`);
      })
      .finally(() => {
        activePromptPromise = undefined;
        if (shutdownRequested) {
          pendingQueuedFollowUps.length = 0;
          updateQueuedFollowUpCount();
          return;
        }

        const nextPrompt = pendingQueuedFollowUps.shift();
        updateQueuedFollowUpCount();
        if (!nextPrompt) {
          return;
        }

        startPromptSubmission(nextPrompt.prompt, [], { echoPrompt: false });
      });
  }

  function handleSubmittedPrompt(rawInput: string, imagePaths: string[] = []): void {
    const input = normalizeChatInput(rawInput);
    if (!input.trim()) {
      return;
    }

    if (isExitCommand(input)) {
      ui.requestShutdown("Shutting down Hermit.");
      return;
    }

    if (!activePromptPromise) {
      startPromptSubmission(input, imagePaths);
      return;
    }

    ui.appendUserPrompt(input, { queued: true });
    if (sessionController.queueFollowUp(input)) {
      updateQueuedFollowUpCount();
      return;
    }

    pendingQueuedFollowUps.push({ prompt: input });
    updateQueuedFollowUpCount();
  }

  try {
    explorerProcess = spawnManagedProcess({
      cwd: options.frameworkRoot,
      command: "npm",
      args: ["--prefix", "explorer", "run", "dev"],
      env: {
        NODE_OPTIONS: mergeNodeOptions(process.env.NODE_OPTIONS, "--import tsx"),
        WORKSPACE_ROOT: options.workspaceRoot,
        FRAMEWORK_ROOT: options.frameworkRoot,
        ASTRO_TELEMETRY_DISABLED: "1",
      },
      onText: (text) => {
        const nextUrl = extractExplorerUrl(text);
        if (!nextUrl) {
          return;
        }

        explorerUrl = nextUrl;
        ui.setExplorerStatus(explorerUrl);
        if (!explorerReadyNotified) {
          explorerReadyNotified = true;
          ui.appendSystemNotice(`Explorer ready at ${explorerUrl}.`);
        }
      },
      onResult: (result) => {
        ui.setExplorerStatus(shutdownRequested ? "stopped" : `stopped (${formatChildProcessResult(result)})`);
        if (!shutdownRequested) {
          ui.appendSystemNotice(`Explorer exited unexpectedly (${formatChildProcessResult(result)}).`);
        }
      },
    });

    heartbeatLoopPromise = runHeartbeatDaemonLoop({
      root: options.workspaceRoot,
      intervalMs: parseHeartbeatDaemonInterval(options.heartbeatInterval),
      ...(options.initialHeartbeatDelay ? { initialDelayMs: parseHeartbeatDaemonInterval(options.initialHeartbeatDelay) } : {}),
      ...(options.continueHeartbeatSessions ? { continueRecent: true } : {}),
      ...(options.gitCheckpointsEnabled !== undefined ? { gitCheckpointsEnabled: options.gitCheckpointsEnabled } : {}),
      controller: heartbeatController,
      handleSignals: false,
      turnCoordinator,
      onInfo: (message) => {
        ui.appendHeartbeatOutput(message);
      },
      onError: (message) => {
        ui.appendHeartbeatOutput(message);
      },
      renderOptions: {
        sink: heartbeatSessionSink,
        echoPrompt: false,
        showModelNotice: false,
      },
    }).catch((error) => {
      if (shutdownRequested || isAbortError(error)) {
        return;
      }

      const detail = error instanceof Error ? error.message : String(error);
      ui.appendHeartbeatOutput(`\n[supervisor] Heartbeat daemon failed (${detail}).\n`);
      ui.appendSystemNotice(`Heartbeat daemon exited unexpectedly (${detail}).`);
      rejectLoop(error);
    });

    ui.setSubmitHandler((submittedValue) => {
      handleSubmittedPrompt(submittedValue);
    });

    if (options.initialPrompt) {
      startPromptSubmission(options.initialPrompt, options.initialImages ?? [], {
        echoPrompt: options.showInitialPromptEcho ?? false,
      });
    }

    await loopDone;
  } finally {
    sessionController.stop();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await requestShutdown();
    await ui.close();
  }
}
