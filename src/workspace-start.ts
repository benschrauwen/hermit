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
import {
  createHeartbeatDaemonController,
  parseHeartbeatDaemonInterval,
} from "./heartbeat-daemon.js";
import {
  InteractiveSessionController,
  isExitCommand,
  normalizeChatInput,
  type InteractiveSessionStreamingHandle,
} from "./interactive-session-controller.js";
import { formatQueuedPromptEcho, formatUserPromptEcho } from "./session-formatting.js";
import { createSessionStreamHandler, type SessionOutputSink } from "./session-terminal.js";
import {
  renderSessionHistoryToSink,
  sessionHasTranscriptHistory,
} from "./session-transcript-replay.js";
import type { InteractiveChatSession } from "./session-runtime.js";
import { formatTelegramInboundPrompt, resolveTelegramBridgeStatus, TelegramPollingBridge } from "./telegram.js";
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
import {
  isBracketedPasteInput,
  isPasteShortcut,
  readSystemClipboardText,
  wrapBracketedPaste,
  writeSystemClipboardText,
} from "./tui-clipboard.js";
import {
  clampSelectionColumn,
  extractSelectedText,
  highlightSelectionLine,
  normalizeSelectionRange,
  selectionIsEmpty,
  type SelectionPoint,
  type SelectionRange,
} from "./tui-selection.js";
import {
  MOUSE_TRACKING_DISABLE,
  MOUSE_TRACKING_ENABLE,
  clampScrollFromBottom,
  isSgrMouseEvent,
  parseMouseWheelEvent,
  parseSgrMouseButtonEvent,
  scrollDeltaForWheel,
  sliceScrollableLines,
  type SgrMouseButtonEvent,
} from "./tui-scroll.js";
import {
  createWorkspaceTurnCoordinator,
  formatWorkspaceTurnOwner,
  type WorkspaceTurnCoordinator,
} from "./turn-control.js";
import {
  extractExplorerUrl,
  renderAnsiTextBlock,
  resolveWorkspaceStartLayout,
} from "./workspace-start-display.js";

interface HeartbeatPaneGeometry {
  bodyStartRow: number;
  bodyHeight: number;
}

interface ChatPaneGeometry {
  startRow: number;
  transcriptStartRow: number;
  transcriptHeight: number;
}

export { extractExplorerUrl, formatHeartbeatHeaderDetail, renderAnsiTextBlock, resolveWorkspaceStartLayout };

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

