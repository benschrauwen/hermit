import { promises as fs } from "node:fs";
import path from "node:path";

import { parseDuration } from "./duration.js";
import type {
  CompactionTelemetryEvent,
  RetryTelemetryEvent,
  SessionEndTelemetryEvent,
  StoredTelemetryEvent,
  ToolEndTelemetryEvent,
  TurnEndTelemetryEvent,
} from "./telemetry-events.js";
import type { TelemetryReport, TelemetryToolReport, TelemetryTurnReport } from "./types.js";

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

function parseWindowToMs(value: string): number {
  return parseDuration(value);
}

function telemetryEventMatchesRole(event: StoredTelemetryEvent, roleId: string | undefined): boolean {
  return roleId === undefined || event.roleId === roleId;
}

function keepCompletedSessionEvents(events: StoredTelemetryEvent[]): StoredTelemetryEvent[] {
  const completedSessionIds = new Set(
    events.filter((event) => event.eventType === "session_end").map((event) => event.sessionId),
  );

  return events.filter((event) => completedSessionIds.has(event.sessionId));
}

function utcDayParts(date: Date): [string, string, string] {
  return [
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ];
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function listTelemetryEventFiles(root: string, since: Date, until: Date): Promise<string[]> {
  const eventsDir = path.join(root, ".hermit", "telemetry", "events");
  const files: string[] = [];

  for (
    let day = startOfUtcDay(since);
    day.getTime() <= startOfUtcDay(until).getTime();
    day = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1))
  ) {
    const dayDir = path.join(eventsDir, ...utcDayParts(day));
    try {
      const entries = await fs.readdir(dayDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          files.push(path.join(dayDir, entry.name));
        }
      }
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }

  return files;
}

async function readTelemetryEvents(
  root: string,
  options: { since: Date; until: Date; roleId?: string },
): Promise<StoredTelemetryEvent[]> {
  const files = await listTelemetryEventFiles(root, options.since, options.until);
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

function buildToolBreakdown(toolEndEvents: ToolEndTelemetryEvent[]): TelemetryToolReport[] {
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

  return [...toolStatsMap.entries()]
    .map(([toolName, stats]) => {
      const errorRate = rate(stats.errorCount, stats.callCount);
      const durationP50Ms = percentile(stats.durations, 0.5);
      const durationP95Ms = percentile(stats.durations, 0.95);

      return {
        toolName,
        callCount: stats.callCount,
        errorCount: stats.errorCount,
        ...(errorRate !== undefined ? { errorRate } : {}),
        ...(durationP50Ms !== undefined ? { durationP50Ms } : {}),
        ...(durationP95Ms !== undefined ? { durationP95Ms } : {}),
      };
    })
    .sort((left, right) => {
      const errorRateDelta = (right.errorRate ?? -1) - (left.errorRate ?? -1);
      if (errorRateDelta !== 0) {
        return errorRateDelta;
      }
      return right.callCount - left.callCount;
    });
}

function buildSlowestTurns(turnEndEvents: TurnEndTelemetryEvent[]): TelemetryTurnReport[] {
  return turnEndEvents
    .map((event) => ({
      sessionId: event.sessionId,
      turnId: event.turnId,
      ...(event.roleId !== undefined ? { roleId: event.roleId } : {}),
      commandName: event.commandName,
      durationMs: event.durationMs,
      ...(event.timeToFirstTokenMs !== undefined ? { timeToFirstTokenMs: event.timeToFirstTokenMs } : {}),
      toolCallCount: event.toolCallCount,
      toolErrorCount: event.toolErrorCount,
    }))
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 5);
}

