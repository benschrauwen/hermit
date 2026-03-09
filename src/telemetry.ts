import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { TelemetryReport, TelemetrySessionContext, TelemetryToolReport, TelemetryTurnReport } from "./types.js";

interface TelemetryBaseEvent {
  eventType: string;
  timestamp: string;
  sessionId: string;
  roleId?: string | undefined;
  commandName: string;
  model: string;
}

interface SessionStartTelemetryEvent extends TelemetryBaseEvent {
  eventType: "session_start";
  persist: boolean;
  continueRecent: boolean;
  workspaceRoot: string;
}

interface SessionEndTelemetryEvent extends TelemetryBaseEvent {
  eventType: "session_end";
  durationMs: number;
  turnCount: number;
  toolCallCount: number;
  toolErrorCount: number;
  assistantErrorTurnCount: number;
  silentTurnCount: number;
  retryCount: number;
  compactionCount: number;
}

interface TurnStartTelemetryEvent extends TelemetryBaseEvent {
  eventType: "turn_start";
  turnId: string;
}

interface FirstTokenTelemetryEvent extends TelemetryBaseEvent {
  eventType: "first_token";
  turnId: string;
  latencyMs: number;
}

interface ToolStartTelemetryEvent extends TelemetryBaseEvent {
  eventType: "tool_start";
  turnId?: string | undefined;
  toolCallId: string;
  toolName: string;
}

interface ToolEndTelemetryEvent extends TelemetryBaseEvent {
  eventType: "tool_end";
  turnId?: string | undefined;
  toolCallId: string;
  toolName: string;
  durationMs?: number | undefined;
  isError: boolean;
  errorMessage?: string | undefined;
}

interface AssistantMessageEndTelemetryEvent extends TelemetryBaseEvent {
  eventType: "assistant_message_end";
  turnId?: string | undefined;
  hasText: boolean;
  textChars: number;
  errorMessage?: string | undefined;
}

interface RetryTelemetryEvent extends TelemetryBaseEvent {
  eventType: "retry_start" | "retry_end";
  turnId?: string | undefined;
  attempt: number;
  maxAttempts?: number | undefined;
  delayMs?: number | undefined;
  success?: boolean | undefined;
  errorMessage?: string | undefined;
  finalError?: string | undefined;
}

interface CompactionTelemetryEvent extends TelemetryBaseEvent {
  eventType: "compaction_start" | "compaction_end";
  turnId?: string | undefined;
  reason?: string | undefined;
  aborted?: boolean | undefined;
  willRetry?: boolean | undefined;
  errorMessage?: string | undefined;
}

interface TurnEndTelemetryEvent extends TelemetryBaseEvent {
  eventType: "turn_end";
  turnId: string;
  durationMs: number;
  timeToFirstTokenMs?: number | undefined;
  toolCallCount: number;
  toolErrorCount: number;
  assistantTextChars: number;
  assistantError: boolean;
  hadAssistantText: boolean;
  retryCount: number;
  compactionCount: number;
}

type StoredTelemetryEvent =
  | SessionStartTelemetryEvent
  | SessionEndTelemetryEvent
  | TurnStartTelemetryEvent
  | FirstTokenTelemetryEvent
  | ToolStartTelemetryEvent
  | ToolEndTelemetryEvent
  | AssistantMessageEndTelemetryEvent
  | RetryTelemetryEvent
  | CompactionTelemetryEvent
  | TurnEndTelemetryEvent;

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
  toolName: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

function formatModelName(context: TelemetrySessionContext): string {
  return `${context.modelProvider}/${context.modelId}`;
}

function percentile(values: number[], quantile: number): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index];
}

function rate(numerator: number, denominator: number): number | undefined {
  if (denominator <= 0) {
    return undefined;
  }

  return numerator / denominator;
}

function formatDurationMs(value: number | undefined): string {
  if (value === undefined) {
    return "n/a";
  }

  return `${value.toFixed(0)} ms`;
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) {
    return "n/a";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function sanitizeWindowLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

async function listFilesRecursive(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return listFilesRecursive(entryPath);
        }
        return [entryPath];
      }),
    );
    return nested.flat();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function telemetryEventMatchesRole(event: StoredTelemetryEvent, roleId: string | undefined): boolean {
  if (!roleId) {
    return true;
  }

  return event.roleId === roleId;
}