function formatHeartbeatHeaderDetail(
  explorerStatus: string,
  tailscaleStatus?: string,
  telegramStatus?: string,
): string {
  return [
    `Explorer ${explorerStatus}`,
    ...(tailscaleStatus ? [`Tailscale ${tailscaleStatus}`] : []),
    ...(telegramStatus ? [`Telegram ${telegramStatus}`] : []),
  ].join(" | ");
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
  private telegramStatus: string | undefined;
  private queuedFollowUpCount = 0;
  private heartbeatScrollFromBottom = 0;
  private transcriptScrollFromBottom = 0;
  private lastHeartbeatPaneGeometry: HeartbeatPaneGeometry | undefined;
  private lastChatPaneGeometry: ChatPaneGeometry | undefined;
  private lastHeartbeatVisibleLines: string[] = [];
  private lastTranscriptVisibleLines: string[] = [];
  private selectionAnchor: SelectionPoint | null = null;
  private selectionActive: SelectionPoint | null = null;

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

  setTelegramStatus(status: string | undefined): void {
    const normalized = status?.trim() || undefined;
    if (this.telegramStatus === normalized) {
      return;
    }

    this.telegramStatus = normalized;
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
    if (this.heartbeatScrollFromBottom === 0) {
      this.tui.requestRender();
      return;
    }

    const width = Math.max(1, this.tui.terminal.columns);
    const heartbeatLines = this.heartbeatLog.render(width);
    const viewportHeight = this.lastHeartbeatPaneGeometry?.bodyHeight ?? 0;
    this.heartbeatScrollFromBottom = clampScrollFromBottom(
      this.heartbeatScrollFromBottom,
      heartbeatLines.length,
      viewportHeight,
    );
    this.tui.requestRender();
  }

  scrollHeartbeat(deltaLines: number): void {
    if (deltaLines === 0) {
      return;
    }

    const width = Math.max(1, this.tui.terminal.columns);
    const heartbeatLines = this.heartbeatLog.render(width);
    const viewportHeight = this.lastHeartbeatPaneGeometry?.bodyHeight ?? 0;
    this.heartbeatScrollFromBottom = clampScrollFromBottom(
      this.heartbeatScrollFromBottom + deltaLines,
      heartbeatLines.length,
      viewportHeight,
    );
    this.tui.requestRender();
  }

  scrollHeartbeatToBottom(): void {
    if (this.heartbeatScrollFromBottom === 0) {
      return;
    }
    this.heartbeatScrollFromBottom = 0;
    this.tui.requestRender();
  }

  getHeartbeatScrollHint(): string | undefined {
    if (this.heartbeatScrollFromBottom === 0) {
      return undefined;
    }
    return `${this.heartbeatScrollFromBottom} line${this.heartbeatScrollFromBottom === 1 ? "" : "s"} above end`;
  }

  handleSelectionMouse(event: SgrMouseButtonEvent): void {
    const point = this.resolveSelectionPoint(event.row, event.column);
    if (!point) {
      if (event.action === "press") {
        this.clearSelection();
      } else if (event.action === "release") {
        this.finishSelection();
      }
      this.tui.requestRender();
      return;
    }

    switch (event.action) {
      case "press":
        this.selectionAnchor = point;
        this.selectionActive = point;
        break;
      case "drag":
        if (this.selectionAnchor) {
          this.selectionActive = point;
        }
        break;
      case "release":
        if (this.selectionAnchor) {
          this.selectionActive = point;
        }
        this.finishSelection();
        break;
    }

    this.tui.requestRender();
  }

  private clearSelection(): void {
    this.selectionAnchor = null;
    this.selectionActive = null;
  }

  private finishSelection(): void {
    const range = this.getSelectionRange();
    if (range && !selectionIsEmpty(range)) {
      const lines =
        range.pane === "heartbeat" ? this.lastHeartbeatVisibleLines : this.lastTranscriptVisibleLines;
      const text = extractSelectedText(lines, range);
      if (text.length > 0) {
        void writeSystemClipboardText(text);
      }
    }
  }

  private getSelectionRange(): SelectionRange | undefined {
    if (!this.selectionAnchor || !this.selectionActive) {
      return undefined;
    }
    return normalizeSelectionRange(this.selectionAnchor, this.selectionActive);
  }

  private resolveSelectionPoint(row: number, column: number): SelectionPoint | undefined {
    const terminalRow = row - 1;

    if (this.isRowInHeartbeatRegion(row)) {
      const geometry = this.lastHeartbeatPaneGeometry;
      if (!geometry) {
        return undefined;
      }
      const line = terminalRow - geometry.bodyStartRow;
      const visibleLine = this.lastHeartbeatVisibleLines[line] ?? "";
      return {
        pane: "heartbeat",
        line,
        col: clampSelectionColumn(visibleLine, column - 1),
      };
    }

    if (this.isRowInTranscriptRegion(row)) {
      const geometry = this.lastChatPaneGeometry;
      if (!geometry) {
        return undefined;
      }
      const line = terminalRow - geometry.transcriptStartRow;
      const visibleLine = this.lastTranscriptVisibleLines[line] ?? "";
      return {
        pane: "transcript",
        line,
        col: clampSelectionColumn(visibleLine, column - 1),
      };
    }

    return undefined;
  }

  private applySelectionHighlight(lines: readonly string[], pane: SelectionPoint["pane"]): string[] {
    const range = this.getSelectionRange();
    if (!range || range.pane !== pane) {
      return [...lines];
    }
    return lines.map((line, index) => highlightSelectionLine(line, index, range));
  }

  isRowInHeartbeatRegion(row: number): boolean {
    const geometry = this.lastHeartbeatPaneGeometry;
    if (!geometry || geometry.bodyHeight <= 0) {
      return false;
    }
    // Mouse coordinates are 1-based; layout rows are 0-based.
    const terminalRow = row - 1;
    return (
      terminalRow >= geometry.bodyStartRow &&
      terminalRow < geometry.bodyStartRow + geometry.bodyHeight
    );
  }

  clearChatTranscript(): void {
    this.transcript.setText("");
    this.transcriptScrollFromBottom = 0;
    this.tui.requestRender();
  }

  appendChatText(text: string): void {
    this.transcript.appendText(text);
    if (this.transcriptScrollFromBottom === 0) {
      this.tui.requestRender();
      return;
    }

    const width = Math.max(1, this.tui.terminal.columns);
    const transcriptLines = this.transcript.render(width);
    const viewportHeight = this.lastChatPaneGeometry?.transcriptHeight ?? 0;
    this.transcriptScrollFromBottom = clampScrollFromBottom(
      this.transcriptScrollFromBottom,
      transcriptLines.length,
      viewportHeight,
    );
    this.tui.requestRender();
  }

  scrollTranscript(deltaLines: number): void {
    if (deltaLines === 0) {
      return;
    }

    const width = Math.max(1, this.tui.terminal.columns);
    const transcriptLines = this.transcript.render(width);
    const viewportHeight = this.lastChatPaneGeometry?.transcriptHeight ?? 0;
    this.transcriptScrollFromBottom = clampScrollFromBottom(
      this.transcriptScrollFromBottom + deltaLines,
      transcriptLines.length,
      viewportHeight,
    );
    this.tui.requestRender();
  }

  scrollTranscriptToBottom(): void {
    if (this.transcriptScrollFromBottom === 0) {
      return;
    }
    this.transcriptScrollFromBottom = 0;
    this.tui.requestRender();
  }

  isTranscriptFollowing(): boolean {
    return this.transcriptScrollFromBottom === 0;
  }

  getTranscriptScrollHint(): string | undefined {
    if (this.transcriptScrollFromBottom === 0) {
      return undefined;
    }
    return `${this.transcriptScrollFromBottom} line${this.transcriptScrollFromBottom === 1 ? "" : "s"} above end · End to follow`;
  }

  isRowInTranscriptRegion(row: number): boolean {
    const geometry = this.lastChatPaneGeometry;
    if (!geometry || geometry.transcriptHeight <= 0) {
      return false;
    }
    // Mouse coordinates are 1-based; layout rows are 0-based.
    const terminalRow = row - 1;
    return (
      terminalRow >= geometry.transcriptStartRow &&
      terminalRow < geometry.transcriptStartRow + geometry.transcriptHeight
    );
  }

  getTranscriptPageSize(): number {
    return Math.max(1, this.lastChatPaneGeometry?.transcriptHeight ?? 1);
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
    const chatPaneStartRow = heartbeatHeight + 1;

    return [
      ...this.renderHeartbeatPane(width, heartbeatHeight),
      truncateToWidth(divider, Math.max(1, width)),
      ...this.renderChatPane(width, chatHeight, chatPaneStartRow),
    ];
  }

  private renderHeartbeatPane(width: number, height: number): string[] {
    const scrollHint = this.getHeartbeatScrollHint();
    const detail = [
      formatHeartbeatHeaderDetail(this.explorerStatus, this.tailscaleStatus, this.telegramStatus),
      ...(scrollHint ? [scrollHint] : []),
    ].join(" | ");
    const header = renderHeader(
      `${ANSI_BOLD}Heartbeat daemon${ANSI_RESET}`,
      detail,
      width,
    );
    const bodyHeight = Math.max(0, height - 1);
    const allBodyLines = this.heartbeatLog.render(width);
    this.heartbeatScrollFromBottom = clampScrollFromBottom(
      this.heartbeatScrollFromBottom,
      allBodyLines.length,
      bodyHeight,
    );
    const bodyLines = sliceScrollableLines(allBodyLines, bodyHeight, this.heartbeatScrollFromBottom);
    const bodyPadding = Math.max(0, bodyHeight - bodyLines.length);
    const paddedBodyLines = [...createBlankLines(bodyPadding), ...bodyLines];
    this.lastHeartbeatVisibleLines = paddedBodyLines;

    this.lastHeartbeatPaneGeometry = {
      bodyStartRow: 1,
      bodyHeight,
    };

    const highlightedBodyLines = this.applySelectionHighlight(paddedBodyLines, "heartbeat");
    return [header, ...highlightedBodyLines];
  }

  private renderChatPane(width: number, height: number, paneStartRow: number): string[] {
    const scrollHint = this.getTranscriptScrollHint();
    const detail = [
      `model ${this.modelLabel}`,
      ...(this.queuedFollowUpCount > 0
        ? [`${this.queuedFollowUpCount} queued follow-up${this.queuedFollowUpCount === 1 ? "" : "s"}`]
        : []),
      ...(scrollHint ? [scrollHint] : []),
      "wheel/drag scroll · drag select · End follow · Ctrl-C exit",
    ].join(" | ");
    const header = renderHeader(
      `${ANSI_BOLD}Chat${ANSI_RESET}`,
      detail,
      width,
    );

    if (height <= 1) {
      this.lastChatPaneGeometry = {
        startRow: paneStartRow,
        transcriptStartRow: paneStartRow + 1,
        transcriptHeight: 0,
      };
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
    const allTranscriptLines = this.transcript.render(width);
    this.transcriptScrollFromBottom = clampScrollFromBottom(
      this.transcriptScrollFromBottom,
      allTranscriptLines.length,
      transcriptHeight,
    );
    const transcriptLines = sliceScrollableLines(allTranscriptLines, transcriptHeight, this.transcriptScrollFromBottom);
    const transcriptPadding = Math.max(0, transcriptHeight - transcriptLines.length);
    const paddedTranscriptLines = [...createBlankLines(transcriptPadding), ...transcriptLines];
    this.lastTranscriptVisibleLines = paddedTranscriptLines;

    this.lastChatPaneGeometry = {
      startRow: paneStartRow,
      transcriptStartRow: paneStartRow + 1 + transcriptPadding,
      transcriptHeight,
    };

    const highlightedTranscriptLines = this.applySelectionHighlight(paddedTranscriptLines, "transcript");

    return [
      header,
      ...highlightedTranscriptLines,
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

      // Let bracketed paste reach the editor; do not treat it as scroll/mouse input.
      if (isBracketedPasteInput(data)) {
        return undefined;
      }

      if (isPasteShortcut(data)) {
        void this.pasteClipboardIntoEditor(editor);
        return { consume: true };
      }

      const scrollResult = this.handleTranscriptScrollInput(data, editor);
      if (scrollResult?.consume) {
        return scrollResult;
      }

      const wheel = parseMouseWheelEvent(data);
      if (wheel) {
        if (this.layout.isRowInHeartbeatRegion(wheel.row)) {
          this.layout.scrollHeartbeat(scrollDeltaForWheel(wheel.direction));
          return { consume: true };
        }
        if (this.layout.isRowInTranscriptRegion(wheel.row)) {
          this.layout.scrollTranscript(scrollDeltaForWheel(wheel.direction));
          return { consume: true };
        }
      }

      const button = parseSgrMouseButtonEvent(data);
      if (button) {
        if (
          this.layout.isRowInHeartbeatRegion(button.row) ||
          this.layout.isRowInTranscriptRegion(button.row)
        ) {
          this.layout.handleSelectionMouse(button);
        }
        return { consume: true };
      }

      if (isSgrMouseEvent(data)) {
        return { consume: true };
      }

      return undefined;
    });

    this.terminal.setTitle(`Hermit start: ${activeRoleLabel}`);
    this.tui.start();
    this.terminal.write(MOUSE_TRACKING_ENABLE);
  }

  private async pasteClipboardIntoEditor(editor: RoleLabeledEditor): Promise<void> {
    const text = await readSystemClipboardText();
    if (!text) {
      return;
    }

    editor.handleInput(wrapBracketedPaste(text));
    this.tui.requestRender();
  }

  private handleTranscriptScrollInput(
    data: string,
    editor: RoleLabeledEditor,
  ): { consume: boolean } | undefined {
    const editorEmpty = editor.getExpandedText().length === 0;
    const pageLines = this.layout.getTranscriptPageSize();
    const lineStep = Math.max(1, Math.floor(pageLines / 2));

    if (matchesKey(data, Key.end) || matchesKey(data, Key.ctrl("g"))) {
      this.layout.scrollTranscriptToBottom();
      return { consume: true };
    }

    if (editorEmpty && matchesKey(data, Key.pageUp)) {
      this.layout.scrollTranscript(pageLines);
      return { consume: true };
    }
    if (editorEmpty && matchesKey(data, Key.pageDown)) {
      this.layout.scrollTranscript(-pageLines);
      return { consume: true };
    }

    if (matchesKey(data, Key.alt("u")) || matchesKey(data, Key.alt("up"))) {
      this.layout.scrollTranscript(lineStep);
      return { consume: true };
    }
    if (matchesKey(data, Key.alt("d")) || matchesKey(data, Key.alt("down"))) {
      this.layout.scrollTranscript(-lineStep);
      return { consume: true };
    }

    if (matchesKey(data, Key.shift("pageUp")) || matchesKey(data, Key.alt("pageUp"))) {
      this.layout.scrollTranscript(pageLines);
      return { consume: true };
    }
    if (matchesKey(data, Key.shift("pageDown")) || matchesKey(data, Key.alt("pageDown"))) {
      this.layout.scrollTranscript(-pageLines);
      return { consume: true };
    }

    return undefined;
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

  setTelegramStatus(status: string | undefined): void {
    this.layout.setTelegramStatus(status);
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
    this.layout.scrollTranscriptToBottom();

    if (options.queued) {
      this.appendText(formatQueuedPromptEcho(prompt));
      return;
    }

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

  replaySessionHistory(session: InteractiveChatSession): number {
    const restoredCount = renderSessionHistoryToSink(session.session, this, session.activeRoleLabel);
    if (restoredCount > 0) {
      this.layout.scrollTranscriptToBottom();
    }
    return restoredCount;
  }

  clearChatTranscript(): void {
    this.layout.clearChatTranscript();
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

    this.terminal.write(MOUSE_TRACKING_DISABLE);
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

  const telegramStatus = resolveTelegramBridgeStatus();
  const ui = new WorkspaceStartTui(options.initialSession.activeRoleLabel, options.initialSession.modelLabel);
  const heartbeatSessionSink = new WorkspaceStartHeartbeatSink(ui);
  let explorerProcess: ManagedChildProcess | undefined;
  let telegramBridge: TelegramPollingBridge | undefined;
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
      ui.clearChatTranscript();
      const restoredCount = ui.replaySessionHistory(session);
      ui.appendSystemNotice(`Switched active role to ${session.activeRoleLabel} using ${session.modelLabel}.`);
      if (restoredCount > 0) {
        ui.appendSystemNotice(
          `Restored ${restoredCount} earlier message${restoredCount === 1 ? "" : "s"}. PgUp/PgDn scroll the transcript.`,
        );
      }
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
    onQueuedFollowUpStart: (prompt) => {
      ui.appendUserPrompt(prompt);
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
        telegramBridge?.stop(),
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
  const initialSession = sessionController.getActiveSession();
  if (sessionHasTranscriptHistory(initialSession.session)) {
    const restoredCount = ui.replaySessionHistory(initialSession);
    if (restoredCount > 0) {
      ui.appendSystemNotice(
        `Restored ${restoredCount} earlier message${restoredCount === 1 ? "" : "s"}. PgUp/PgDn scroll the transcript.`,
      );
    }
  }

  ui.appendSystemNotice(`Using model ${initialSession.modelLabel}.`);
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
  if (telegramStatus.kind === "misconfigured") {
    ui.appendSystemNotice(`Telegram integration disabled: ${telegramStatus.issues.join(" ")}`);
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

        startPromptSubmission(nextPrompt.prompt);
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

    if (telegramStatus.kind === "configured") {
      telegramBridge = new TelegramPollingBridge({
        workspaceRoot: options.workspaceRoot,
        config: telegramStatus.config,
        onReady: () => {
          ui.setTelegramStatus("connected");
        },
        onMessage: (message) => {
          if (shutdownRequested) {
            return;
          }
          handleSubmittedPrompt(formatTelegramInboundPrompt(message));
        },
        onInfo: (message) => {
          ui.appendSystemNotice(message);
        },
        onError: (message) => {
          ui.appendSystemNotice(message);
        },
      });
      telegramBridge.start();
    }

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
