import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { CheckpointOutcome } from "./git.js";
import { createTelemetryEventCommon } from "./telemetry-events.js";
import type { StoredTelemetryEvent } from "./telemetry-events.js";
import { getNumber, getString, isRecord } from "./type-guards.js";
import type { TelemetrySessionContext } from "./types.js";

interface ActiveTurnState {
  id: string;
  startedAtMs: number;
  firstTokenAtMs?: number | undefined;
  toolCallCount: number;
  toolErrorCount: number;
  assistantTextChars: number;
  assistantError: boolean;
  retryCount: number;
  compactionCount: number;
}

interface ActiveToolState {
  turnId?: string | undefined;
  startedAtMs: number;
}

interface RecorderStats {
  turnCount: number;
  toolCallCount: number;
  toolErrorCount: number;
  assistantErrorTurnCount: number;
  silentTurnCount: number;
  retryCount: number;
  compactionCount: number;
}

interface GitSessionEndContext {
  gitHeadAtEnd?: string;
  checkpointAfterSha?: string;
  commandOutcome?: CheckpointOutcome;
}

function truncateText(value: string, maxLength = 500): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function extractErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return truncateText(value.trim());
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const direct = getString(value.errorMessage);
  if (direct) {
    return truncateText(direct.trim());
  }

  const stderr = getString(value.stderr);
  if (stderr) {
    return truncateText(stderr.trim());
  }

  const message = getString(value.message);
  if (message) {
    return truncateText(message.trim());
  }

  try {
    return truncateText(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function datePathParts(timestamp: Date): string[] {
  const year = String(timestamp.getUTCFullYear());
  const month = String(timestamp.getUTCMonth() + 1).padStart(2, "0");
  const day = String(timestamp.getUTCDate()).padStart(2, "0");
  return [year, month, day];
}

export class TelemetryRecorder {
  private readonly sessionId: string;
  private readonly filePath: string;
  private readonly startedAtMs: number;
  private readonly context: TelemetrySessionContext;
  private readonly stats: RecorderStats = {
    turnCount: 0,
    toolCallCount: 0,
    toolErrorCount: 0,
    assistantErrorTurnCount: 0,
    silentTurnCount: 0,
    retryCount: 0,
    compactionCount: 0,
  };
  private writeChain: Promise<void> = Promise.resolve();
  private turnCounter = 0;
  private activeTurn: ActiveTurnState | undefined;
  private readonly activeTools = new Map<string, ActiveToolState>();
  private closed = false;
  private gitSessionEndContext: GitSessionEndContext = {};

  private constructor(context: TelemetrySessionContext, sessionId: string, filePath: string, startedAtMs: number) {
    this.context = context;
    this.sessionId = sessionId;
    this.filePath = filePath;
    this.startedAtMs = startedAtMs;
  }

  static async create(context: TelemetrySessionContext): Promise<TelemetryRecorder> {
    const sessionId = context.sessionId ?? randomUUID();
    const startedAt = new Date();
    const filePath = path.join(
      context.workspaceRoot,
      ".hermit",
      "telemetry",
      "events",
      ...datePathParts(startedAt),
      `${sessionId}.jsonl`,
    );
    await ensureParentDirectory(filePath);

    const recorder = new TelemetryRecorder(context, sessionId, filePath, startedAt.getTime());
    await recorder.append({
      eventType: "session_start",
      ...recorder.eventCommon(startedAt.toISOString()),
      persist: context.persist,
      continueRecent: Boolean(context.continueRecent),
      workspaceRoot: context.workspaceRoot,
      ...(context.gitBranch !== undefined ? { gitBranch: context.gitBranch } : {}),
      ...(context.gitHeadAtStart !== undefined ? { gitHeadAtStart: context.gitHeadAtStart } : {}),
      ...(context.checkpointBeforeSha !== undefined ? { checkpointBeforeSha: context.checkpointBeforeSha } : {}),
    });
    return recorder;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getFilePath(): string {
    return this.filePath;
  }

  setGitSessionEndContext(context: GitSessionEndContext): void {
    this.gitSessionEndContext = {
      ...this.gitSessionEndContext,
      ...context,
    };
  }

  handleEvent(event: unknown): void {
    if (this.closed || !isRecord(event)) {
      return;
    }

    const eventType = getString(event.type);
    if (!eventType) {
      return;
    }

    const timestamp = new Date();

    switch (eventType) {
      case "turn_start":
        this.handleTurnStart(timestamp);
        return;
      case "message_update":
        this.handleMessageUpdate(event, timestamp);
        return;
      case "tool_execution_start":
        this.handleToolExecutionStart(event, timestamp);
        return;
      case "tool_execution_end":
        this.handleToolExecutionEnd(event, timestamp);
        return;
      case "auto_retry_start":
        this.handleRetryStart(event, timestamp);
        return;
      case "auto_retry_end":
        this.handleRetryEnd(event, timestamp);
        return;
      case "auto_compaction_start":
        this.handleCompactionStart(event, timestamp);
        return;
      case "auto_compaction_end":
        this.handleCompactionEnd(event, timestamp);
        return;
      case "message_end":
        this.handleMessageEnd(event, timestamp);
        return;
      case "turn_end":
        this.handleTurnEnd(timestamp);
        return;
      default:
        return;
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return this.writeChain;
    }

    this.closed = true;
    const endedAt = new Date();
    this.append({
      eventType: "session_end",
      ...this.eventCommon(endedAt.toISOString()),
      durationMs: endedAt.getTime() - this.startedAtMs,
      turnCount: this.stats.turnCount,
      toolCallCount: this.stats.toolCallCount,
      toolErrorCount: this.stats.toolErrorCount,
      assistantErrorTurnCount: this.stats.assistantErrorTurnCount,
      silentTurnCount: this.stats.silentTurnCount,
      retryCount: this.stats.retryCount,
      compactionCount: this.stats.compactionCount,
      ...(this.context.gitBranch !== undefined ? { gitBranch: this.context.gitBranch } : {}),
      ...(this.context.gitHeadAtStart !== undefined ? { gitHeadAtStart: this.context.gitHeadAtStart } : {}),
      ...(this.gitSessionEndContext.gitHeadAtEnd !== undefined
        ? { gitHeadAtEnd: this.gitSessionEndContext.gitHeadAtEnd }
        : {}),
      ...(this.context.checkpointBeforeSha !== undefined ? { checkpointBeforeSha: this.context.checkpointBeforeSha } : {}),
      ...(this.gitSessionEndContext.checkpointAfterSha !== undefined
        ? { checkpointAfterSha: this.gitSessionEndContext.checkpointAfterSha }
        : {}),
      ...(this.gitSessionEndContext.commandOutcome !== undefined
        ? { commandOutcome: this.gitSessionEndContext.commandOutcome }
        : {}),
    });
    await this.writeChain;
  }

  private eventCommon(timestamp: string) {
    return createTelemetryEventCommon(this.context, this.sessionId, timestamp);
  }

  private startTurn(timestampMs: number): ActiveTurnState {
    this.turnCounter += 1;
    this.stats.turnCount += 1;
    this.activeTurn = {
      id: `turn-${String(this.turnCounter).padStart(4, "0")}`,
      startedAtMs: timestampMs,
      toolCallCount: 0,
      toolErrorCount: 0,
      assistantTextChars: 0,
      assistantError: false,
      retryCount: 0,
      compactionCount: 0,
    };
    return this.activeTurn;
  }

  private handleTurnStart(timestamp: Date): void {
    const activeTurn = this.startTurn(timestamp.getTime());
    this.append({
      eventType: "turn_start",
      ...this.eventCommon(timestamp.toISOString()),
      turnId: activeTurn.id,
    });
  }

  private handleMessageUpdate(event: Record<string, unknown>, timestamp: Date): void {
    if (!this.activeTurn) {
      return;
    }

    const assistantMessageEvent = isRecord(event.assistantMessageEvent) ? event.assistantMessageEvent : undefined;
    if (!assistantMessageEvent || getString(assistantMessageEvent.type) !== "text_delta") {
      return;
    }

    const timestampIso = timestamp.toISOString();
    const timestampMs = timestamp.getTime();
    const delta = getString(assistantMessageEvent.delta) ?? "";

    if (this.activeTurn.firstTokenAtMs === undefined) {
      this.activeTurn.firstTokenAtMs = timestampMs;
      this.append({
        eventType: "first_token",
        ...this.eventCommon(timestampIso),
        turnId: this.activeTurn.id,
        latencyMs: timestampMs - this.activeTurn.startedAtMs,
      });
    }

    this.activeTurn.assistantTextChars += delta.length;
  }

  private handleToolExecutionStart(event: Record<string, unknown>, timestamp: Date): void {
    const toolCallId = getString(event.toolCallId);
    const toolName = getString(event.toolName);
    if (!toolCallId || !toolName) {
      return;
    }

    this.stats.toolCallCount += 1;
    if (this.activeTurn) {
      this.activeTurn.toolCallCount += 1;
    }

    this.activeTools.set(toolCallId, {
      turnId: this.activeTurn?.id,
      startedAtMs: timestamp.getTime(),
    });

    this.append({
      eventType: "tool_start",
      ...this.eventCommon(timestamp.toISOString()),
      turnId: this.activeTurn?.id,
      toolCallId,
      toolName,
    });
  }

  private handleToolExecutionEnd(event: Record<string, unknown>, timestamp: Date): void {
    const toolCallId = getString(event.toolCallId);
    const toolName = getString(event.toolName);
    if (!toolCallId || !toolName) {
      return;
    }

    const activeTool = this.activeTools.get(toolCallId);
    const isError = Boolean(event.isError);
    this.activeTools.delete(toolCallId);

    if (isError) {
      this.stats.toolErrorCount += 1;
      if (this.activeTurn) {
        this.activeTurn.toolErrorCount += 1;
      }
    }

    this.append({
      eventType: "tool_end",
      ...this.eventCommon(timestamp.toISOString()),
      turnId: activeTool?.turnId ?? this.activeTurn?.id,
      toolCallId,
      toolName,
      durationMs: activeTool ? timestamp.getTime() - activeTool.startedAtMs : undefined,
      isError,
      errorMessage: isError ? extractErrorMessage(event.result) : undefined,
    });
  }

  private handleRetryStart(event: Record<string, unknown>, timestamp: Date): void {
    this.stats.retryCount += 1;
    if (this.activeTurn) {
      this.activeTurn.retryCount += 1;
    }

    this.append({
      eventType: "retry_start",
      ...this.eventCommon(timestamp.toISOString()),
      turnId: this.activeTurn?.id,
      attempt: getNumber(event.attempt) ?? 1,
      maxAttempts: getNumber(event.maxAttempts),
      delayMs: getNumber(event.delayMs),
      errorMessage: getString(event.errorMessage),
    });
  }

  private handleRetryEnd(event: Record<string, unknown>, timestamp: Date): void {
    this.append({
      eventType: "retry_end",
      ...this.eventCommon(timestamp.toISOString()),
      turnId: this.activeTurn?.id,
      attempt: getNumber(event.attempt) ?? 1,
      success: Boolean(event.success),
      finalError: getString(event.finalError),
    });
  }

  private handleCompactionStart(event: Record<string, unknown>, timestamp: Date): void {
    this.stats.compactionCount += 1;
    if (this.activeTurn) {
      this.activeTurn.compactionCount += 1;
    }

    this.append({
      eventType: "compaction_start",
      ...this.eventCommon(timestamp.toISOString()),
      turnId: this.activeTurn?.id,
      reason: getString(event.reason),
    });
  }

  private handleCompactionEnd(event: Record<string, unknown>, timestamp: Date): void {
    this.append({
      eventType: "compaction_end",
      ...this.eventCommon(timestamp.toISOString()),
      turnId: this.activeTurn?.id,
      aborted: Boolean(event.aborted),
      willRetry: Boolean(event.willRetry),
      errorMessage: getString(event.errorMessage),
    });
  }

  private handleMessageEnd(event: Record<string, unknown>, timestamp: Date): void {
    const message = isRecord(event.message) ? event.message : undefined;
    if (getString(message?.role) !== "assistant") {
      return;
    }

    const errorMessage = getString(message?.errorMessage);
    if (errorMessage && this.activeTurn && !this.activeTurn.assistantError) {
      this.activeTurn.assistantError = true;
      this.stats.assistantErrorTurnCount += 1;
    }

    this.append({
      eventType: "assistant_message_end",
      ...this.eventCommon(timestamp.toISOString()),
      turnId: this.activeTurn?.id,
      hasText: Boolean(this.activeTurn && this.activeTurn.assistantTextChars > 0),
      textChars: this.activeTurn?.assistantTextChars ?? 0,
      errorMessage,
    });
  }

  private handleTurnEnd(timestamp: Date): void {
    if (!this.activeTurn) {
      return;
    }

    const activeTurn = this.activeTurn;
    this.activeTurn = undefined;

    const hadAssistantText = activeTurn.assistantTextChars > 0;
    if (!hadAssistantText) {
      this.stats.silentTurnCount += 1;
    }

    this.append({
      eventType: "turn_end",
      ...this.eventCommon(timestamp.toISOString()),
      turnId: activeTurn.id,
      durationMs: timestamp.getTime() - activeTurn.startedAtMs,
      timeToFirstTokenMs:
        activeTurn.firstTokenAtMs !== undefined ? activeTurn.firstTokenAtMs - activeTurn.startedAtMs : undefined,
      toolCallCount: activeTurn.toolCallCount,
      toolErrorCount: activeTurn.toolErrorCount,
      assistantTextChars: activeTurn.assistantTextChars,
      assistantError: activeTurn.assistantError,
      hadAssistantText,
      retryCount: activeTurn.retryCount,
      compactionCount: activeTurn.compactionCount,
    });
  }

  private append(event: StoredTelemetryEvent): Promise<void> {
    this.writeChain = this.writeChain.then(() => fs.appendFile(this.filePath, `${JSON.stringify(event)}\n`, "utf8"));
    return this.writeChain;
  }
}