function keepCompletedSessionEvents(events: StoredTelemetryEvent[]): StoredTelemetryEvent[] {
  const completedSessionIds = new Set(
    events.filter((event) => event.eventType === "session_end").map((event) => event.sessionId),
  );

  return events.filter((event) => completedSessionIds.has(event.sessionId));
}

function parseWindowToMs(value: string): number {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)([mhdw])$/i);
  if (!match) {
    throw new Error(`Unsupported telemetry window: ${value}. Use formats like 30m, 24h, 7d, or 2w.`);
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? "d").toLowerCase();
  const multipliers: Record<string, number> = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };

  const multiplier = multipliers[unit];
  if (multiplier === undefined) {
    throw new Error(`Unsupported telemetry window unit: ${unit}`);
  }

  return amount * multiplier;
}

async function readTelemetryEvents(root: string, options: { since: Date; until: Date; roleId?: string | undefined }): Promise<StoredTelemetryEvent[]> {
  const eventsDir = path.join(root, ".hermit", "telemetry", "events");
  const files = (await listFilesRecursive(eventsDir)).filter((filePath) => filePath.endsWith(".jsonl"));
  const allEvents: StoredTelemetryEvent[] = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const parsed = JSON.parse(line) as StoredTelemetryEvent;
      const timestampMs = Date.parse(parsed.timestamp);
      if (Number.isNaN(timestampMs)) {
        continue;
      }
      if (timestampMs < options.since.getTime() || timestampMs > options.until.getTime()) {
        continue;
      }
      if (!telemetryEventMatchesRole(parsed, options.roleId)) {
        continue;
      }
      allEvents.push(parsed);
    }
  }

  allEvents.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  return allEvents;
}

