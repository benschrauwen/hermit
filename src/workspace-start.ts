import { spawn, type ChildProcessByStdio } from "node:child_process";
import process from "node:process";
import type { Readable } from "node:stream";

import type { AgentSession } from "@mariozechner/pi-coding-agent";
import {
  CombinedAutocompleteProvider,
  Editor,
  Key,
  ProcessTerminal,
  TUI,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
  type Focusable,
} from "@mariozechner/pi-tui";

import { createSessionStreamHandler, formatEntryDesignator, formatUserPromptEcho, type SessionOutputSink } from "./session-terminal.js";
import type { InteractiveChatSession, RoleSwitchRequest } from "./session-types.js";
import type { TelemetryRecorder } from "./telemetry-recorder.js";
import { formatWorkspaceTurnOwner, runInteractiveSessionTurn } from "./turn-control.js";

const ANSI_BOLD = "\x1b[1m";
const ANSI_DIM = "\x1b[90m";
const ANSI_RESET = "\x1b[0m";
const ANSI_BRIGHT_MAGENTA = "\x1b[95m";
const ANSI_CONTROL_SEQUENCE_PATTERN = /\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\x1B\\))/y;

const STATUS_SPINNER_FRAMES = ["|", "/", "-", "\\"] as const;
const STATUS_SPINNER_INTERVAL_MS = 80;

const DEFAULT_EXPLORER_PORT = 4321;
const DEFAULT_EXPLORER_URL = `http://localhost:${DEFAULT_EXPLORER_PORT}`;
const CHILD_STOP_TIMEOUT_MS = 15_000;
const MIN_HEARTBEAT_HEIGHT = 1;
const MIN_CHAT_HEIGHT = 4;

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
  onRoleSwitch?: (request: RoleSwitchRequest, previousRoleLabel: string) => Promise<InteractiveChatSession>;
}

interface ChildProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

export function resolveWorkspaceStartLayout(totalRows: number): {
  heartbeatHeight: number;
  chatHeight: number;
} {
  const safeTotalRows = Math.max(3, Math.floor(totalRows));
  const dividerHeight = 1;
  const preferredChatHeight =
    safeTotalRows >= MIN_HEARTBEAT_HEIGHT + MIN_CHAT_HEIGHT + dividerHeight
      ? MIN_CHAT_HEIGHT
      : Math.max(1, Math.ceil(safeTotalRows * 0.55));
  const heartbeatCeiling = Math.max(1, safeTotalRows - preferredChatHeight - dividerHeight);
  const heartbeatHeight = Math.max(
    1,
    Math.min(Math.max(1, Math.floor(safeTotalRows * 0.32)), heartbeatCeiling),
  );

  return {
    heartbeatHeight,
    chatHeight: Math.max(1, safeTotalRows - heartbeatHeight - dividerHeight),
  };
}

export function extractExplorerUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s]*/i);
  return match?.[0];
}

