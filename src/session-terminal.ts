import process from "node:process";

import type { AgentSession } from "@mariozechner/pi-coding-agent";

import {
  formatActivityStatus,
  formatEntryDesignator,
  formatQueuedPromptEcho,
  formatUserPromptEcho,
  getMaxStatusTextLength,
  normalizeAssistantText,
  normalizeInlineText,
  renderTerminalMarkdown,
  renderTerminalMarkdownLine,
  truncateInlineText,
  type TerminalRenderState,
} from "./session-formatting.js";
import type { TelemetryRecorder } from "./telemetry-recorder.js";

export { formatActivityStatus, formatEntryDesignator, formatQueuedPromptEcho, formatUserPromptEcho, renderTerminalMarkdown };

const STATUS_SPINNER_FRAMES = ["|", "/", "-", "\\"] as const;
const STATUS_SPINNER_INTERVAL_MS = 80;
const ANSI_DIM = "\x1b[90m";
const ANSI_RESET = "\x1b[0m";

type AgentSessionEvent = Parameters<Parameters<AgentSession["subscribe"]>[0]>[0];

function formatRetryStatus(event: Record<string, unknown>): string {
  const attempt = typeof event.attempt === "number" ? event.attempt : 1;
  const maxAttempts = typeof event.maxAttempts === "number" ? event.maxAttempts : undefined;
  const delayMs = typeof event.delayMs === "number" ? event.delayMs : undefined;
  const attemptText = maxAttempts && maxAttempts >= attempt ? ` ${attempt}/${maxAttempts}` : ` ${attempt}`;
  const delayText = delayMs !== undefined && delayMs > 0 ? ` in ${delayMs}ms` : "";
  return `Retrying${attemptText}${delayText}`;
}

function formatCompactionStatus(event: Record<string, unknown>): string {
  const reason = typeof event.reason === "string" && event.reason.trim().length > 0 ? event.reason.trim() : undefined;
  return reason ? `Compacting context: ${reason}` : "Compacting context";
}

export interface SessionOutputSink {
  appendText(text: string): void;
  appendToolStatus(text: string): void;
  showStatus(text: string): void;
  clearStatus(): void;
  dispose?(): void;
}

export interface StreamingHandle {
  stop(): void;
  clearStatus(): void;
}

function resetAssistantRenderState(state: TerminalRenderState): void {
  state.inCodeBlock = false;
  state.pendingLine = "";
}

function flushAssistantLines(sink: SessionOutputSink, state: TerminalRenderState, force = false): void {
  while (true) {
    const newlineIndex = state.pendingLine.indexOf("\n");
    if (newlineIndex === -1) {
      break;
    }

    const line = state.pendingLine.slice(0, newlineIndex);
    state.pendingLine = state.pendingLine.slice(newlineIndex + 1);
    sink.appendText(`${renderTerminalMarkdownLine(line, state)}\n`);
  }

  if (force && state.pendingLine) {
    sink.appendText(`${renderTerminalMarkdownLine(state.pendingLine, state)}\n`);
    state.pendingLine = "";
  }
}