function buildMarkdownReport(report: TelemetryReport): string {
  const lines: string[] = [];
  lines.push("# Hermit Telemetry Report");
  lines.push("");
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Window: ${report.window.label} (${report.window.start} to ${report.window.end})`);
  if (report.roleId) {
    lines.push(`- Role filter: ${report.roleId}`);
  }
  lines.push(`- Session count: ${report.summary.sessionCount}`);
  lines.push(`- Turn count: ${report.summary.turnCount}`);
  lines.push("");
  lines.push("## Reliability");
  lines.push("");
  lines.push(`- Tool error rate: ${formatPercent(report.summary.toolErrorRate)} (${report.summary.toolErrorCount}/${report.summary.toolCallCount})`);
  lines.push(`- Assistant error rate: ${formatPercent(report.summary.assistantErrorRate)} (${report.summary.assistantErrorTurnCount}/${report.summary.turnCount})`);
  lines.push(`- Silent turn rate: ${formatPercent(report.summary.silentTurnRate)} (${report.summary.silentTurnCount}/${report.summary.turnCount})`);
  lines.push(`- Retry count: ${report.summary.retryCount}`);
  lines.push(`- Compaction count: ${report.summary.compactionCount}`);
  lines.push("");
  lines.push("## Speed");
  lines.push("");
  lines.push(`- Turn duration p50: ${formatDurationMs(report.summary.turnDurationP50Ms)}`);
  lines.push(`- Turn duration p95: ${formatDurationMs(report.summary.turnDurationP95Ms)}`);
  lines.push(`- Time to first token p50: ${formatDurationMs(report.summary.timeToFirstTokenP50Ms)}`);
  lines.push(`- Time to first token p95: ${formatDurationMs(report.summary.timeToFirstTokenP95Ms)}`);
  lines.push(`- Tool duration p50: ${formatDurationMs(report.summary.toolDurationP50Ms)}`);
  lines.push(`- Tool duration p95: ${formatDurationMs(report.summary.toolDurationP95Ms)}`);
  lines.push("");

  lines.push("## Failing Tools");
  lines.push("");
  if (report.failingTools.length === 0) {
    lines.push("- None in this window.");
  } else {
    for (const tool of report.failingTools) {
      lines.push(
        `- ${tool.toolName}: ${tool.errorCount}/${tool.callCount} errors (${formatPercent(tool.errorRate)}), p95 ${formatDurationMs(tool.durationP95Ms)}`,
      );
    }
  }
  lines.push("");

  lines.push("## Slowest Turns");
  lines.push("");
  if (report.slowestTurns.length === 0) {
    lines.push("- None in this window.");
  } else {
    for (const turn of report.slowestTurns) {
      lines.push(
        `- ${turn.sessionId}/${turn.turnId} (${turn.commandName}${turn.roleId ? `, ${turn.roleId}` : ""}): ${formatDurationMs(turn.durationMs)}, first token ${formatDurationMs(turn.timeToFirstTokenMs)}, tools ${turn.toolCallCount}, tool errors ${turn.toolErrorCount}`,
      );
    }
  }
  lines.push("");

  lines.push("## Tool Breakdown");
  lines.push("");
  if (report.toolBreakdown.length === 0) {
    lines.push("- No tool calls in this window.");
  } else {
    for (const tool of report.toolBreakdown) {
      lines.push(
        `- ${tool.toolName}: calls ${tool.callCount}, errors ${tool.errorCount}, error rate ${formatPercent(tool.errorRate)}, p50 ${formatDurationMs(tool.durationP50Ms)}, p95 ${formatDurationMs(tool.durationP95Ms)}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
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

  private constructor(context: TelemetrySessionContext, sessionId: string, filePath: string, startedAtMs: number) {
    this.context = context;
    this.sessionId = sessionId;
    this.filePath = filePath;
    this.startedAtMs = startedAtMs;
  }

  static async create(context: TelemetrySessionContext): Promise<TelemetryRecorder> {
    const sessionId = randomUUID();
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
      timestamp: startedAt.toISOString(),
      sessionId,
      roleId: context.roleId,
      commandName: context.commandName,
      model: formatModelName(context),
      persist: context.persist,
      continueRecent: Boolean(context.continueRecent),
      workspaceRoot: context.workspaceRoot,
    });
    return recorder;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getFilePath(): string {
    return this.filePath;
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
    const timestampIso = timestamp.toISOString();
    const timestampMs = timestamp.getTime();

    switch (eventType) {
      case "turn_start": {
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
        this.append({
          eventType: "turn_start",
          timestamp: timestampIso,
          sessionId: this.sessionId,
          roleId: this.context.roleId,
          commandName: this.context.commandName,
          model: formatModelName(this.context),
          turnId: this.activeTurn.id,
        });
        return;
      }
      case "message_update": {
        const assistantMessageEvent = isRecord(event.assistantMessageEvent) ? event.assistantMessageEvent : undefined;
        const assistantEventType = assistantMessageEvent ? getString(assistantMessageEvent.type) : undefined;
        if (assistantEventType === "text_delta" && this.activeTurn) {
          const delta = getString(assistantMessageEvent?.delta) ?? "";
          if (this.activeTurn.firstTokenAtMs === undefined) {
            this.activeTurn.firstTokenAtMs = timestampMs;
            this.append({
              eventType: "first_token",
              timestamp: timestampIso,
              sessionId: this.sessionId,
              roleId: this.context.roleId,
              commandName: this.context.commandName,
              model: formatModelName(this.context),
              turnId: this.activeTurn.id,
              latencyMs: timestampMs - this.activeTurn.startedAtMs,
            });
          }
          this.activeTurn.assistantTextChars += delta.length;
        }
        return;
      }
      case "tool_execution_start": {
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
          toolName,
          startedAtMs: timestampMs,
        });
        this.append({
          eventType: "tool_start",
          timestamp: timestampIso,
          sessionId: this.sessionId,
          roleId: this.context.roleId,
          commandName: this.context.commandName,
          model: formatModelName(this.context),
          turnId: this.activeTurn?.id,
          toolCallId,
          toolName,
        });
        return;
      }
      case "tool_execution_end": {
        const toolCallId = getString(event.toolCallId);
        const toolName = getString(event.toolName);
        const isError = Boolean(event.isError);
        if (!toolCallId || !toolName) {
          return;
        }
        const activeTool = this.activeTools.get(toolCallId);
        this.activeTools.delete(toolCallId);
        if (isError) {
          this.stats.toolErrorCount += 1;
          if (this.activeTurn) {
            this.activeTurn.toolErrorCount += 1;
          }
        }
        this.append({
          eventType: "tool_end",
          timestamp: timestampIso,
          sessionId: this.sessionId,
          roleId: this.context.roleId,
          commandName: this.context.commandName,
          model: formatModelName(this.context),
          turnId: activeTool?.turnId ?? this.activeTurn?.id,
          toolCallId,
          toolName,
          durationMs: activeTool ? timestampMs - activeTool.startedAtMs : undefined,
          isError,
          errorMessage: isError ? extractErrorMessage(event.result) : undefined,
        });
        return;
      }
      case "auto_retry_start": {
        this.stats.retryCount += 1;
        if (this.activeTurn) {
          this.activeTurn.retryCount += 1;
        }
        this.append({
          eventType: "retry_start",
          timestamp: timestampIso,
          sessionId: this.sessionId,
          roleId: this.context.roleId,
          commandName: this.context.commandName,
          model: formatModelName(this.context),
          turnId: this.activeTurn?.id,
          attempt: getNumber(event.attempt) ?? 1,
          maxAttempts: getNumber(event.maxAttempts),
          delayMs: getNumber(event.delayMs),
          errorMessage: getString(event.errorMessage),
        });
        return;
      }
      case "auto_retry_end": {
        this.append({
          eventType: "retry_end",
          timestamp: timestampIso,
          sessionId: this.sessionId,
          roleId: this.context.roleId,
          commandName: this.context.commandName,
          model: formatModelName(this.context),
          turnId: this.activeTurn?.id,
          attempt: getNumber(event.attempt) ?? 1,
          success: Boolean(event.success),
          finalError: getString(event.finalError),
        });
        return;
      }
      case "auto_compaction_start": {
        this.stats.compactionCount += 1;
        if (this.activeTurn) {
          this.activeTurn.compactionCount += 1;
        }
        this.append({
          eventType: "compaction_start",
          timestamp: timestampIso,
          sessionId: this.sessionId,
          roleId: this.context.roleId,
          commandName: this.context.commandName,
          model: formatModelName(this.context),
          turnId: this.activeTurn?.id,
          reason: getString(event.reason),
        });
        return;
      }
      case "auto_compaction_end": {
        this.append({
          eventType: "compaction_end",
          timestamp: timestampIso,
          sessionId: this.sessionId,
          roleId: this.context.roleId,
          commandName: this.context.commandName,
          model: formatModelName(this.context),
          turnId: this.activeTurn?.id,
          aborted: Boolean(event.aborted),
          willRetry: Boolean(event.willRetry),
          errorMessage: getString(event.errorMessage),
        });
        return;
      }
      case "message_end": {
        const message = isRecord(event.message) ? event.message : undefined;
        const role = message ? getString(message.role) : undefined;
        if (role !== "assistant") {
          return;
        }

        const errorMessage = getString(message?.errorMessage);
        if (errorMessage && this.activeTurn && !this.activeTurn.assistantError) {
          this.activeTurn.assistantError = true;
          this.stats.assistantErrorTurnCount += 1;
        }

        this.append({
          eventType: "assistant_message_end",
          timestamp: timestampIso,
          sessionId: this.sessionId,
          roleId: this.context.roleId,
          commandName: this.context.commandName,
          model: formatModelName(this.context),
          turnId: this.activeTurn?.id,
          hasText: Boolean(this.activeTurn && this.activeTurn.assistantTextChars > 0),
          textChars: this.activeTurn?.assistantTextChars ?? 0,
          errorMessage,
        });
        return;
      }
      case "turn_end": {
        if (!this.activeTurn) {
          return;
        }
        const hadAssistantText = this.activeTurn.assistantTextChars > 0;
        if (!hadAssistantText) {
          this.stats.silentTurnCount += 1;
        }
        const activeTurn = this.activeTurn;
        this.activeTurn = undefined;
        this.append({
          eventType: "turn_end",
          timestamp: timestampIso,
          sessionId: this.sessionId,
          roleId: this.context.roleId,
          commandName: this.context.commandName,
          model: formatModelName(this.context),
          turnId: activeTurn.id,
          durationMs: timestampMs - activeTurn.startedAtMs,
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
        return;
      }
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
      timestamp: endedAt.toISOString(),
      sessionId: this.sessionId,
      roleId: this.context.roleId,
      commandName: this.context.commandName,
      model: formatModelName(this.context),
      durationMs: endedAt.getTime() - this.startedAtMs,
      turnCount: this.stats.turnCount,
      toolCallCount: this.stats.toolCallCount,
      toolErrorCount: this.stats.toolErrorCount,
      assistantErrorTurnCount: this.stats.assistantErrorTurnCount,
      silentTurnCount: this.stats.silentTurnCount,
      retryCount: this.stats.retryCount,
      compactionCount: this.stats.compactionCount,
    });
    await this.writeChain;
  }

  private append(event: StoredTelemetryEvent): Promise<void> {
    this.writeChain = this.writeChain.then(() => fs.appendFile(this.filePath, `${JSON.stringify(event)}\n`, "utf8"));
    return this.writeChain;
  }
}