function buildTopFailingToolsLine(report: TelemetryReport): string {
  return report.failingTools.length > 0
    ? `- Top failing tools: ${report.failingTools.map((tool) => `${tool.toolName} ${tool.errorCount}/${tool.callCount}`).join(", ")}`
    : "- Top failing tools: none";
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

export async function generateTelemetryReport(
  root: string,
  options: { window?: string; roleId?: string } = {},
): Promise<TelemetryReport> {
  const now = new Date();
  const windowLabel = options.window ?? "7d";
  const windowStart = new Date(now.getTime() - parseWindowToMs(windowLabel));
  const allEvents = await readTelemetryEvents(root, {
    since: windowStart,
    until: now,
    ...(options.roleId !== undefined ? { roleId: options.roleId } : {}),
  });
  const events = keepCompletedSessionEvents(allEvents);

  const turnEndEvents = events.filter((event): event is TurnEndTelemetryEvent => event.eventType === "turn_end");
  const toolEndEvents = events.filter((event): event is ToolEndTelemetryEvent => event.eventType === "tool_end");
  const sessionEndEvents = events.filter(
    (event): event is SessionEndTelemetryEvent => event.eventType === "session_end",
  );
  const retryStartEvents = events.filter((event): event is RetryTelemetryEvent => event.eventType === "retry_start");
  const compactionStartEvents = events.filter(
    (event): event is CompactionTelemetryEvent => event.eventType === "compaction_start",
  );

  const turnDurations = turnEndEvents.map((event) => event.durationMs);
  const firstTokenDurations = turnEndEvents
    .map((event) => event.timeToFirstTokenMs)
    .filter((value): value is number => value !== undefined);
  const toolDurations = toolEndEvents
    .map((event) => event.durationMs)
    .filter((value): value is number => value !== undefined);
  const toolErrorCount = toolEndEvents.filter((event) => event.isError).length;
  const assistantErrorTurnCount = turnEndEvents.filter((event) => event.assistantError).length;
  const silentTurnCount = turnEndEvents.filter((event) => !event.hadAssistantText).length;
  const toolBreakdown = buildToolBreakdown(toolEndEvents);
  const toolErrorRate = rate(toolErrorCount, toolEndEvents.length);
  const assistantErrorRate = rate(assistantErrorTurnCount, turnEndEvents.length);
  const silentTurnRate = rate(silentTurnCount, turnEndEvents.length);
  const turnDurationP50Ms = percentile(turnDurations, 0.5);
  const turnDurationP95Ms = percentile(turnDurations, 0.95);
  const timeToFirstTokenP50Ms = percentile(firstTokenDurations, 0.5);
  const timeToFirstTokenP95Ms = percentile(firstTokenDurations, 0.95);
  const toolDurationP50Ms = percentile(toolDurations, 0.5);
  const toolDurationP95Ms = percentile(toolDurations, 0.95);

  return {
    generatedAt: now.toISOString(),
    ...(options.roleId !== undefined ? { roleId: options.roleId } : {}),
    window: {
      label: windowLabel,
      start: windowStart.toISOString(),
      end: now.toISOString(),
    },
    summary: {
      sessionCount: sessionEndEvents.length,
      turnCount: turnEndEvents.length,
      toolCallCount: toolEndEvents.length,
      toolErrorCount,
      ...(toolErrorRate !== undefined ? { toolErrorRate } : {}),
      assistantErrorTurnCount,
      ...(assistantErrorRate !== undefined ? { assistantErrorRate } : {}),
      silentTurnCount,
      ...(silentTurnRate !== undefined ? { silentTurnRate } : {}),
      retryCount: retryStartEvents.length,
      compactionCount: compactionStartEvents.length,
      ...(turnDurationP50Ms !== undefined ? { turnDurationP50Ms } : {}),
      ...(turnDurationP95Ms !== undefined ? { turnDurationP95Ms } : {}),
      ...(timeToFirstTokenP50Ms !== undefined ? { timeToFirstTokenP50Ms } : {}),
      ...(timeToFirstTokenP95Ms !== undefined ? { timeToFirstTokenP95Ms } : {}),
      ...(toolDurationP50Ms !== undefined ? { toolDurationP50Ms } : {}),
      ...(toolDurationP95Ms !== undefined ? { toolDurationP95Ms } : {}),
    },
    failingTools: toolBreakdown.filter((tool) => tool.errorCount > 0).slice(0, 5),
    slowestTurns: buildSlowestTurns(turnEndEvents),
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
    buildTopFailingToolsLine(report),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}
