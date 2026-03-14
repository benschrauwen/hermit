import { describe, expect, it } from "vitest";

import { createSessionStreamHandler, type SessionOutputSink } from "../src/session-terminal.js";

class MockSink implements SessionOutputSink {
  appendedText: string[] = [];
  toolStatuses: string[] = [];
  statusTransitions: Array<string | undefined> = [];
  private currentStatus: string | undefined;

  appendText(text: string): void {
    this.appendedText.push(text);
  }

  appendToolStatus(text: string): void {
    this.toolStatuses.push(text);
  }

  showStatus(text: string): void {
    this.currentStatus = text;
    this.statusTransitions.push(text);
  }

  clearStatus(): void {
    this.currentStatus = undefined;
    this.statusTransitions.push(undefined);
  }
}

describe("createSessionStreamHandler", () => {
  it("flushes partial assistant output before tool execution and resumes thinking afterward", () => {
    const sink = new MockSink();
    const handleEvent = createSessionStreamHandler(sink);

    handleEvent({
      type: "message_start",
      message: { role: "assistant" },
    } as never);
    handleEvent({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        delta: "# Heading",
      },
    } as never);
    handleEvent({
      type: "tool_execution_start",
      toolName: "read",
      args: { path: "src/session.ts" },
    } as never);
    handleEvent({
      type: "tool_execution_end",
      toolName: "read",
    } as never);
    handleEvent({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        delta: "\nDone.\n",
      },
    } as never);
    handleEvent({
      type: "message_end",
      message: { role: "assistant" },
    } as never);

    expect(sink.toolStatuses).toEqual(["read src/session.ts"]);
    expect(sink.appendedText.join("")).toBe(
      "\x1b[1m\x1b[4mHeading\x1b[0m\n\nDone.\n",
    );
    expect(sink.statusTransitions).toEqual([
      "Thinking",
      undefined,
      "read src/session.ts",
      "Thinking",
      undefined,
      "Thinking",
    ]);
  });

  it("prints assistant errors when no assistant text was emitted", () => {
    const sink = new MockSink();
    const handleEvent = createSessionStreamHandler(sink);

    handleEvent({
      type: "message_start",
      message: { role: "assistant" },
    } as never);
    handleEvent({
      type: "message_end",
      message: { role: "assistant", errorMessage: "boom" },
    } as never);

    expect(sink.appendedText).toEqual(["Assistant error: boom\n"]);
    expect(sink.statusTransitions).toEqual(["Thinking", undefined, "Thinking"]);
  });

  it("surfaces retry and compaction lifecycle states", () => {
    const sink = new MockSink();
    const handleEvent = createSessionStreamHandler(sink);

    handleEvent({
      type: "message_start",
      message: { role: "assistant" },
    } as never);
    handleEvent({
      type: "auto_retry_start",
      attempt: 2,
      maxAttempts: 3,
      delayMs: 500,
    } as never);
    handleEvent({
      type: "auto_retry_end",
      success: true,
    } as never);
    handleEvent({
      type: "auto_compaction_start",
      reason: "context window limit",
    } as never);
    handleEvent({
      type: "auto_compaction_end",
      willRetry: true,
    } as never);

    expect(sink.toolStatuses).toEqual([
      "Retrying 2/3 in 500ms",
      "Compacting context: context window limit",
    ]);
    expect(sink.statusTransitions).toEqual([
      "Thinking",
      "Retrying 2/3 in 500ms",
      "Thinking",
      "Compacting context: context window limit",
      "Retrying after compaction",
    ]);
  });
});