export async function generateTelemetryReport(
  root: string,
  options: { window?: string | undefined; roleId?: string | undefined } = {},
): Promise<TelemetryReport> {
  const now = new Date();
  const windowLabel = options.window ?? "7d";
  const windowMs = parseWindowToMs(windowLabel);
  const windowStart = new Date(now.getTime() - windowMs);
  const allEvents = await readTelemetryEvents(root, {
    since: windowStart,
    until: now,
    roleId: options.roleId,
  });
  const events = keepCompletedSessionEvents(allEvents);

  const turnEndEvents = events.filter((event): event is TurnEndTelemetryEvent => event.eventType === "turn_end");
  const toolEndEvents = events.filter((event): event is ToolEndTelemetryEvent => event.eventType === "tool_end");
  const sessionEndEvents = events.filter((event): event is SessionEndTelemetryEvent => event.eventType === "session_end");
  const retryStartEvents = events.filter((event): event is RetryTelemetryEvent => event.eventType === "retry_start");
  const compactionStartEvents = events.filter(
    (event): event is CompactionTelemetryEvent => event.eventType === "compaction_start",
  );

  const turnDurations = turnEndEvents.map((event) => event.durationMs);
  const firstTokenDurations = turnEndEvents
    .map((event) => event.timeToFirstTokenMs)
    .filter((value): value is number => value !== undefined);
  const toolDurations = toolEndEvents.map((event) => event.durationMs).filter((value): value is number => value !== undefined);

  const toolStatsMap = new Map<string, { durations: number[]; callCount: number; errorCount: number }>();
  for (const event of toolEndEvents) {
    const current = toolStatsMap.get(event.toolName) ?? { durations: [], callCount: 0, errorCount: 0 };
    current.callCount += 1;
    if (event.durationMs !== undefined) {
      current.durations.push(event.durationMs);
    }
    if (event.isError) {
      current.errorCount += 1;
    }
    toolStatsMap.set(event.toolName, current);
  }

  const toolBreakdown: TelemetryToolReport[] = [...toolStatsMap.entries()]
    .map(([toolName, stats]) => ({
      toolName,
      callCount: stats.callCount,
      errorCount: stats.errorCount,
      errorRate: rate(stats.errorCount, stats.callCount),
      durationP50Ms: percentile(stats.durations, 0.5),
      durationP95Ms: percentile(stats.durations, 0.95),
    }))
    .sort((left, right) => {
      const errorRateDelta = (right.errorRate ?? -1) - (left.errorRate ?? -1);
      if (errorRateDelta !== 0) {
        return errorRateDelta;
      }
      return right.callCount - left.callCount;
    });

  const failingTools = toolBreakdown.filter((tool) => tool.errorCount > 0).slice(0, 5);
  const slowestTurns: TelemetryTurnReport[] = turnEndEvents
    .map((event) => ({
      sessionId: event.sessionId,
      turnId: event.turnId,
      roleId: event.roleId,
      commandName: event.commandName,
      durationMs: event.durationMs,
      timeToFirstTokenMs: event.timeToFirstTokenMs,
      toolCallCount: event.toolCallCount,
      toolErrorCount: event.toolErrorCount,
    }))
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 5);

  return {
    generatedAt: now.toISOString(),
    roleId: options.roleId,
    window: {
      label: windowLabel,
      start: windowStart.toISOString(),
      end: now.toISOString(),
    },
    summary: {
      sessionCount: sessionEndEvents.length,
      turnCount: turnEndEvents.length,
      toolCallCount: toolEndEvents.length,
      toolErrorCount: toolEndEvents.filter((event) => event.isError).length,
      toolErrorRate: rate(toolEndEvents.filter((event) => event.isError).length, toolEndEvents.length),
      assistantErrorTurnCount: turnEndEvents.filter((event) => event.assistantError).length,
      assistantErrorRate: rate(
        turnEndEvents.filter((event) => event.assistantError).length,
        turnEndEvents.length,
      ),
      silentTurnCount: turnEndEvents.filter((event) => !event.hadAssistantText).length,
      silentTurnRate: rate(
        turnEndEvents.filter((event) => !event.hadAssistantText).length,
        turnEndEvents.length,
      ),
      retryCount: retryStartEvents.length,
      compactionCount: compactionStartEvents.length,
      turnDurationP50Ms: percentile(turnDurations, 0.5),
      turnDurationP95Ms: percentile(turnDurations, 0.95),
      timeToFirstTokenP50Ms: percentile(firstTokenDurations, 0.5),
      timeToFirstTokenP95Ms: percentile(firstTokenDurations, 0.95),
      toolDurationP50Ms: percentile(toolDurations, 0.5),
      toolDurationP95Ms: percentile(toolDurations, 0.95),
    },
    failingTools,
    slowestTurns,
    toolBreakdown,
    source: {
      eventCount: events.length,
      sessionFileCount: new Set(events.map((event) => event.sessionId)).size,
    },
  };
}

