import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { TelemetryRecorder, generateTelemetryReport, renderTelemetryReportSummary, writeTelemetryReport } from "../src/telemetry.js";

function findTelemetryEventFiles(root: string): string[] {
  const yearDirs = readdirSync(path.join(root, ".hermit", "telemetry", "events"));
  const files: string[] = [];

  for (const year of yearDirs) {
    const yearPath = path.join(root, ".hermit", "telemetry", "events", year);
    for (const month of readdirSync(yearPath)) {
      const monthPath = path.join(yearPath, month);
      for (const day of readdirSync(monthPath)) {
        const dayPath = path.join(monthPath, day);
        for (const file of readdirSync(dayPath)) {
          files.push(path.join(dayPath, file));
        }
      }
    }
  }

  return files;
}

describe("telemetry", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "hermit-telemetry-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("records append-only telemetry events for a session", async () => {
    const recorder = await TelemetryRecorder.create({
      workspaceRoot: tmpRoot,
      roleId: "role-a",
      commandName: "ask",
      persist: false,
      modelProvider: "openai",
      modelId: "gpt-test",
    });

    recorder.handleEvent({ type: "turn_start" });
    recorder.handleEvent({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        delta: "Hello",
      },
    });
    recorder.handleEvent({
      type: "tool_execution_start",
      toolCallId: "tool-1",
      toolName: "read",
    });
    recorder.handleEvent({
      type: "tool_execution_end",
      toolCallId: "tool-1",
      toolName: "read",
      isError: false,
      result: { ok: true },
    });
    recorder.handleEvent({
      type: "message_end",
      message: { role: "assistant" },
    });
    recorder.handleEvent({ type: "turn_end" });
    await recorder.close();

    const files = findTelemetryEventFiles(tmpRoot);
    expect(files).toHaveLength(1);
    const lines = readFileSync(files[0], "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { eventType: string; roleId?: string; commandName: string });

    expect(lines.map((line) => line.eventType)).toEqual([
      "session_start",
      "turn_start",
      "first_token",
      "tool_start",
      "tool_end",
      "assistant_message_end",
      "turn_end",
      "session_end",
    ]);
    expect(lines.every((line) => line.commandName === "ask")).toBe(true);
    expect(lines.every((line) => line.roleId === "role-a")).toBe(true);
  });

  it("aggregates telemetry into a report and writes markdown and json outputs", async () => {
    const recorder = await TelemetryRecorder.create({
      workspaceRoot: tmpRoot,
      roleId: "role-a",
      commandName: "chat",
      persist: true,
      modelProvider: "openai",
      modelId: "gpt-test",
    });

    recorder.handleEvent({ type: "turn_start" });
    recorder.handleEvent({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "Hi" },
    });
    recorder.handleEvent({
      type: "tool_execution_start",
      toolCallId: "tool-1",
      toolName: "bash",
    });
    recorder.handleEvent({
      type: "tool_execution_end",
      toolCallId: "tool-1",
      toolName: "bash",
      isError: true,
      result: { errorMessage: "boom" },
    });
    recorder.handleEvent({
      type: "message_end",
      message: { role: "assistant", errorMessage: "assistant failed" },
    });
    recorder.handleEvent({ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 100, errorMessage: "retry" });
    recorder.handleEvent({ type: "auto_compaction_start", reason: "threshold" });
    recorder.handleEvent({ type: "turn_end" });
    await recorder.close();

    const inFlightRecorder = await TelemetryRecorder.create({
      workspaceRoot: tmpRoot,
      roleId: "role-a",
      commandName: "chat",
      persist: true,
      modelProvider: "openai",
      modelId: "gpt-test",
    });
    inFlightRecorder.handleEvent({ type: "turn_start" });
    inFlightRecorder.handleEvent({
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "Still running" },
    });
    inFlightRecorder.handleEvent({
      type: "tool_execution_start",
      toolCallId: "tool-2",
      toolName: "read",
    });
    inFlightRecorder.handleEvent({
      type: "tool_execution_end",
      toolCallId: "tool-2",
      toolName: "read",
      isError: false,
      result: { ok: true },
    });

    const report = await generateTelemetryReport(tmpRoot, { window: "7d" });
    expect(report.summary.sessionCount).toBe(1);
    expect(report.summary.turnCount).toBe(1);
    expect(report.summary.toolCallCount).toBe(1);
    expect(report.summary.toolErrorCount).toBe(1);
    expect(report.summary.assistantErrorTurnCount).toBe(1);
    expect(report.summary.retryCount).toBe(1);
    expect(report.summary.compactionCount).toBe(1);
    expect(report.source.eventCount).toBe(10);
    expect(report.source.sessionFileCount).toBe(1);
    expect(report.failingTools[0]?.toolName).toBe("bash");
    expect(renderTelemetryReportSummary(report)).toContain("Top failing tools: bash 1/1");

    const paths = await writeTelemetryReport(tmpRoot, report);
    expect(readFileSync(paths.markdownPath, "utf8")).toContain("# Hermit Telemetry Report");
    expect(readFileSync(paths.jsonPath, "utf8")).toContain('"toolErrorCount": 1');
  });
});