export function createSessionStreamHandler(
  sink: SessionOutputSink,
  telemetry?: TelemetryRecorder,
): (event: AgentSessionEvent) => void {
  let lastToolName: string | undefined;
  let assistantPrintedText = false;
  const renderState: TerminalRenderState = { inCodeBlock: false, pendingLine: "" };

  return (event) => {
    telemetry?.handleEvent(event);

    if (event.type === "message_start" && event.message.role === "assistant") {
      assistantPrintedText = false;
      lastToolName = undefined;
      resetAssistantRenderState(renderState);
      sink.showStatus("Thinking");
      return;
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_start") {
      sink.showStatus("Thinking");
      return;
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_delta") {
      sink.showStatus("Thinking");
      return;
    }

    if (event.type === "auto_retry_start") {
      const retryStatus = formatRetryStatus(event);
      sink.appendToolStatus(retryStatus);
      sink.showStatus(retryStatus);
      return;
    }

    if (event.type === "auto_retry_end") {
      if (event.success) {
        sink.showStatus("Thinking");
        return;
      }

      const retryStatus = "Retry failed";
      sink.appendToolStatus(retryStatus);
      sink.showStatus(retryStatus);
      return;
    }

    if (event.type === "auto_compaction_start") {
      const compactionStatus = formatCompactionStatus(event);
      sink.appendToolStatus(compactionStatus);
      sink.showStatus(compactionStatus);
      return;
    }

    if (event.type === "auto_compaction_end") {
      if (event.aborted) {
        const abortedStatus = "Compaction aborted";
        sink.appendToolStatus(abortedStatus);
        sink.showStatus(abortedStatus);
        return;
      }

      sink.showStatus(event.willRetry ? "Retrying after compaction" : "Thinking");
      return;
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      assistantPrintedText = true;
      sink.clearStatus();
      renderState.pendingLine += normalizeAssistantText(event.assistantMessageEvent.delta);
      flushAssistantLines(sink, renderState);
      return;
    }

    if (event.type === "tool_execution_start") {
      flushAssistantLines(sink, renderState, true);
      lastToolName = event.toolName;
      const toolStatus = formatActivityStatus(event.toolName, event.args);
      sink.appendToolStatus(toolStatus);
      sink.showStatus(toolStatus);
      return;
    }

    if (event.type === "tool_execution_end" && lastToolName === event.toolName) {
      lastToolName = undefined;
      sink.showStatus("Thinking");
      return;
    }

    if (event.type === "message_end" && event.message.role === "assistant") {
      const errorMessage =
        "errorMessage" in event.message && typeof event.message.errorMessage === "string"
          ? event.message.errorMessage
          : undefined;

      if (!assistantPrintedText && errorMessage) {
        sink.clearStatus();
        sink.appendText(`Assistant error: ${errorMessage}\n`);
      } else if (assistantPrintedText) {
        flushAssistantLines(sink, renderState, true);
      }

      // Keep spinner running — the session may continue with more turns.
      // The caller clears status when the full prompt() resolves.
      sink.showStatus("Thinking");

      assistantPrintedText = false;
      lastToolName = undefined;
      resetAssistantRenderState(renderState);
      return;
    }

    if (event.type === "message_end" && event.message.role === "user") {
      assistantPrintedText = false;
      lastToolName = undefined;
      resetAssistantRenderState(renderState);
    }
  };
}

class ConsoleSessionSink implements SessionOutputSink {
  private cursorAtLineStart = true;
  private statusVisible = false;
  private statusText = "Thinking";
  private spinnerTimer: NodeJS.Timeout | undefined;
  private spinnerFrame = 0;

  appendText(text: string): void {
    this.clearStatus();
    this.writeToConsole(text);
  }

  appendToolStatus(text: string): void {
    this.clearStatus();

    if (!this.cursorAtLineStart) {
      this.writeToConsole("\n");
    }

    const maxLen = getMaxStatusTextLength();
    const oneLine = truncateInlineText(text, maxLen);
    this.writeToConsole(`${ANSI_DIM}${oneLine}${ANSI_RESET}\n`);
  }

  showStatus(nextStatus: string): void {
    const maxLen = getMaxStatusTextLength();
    this.statusText = truncateInlineText(normalizeInlineText(nextStatus || "Thinking"), maxLen) || "Thinking";
    this.renderStatus();

    if (!this.spinnerTimer) {
      this.spinnerTimer = setInterval(() => this.renderStatus(), STATUS_SPINNER_INTERVAL_MS);
    }
  }

  clearStatus(): void {
    this.stopSpinner();

    if (!this.statusVisible) {
      return;
    }

    this.writeToConsole("\r\x1b[2K");
    this.statusVisible = false;
    this.cursorAtLineStart = true;
  }

  dispose(): void {
    this.clearStatus();
  }

  private writeToConsole(text: string): void {
    if (!text) {
      return;
    }

    process.stdout.write(text);
    this.cursorAtLineStart = text.endsWith("\n");
  }

  private stopSpinner(): void {
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = undefined;
    }
  }

  private renderStatus(): void {
    const frame = STATUS_SPINNER_FRAMES[this.spinnerFrame % STATUS_SPINNER_FRAMES.length];
    this.spinnerFrame += 1;

    if (!this.statusVisible && !this.cursorAtLineStart) {
      this.writeToConsole("\n");
    }

    this.writeToConsole(`\r\x1b[2K${ANSI_DIM}${frame} ${this.statusText || "Thinking"}${ANSI_RESET}`);
    this.statusVisible = true;
    this.cursorAtLineStart = false;
  }
}

export function attachSessionStreaming(
  session: AgentSession,
  sink: SessionOutputSink,
  telemetry?: TelemetryRecorder,
): StreamingHandle {
  const unsubscribe = session.subscribe(createSessionStreamHandler(sink, telemetry));
  return {
    stop() {
      unsubscribe();
      sink.dispose?.();
    },
    clearStatus() {
      sink.clearStatus();
    },
  };
}

export function attachConsoleStreaming(session: AgentSession, telemetry?: TelemetryRecorder): StreamingHandle {
  return attachSessionStreaming(session, new ConsoleSessionSink(), telemetry);
}