export async function writeTelemetryReport(
  root: string,
  report: TelemetryReport,
): Promise<{ markdownPath: string; jsonPath: string }> {
  const generatedAt = new Date(report.generatedAt);
  const timestampLabel = report.generatedAt.replace(/[:]/g, "-").replace(/\./g, "-");
  const windowLabel = sanitizeWindowLabel(report.window.label);
  const baseDir = path.join(root, ".hermit", "telemetry", "reports");
  const baseName = `report-${windowLabel}-${generatedAt.toISOString().slice(0, 10)}-${timestampLabel}`;
  const markdownPath = path.join(baseDir, `${baseName}.md`);
  const jsonPath = path.join(baseDir, `${baseName}.json`);

  await fs.mkdir(baseDir, { recursive: true });
  await fs.writeFile(markdownPath, buildMarkdownReport(report), "utf8");
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  return { markdownPath, jsonPath };
}

export function renderTelemetryReportSummary(report: TelemetryReport): string {
  return [
    "# Telemetry report",
    `- Window: ${report.window.label} (${report.window.start} to ${report.window.end})`,
    report.roleId ? `- Role filter: ${report.roleId}` : undefined,
    `- Sessions: ${report.summary.sessionCount}`,
    `- Turns: ${report.summary.turnCount}`,
    `- Tool error rate: ${formatPercent(report.summary.toolErrorRate)} (${report.summary.toolErrorCount}/${report.summary.toolCallCount})`,
    `- Assistant error rate: ${formatPercent(report.summary.assistantErrorRate)} (${report.summary.assistantErrorTurnCount}/${report.summary.turnCount})`,
    `- Silent turn rate: ${formatPercent(report.summary.silentTurnRate)} (${report.summary.silentTurnCount}/${report.summary.turnCount})`,
    `- Turn duration p50/p95: ${formatDurationMs(report.summary.turnDurationP50Ms)} / ${formatDurationMs(report.summary.turnDurationP95Ms)}`,
    `- Time to first token p50/p95: ${formatDurationMs(report.summary.timeToFirstTokenP50Ms)} / ${formatDurationMs(report.summary.timeToFirstTokenP95Ms)}`,
    `- Tool duration p50/p95: ${formatDurationMs(report.summary.toolDurationP50Ms)} / ${formatDurationMs(report.summary.toolDurationP95Ms)}`,
    report.failingTools.length > 0
      ? `- Top failing tools: ${report.failingTools
          .map((tool) => `${tool.toolName} ${tool.errorCount}/${tool.callCount}`)
          .join(", ")}`
      : "- Top failing tools: none",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