function normalizeChatInput(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isExitCommand(input: string): boolean {
  const command = input.trim();
  return command === "/exit" || command === "/quit";
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /\babort(?:ed|ing)?\b/i.test(message);
}

function colorize(code: string, text: string): string {
  return `${code}${text}${ANSI_RESET}`;
}

function matchAnsiControlSequence(text: string, index: number): string | undefined {
  ANSI_CONTROL_SEQUENCE_PATTERN.lastIndex = index;
  return ANSI_CONTROL_SEQUENCE_PATTERN.exec(text)?.[0];
}

function isEraseLineSequence(sequence: string): boolean {
  return /^\x1b\[(?:0|2)?K$/.test(sequence);
}

function appendWrappedAnsiLine(target: string[], line: string, width: number): void {
  if (line.length === 0) {
    target.push("");
    return;
  }

  target.push(...wrapTextWithAnsi(line, width));
}

export function renderAnsiTextBlock(text: string, width: number): string[] {
  if (!text) {
    return [];
  }

  const safeWidth = Math.max(1, width);
  const rendered: string[] = [];
  let currentLine = "";
  let carriageReturnPending = false;

  for (let index = 0; index < text.length; ) {
    const currentChar = text[index];

    if (currentChar === "\r" && text[index + 1] === "\n") {
      appendWrappedAnsiLine(rendered, currentLine, safeWidth);
      currentLine = "";
      carriageReturnPending = false;
      index += 2;
      continue;
    }

    const ansiSequence = currentChar === "\x1b" ? matchAnsiControlSequence(text, index) : undefined;
    if (ansiSequence) {
      if (isEraseLineSequence(ansiSequence)) {
        currentLine = "";
        carriageReturnPending = false;
      } else {
        if (carriageReturnPending) {
          currentLine = "";
          carriageReturnPending = false;
        }
        currentLine += ansiSequence;
      }
      index += ansiSequence.length;
      continue;
    }

    if (currentChar === "\r") {
      carriageReturnPending = true;
      index += 1;
      continue;
    }

    if (currentChar === "\n") {
      appendWrappedAnsiLine(rendered, currentLine, safeWidth);
      currentLine = "";
      carriageReturnPending = false;
      index += 1;
      continue;
    }

    if (carriageReturnPending) {
      // Heartbeat status redraws use CR-based line replacement.
      currentLine = "";
      carriageReturnPending = false;
    }

    currentLine += currentChar;
    index += 1;
  }

  if (currentLine.length > 0) {
    appendWrappedAnsiLine(rendered, currentLine, safeWidth);
  }

  if (text.endsWith("\n")) {
    rendered.push("");
  }

  return rendered;
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

class AnsiTextBuffer implements Component {
  private text = "";
  private cachedText: string | undefined;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  appendText(text: string): void {
    if (!text) {
      return;
    }

    this.text += text;
    this.invalidate();
  }

  invalidate(): void {
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    if (this.cachedText === this.text && this.cachedWidth === width && this.cachedLines) {
      return this.cachedLines;
    }

    const lines = renderAnsiTextBlock(this.text, width);
    this.cachedText = this.text;
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }
}

class StatusLine implements Component {
  private message: string | undefined;
  private spinnerFrame = 0;
  private spinnerTimer: NodeJS.Timeout | undefined;

  constructor(private readonly onChange: () => void) {}

  setMessage(message: string): void {
    const normalized = message.replace(/\r\n/g, " ").replace(/\r/g, " ").replace(/\s+/g, " ").trim() || "Thinking";
    this.message = normalized;

    if (!this.spinnerTimer) {
      this.spinnerTimer = setInterval(() => {
        this.spinnerFrame += 1;
        this.onChange();
      }, STATUS_SPINNER_INTERVAL_MS);
    }

    this.onChange();
  }

  clear(): void {
    this.message = undefined;
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = undefined;
    }
    this.onChange();
  }

  invalidate(): void {}

  render(width: number): string[] {
    if (!this.message) {
      return [];
    }

    const frame = STATUS_SPINNER_FRAMES[this.spinnerFrame % STATUS_SPINNER_FRAMES.length];
    return [truncateToWidth(colorize(ANSI_DIM, `${frame} ${this.message}`), Math.max(1, width))];
  }
}

const editorTheme = {
  borderColor: (text: string) => colorize(ANSI_DIM, text),
  selectList: {
    selectedPrefix: (text: string) => colorize(ANSI_BRIGHT_MAGENTA, text),
    selectedText: (text: string) => colorize(ANSI_BRIGHT_MAGENTA, text),
    description: (text: string) => colorize(ANSI_DIM, text),
    scrollInfo: (text: string) => colorize(ANSI_DIM, text),
    noMatch: (text: string) => colorize(ANSI_DIM, text),
  },
};

class RoleLabeledEditor extends Editor {
  private roleLabel: string;

  constructor(tui: TUI, roleLabel: string) {
    super(tui, editorTheme, { paddingX: 1, autocompleteMaxVisible: 6 });
    this.roleLabel = roleLabel;
  }

  setRoleLabel(roleLabel: string): void {
    if (this.roleLabel === roleLabel) {
      return;
    }

    this.roleLabel = roleLabel;
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length === 0 || lines[0]?.includes("↑")) {
      return lines;
    }

    const label = `${formatEntryDesignator(this.roleLabel)} `;
    const suffixWidth = Math.max(0, width - visibleWidth(label));
    lines[0] = `${label}${this.borderColor("─".repeat(suffixWidth))}`;
    return lines;
  }
}

class WorkspaceStartLayout implements Component, Focusable {
  private readonly heartbeatLog = new AnsiTextBuffer();
  private readonly transcript = new AnsiTextBuffer();
  private readonly status: StatusLine;
  private readonly editor: RoleLabeledEditor;
  private activeRoleLabel: string;
  private modelLabel: string;
  private explorerStatus = `starting on ${DEFAULT_EXPLORER_URL}`;

  private _focused = false;

  constructor(private readonly tui: TUI, activeRoleLabel: string, modelLabel: string) {
    this.activeRoleLabel = activeRoleLabel;
    this.modelLabel = modelLabel;
    this.status = new StatusLine(() => this.tui.requestRender());
    this.editor = new RoleLabeledEditor(this.tui, activeRoleLabel);
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
    const header = renderHeader(
      `${ANSI_BOLD}Heartbeat daemon${ANSI_RESET}`,
      `Explorer ${this.explorerStatus}`,
      width,
    );
    const bodyHeight = Math.max(0, height - 1);
    const bodyLines = this.heartbeatLog.render(width).slice(-bodyHeight);
    return [header, ...bodyLines, ...createBlankLines(bodyHeight - bodyLines.length)];
  }

  private renderChatPane(width: number, height: number): string[] {
    const header = renderHeader(
      `${ANSI_BOLD}Chat${ANSI_RESET}`,
      `model ${this.modelLabel} | Ctrl-C exits and cancels live sessions`,
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

  private pendingSubmit:
    | {
        resolve: (value: string) => void;
        reject: (error: Error) => void;
      }
    | undefined;
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
      if (!this.pendingSubmit) {
        return;
      }

      if (submittedValue.trim().length > 0) {
        editor.addToHistory(submittedValue);
      }
      editor.disableSubmit = true;

      const pendingSubmit = this.pendingSubmit;
      this.pendingSubmit = undefined;
      pendingSubmit.resolve(submittedValue);
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

  setShutdownHandler(handler: () => Promise<void>): void {
    this.shutdownHandler = handler;
  }

  async readInput(): Promise<string> {
    if (this.pendingSubmit) {
      throw new Error("A chat submission is already pending.");
    }

    const editor = this.layout.getEditor();
    editor.disableSubmit = false;
    this.tui.setFocus(this.layout);
    this.tui.requestRender();

    return new Promise<string>((resolve, reject) => {
      this.pendingSubmit = { resolve, reject };
    });
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

    if (this.pendingSubmit) {
      const pendingSubmit = this.pendingSubmit;
      this.pendingSubmit = undefined;
      editor.setText("");
      pendingSubmit.resolve("/exit");
    }

    if (this.shutdownHandler) {
      void this.shutdownHandler();
    }
  }

  appendHeartbeatOutput(text: string): void {
    this.layout.appendHeartbeatOutput(text);
  }

  appendUserPrompt(prompt: string): void {
    this.appendText(formatUserPromptEcho(prompt, this.layout.getActiveRoleLabel()));
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

    if (this.pendingSubmit) {
      this.pendingSubmit.reject(new Error("Workspace start UI closed before input submission."));
      this.pendingSubmit = undefined;
    }

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

  let activeSession = options.initialSession;
  const ui = new WorkspaceStartTui(activeSession.activeRoleLabel, activeSession.modelLabel);
  let stopStreaming = attachWorkspaceStartStreaming(activeSession.session, ui, activeSession.telemetry);
  let explorerProcess: ManagedChildProcess | undefined;
  let heartbeatProcess: ManagedChildProcess | undefined;
  let shutdownRequested = false;
  let shutdownPromise: Promise<void> | undefined;
  let explorerReadyNotified = false;
  let explorerUrl = DEFAULT_EXPLORER_URL;

  const requestShutdown = async (): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownRequested = true;
    ui.setExplorerStatus("stopping...");
    ui.clearStatus();

    shutdownPromise = (async () => {
      const results = await Promise.allSettled([
        activeSession.session.abort(),
        heartbeatProcess?.stop(),
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
  ui.appendSystemNotice(`Using model ${activeSession.modelLabel}.`);
  ui.setExplorerStatus(`starting on ${DEFAULT_EXPLORER_URL}`);

  const onSignal = (signal: NodeJS.Signals) => {
    ui.requestShutdown(`Received ${signal}. Stopping Hermit and canceling live sessions...`);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  async function switchRolesIfRequested(): Promise<void> {
    let switchCount = 0;
    while (true) {
      const request = activeSession.consumeRoleSwitchRequest();
      if (!request || !options.onRoleSwitch || shutdownRequested) {
        return;
      }

      switchCount += 1;
      if (switchCount > 5) {
        throw new Error("Too many role switches were requested in a single turn.");
      }

      if (request.roleId === activeSession.activeRoleLabel) {
        ui.appendSystemNotice(`Ignored redundant role switch to ${activeSession.activeRoleLabel}.`);
        return;
      }

      const previousRoleLabel = activeSession.activeRoleLabel;
      stopStreaming();
      activeSession = await options.onRoleSwitch(request, previousRoleLabel);
      ui.setActiveSession(activeSession.activeRoleLabel, activeSession.modelLabel);
      stopStreaming = attachWorkspaceStartStreaming(activeSession.session, ui, activeSession.telemetry);
      ui.appendSystemNotice(`Switched active role to ${activeSession.activeRoleLabel} using ${activeSession.modelLabel}.`);
      return;
    }
  }

  async function promptActiveSession(prompt: string, imagePaths: string[] = []): Promise<void> {
    try {
      let waitingStatusShown = false;
      await runInteractiveSessionTurn({
        root: options.workspaceRoot,
        roleId: activeSession.activeRoleLabel,
        session: activeSession.session,
        prompt,
        imagePaths,
        ...(options.gitCheckpointsEnabled !== undefined ? { gitCheckpointsEnabled: options.gitCheckpointsEnabled } : {}),
        onWaitForTurn: (owner) => {
          if (waitingStatusShown) {
            return;
          }
          waitingStatusShown = true;
          ui.showStatus(`Waiting for ${formatWorkspaceTurnOwner(owner)} to finish`);
        },
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

    await switchRolesIfRequested();
    ui.clearStatus();
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

    heartbeatProcess = spawnManagedProcess({
      cwd: options.frameworkRoot,
      command: "npm",
      args: [
        "run",
        "cli",
        "--",
        "heartbeat-daemon",
        "--interval",
        options.heartbeatInterval,
        ...(options.initialHeartbeatDelay ? ["--initial-delay", options.initialHeartbeatDelay] : []),
        ...(options.continueHeartbeatSessions ? ["--continue"] : []),
        ...(options.gitCheckpointsEnabled === false ? ["--no-git-checkpoints"] : []),
      ],
      env: {
        HERMIT_WORKSPACE_ROOT: options.workspaceRoot,
      },
      onText: (text) => {
        ui.appendHeartbeatOutput(text);
      },
      onResult: (result) => {
        if (!shutdownRequested) {
          ui.appendHeartbeatOutput(`\n[supervisor] Heartbeat daemon exited (${formatChildProcessResult(result)}).\n`);
          ui.appendSystemNotice(`Heartbeat daemon exited unexpectedly (${formatChildProcessResult(result)}).`);
        }
      },
    });

    if (options.initialPrompt) {
      await promptActiveSession(options.initialPrompt, options.initialImages ?? []);
      if (shutdownRequested) {
        return;
      }
    }

    while (!shutdownRequested) {
      const input = normalizeChatInput(await ui.readInput());
      if (!input.trim()) {
        continue;
      }

      if (isExitCommand(input)) {
        ui.requestShutdown("Shutting down Hermit.");
        break;
      }

      ui.appendUserPrompt(input);
      await promptActiveSession(input);
    }
  } finally {
    stopStreaming();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await requestShutdown();
    await ui.close();
  }
}
