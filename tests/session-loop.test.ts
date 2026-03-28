import process from "node:process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runOneShotPrompt } from "../src/session-loop.js";
import type { SessionOutputSink } from "../src/session-terminal.js";

class MockSink implements SessionOutputSink {
  appendedText: string[] = [];
  toolStatuses: string[] = [];
  statusTransitions: Array<string | undefined> = [];

  appendText(text: string): void {
    this.appendedText.push(text);
  }

  appendToolStatus(text: string): void {
    this.toolStatuses.push(text);
  }

  showStatus(text: string): void {
    this.statusTransitions.push(text);
  }

  clearStatus(): void {
    this.statusTransitions.push(undefined);
  }
}

describe("runOneShotPrompt", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes streamed assistant output to a custom sink without console echo", async () => {
    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    let handler: ((event: unknown) => void) | undefined;

    const session = {
      subscribe(nextHandler: (event: unknown) => void) {
        handler = nextHandler;
        return () => {
          handler = undefined;
        };
      },
      prompt: vi.fn(async () => {
        handler?.({
          type: "message_start",
          message: { role: "assistant" },
        });
        handler?.({
          type: "message_update",
          assistantMessageEvent: {
            type: "text_delta",
            delta: "Heartbeat finished cleanly.\n",
          },
        });
        handler?.({
          type: "message_end",
          message: { role: "assistant" },
        });
      }),
    } as never;

    const sink = new MockSink();
    await runOneShotPrompt(session, "Internal heartbeat prompt", [], undefined, "role-a", "openai/gpt-5.4", {
      sink,
      echoPrompt: false,
      showModelNotice: false,
    });

    expect(session.prompt).toHaveBeenCalledWith("Internal heartbeat prompt", { images: [] });
    expect(sink.appendedText.join("")).toBe("Heartbeat finished cleanly.\n");
    expect(sink.toolStatuses).toEqual([]);
    expect(stdoutWrite).not.toHaveBeenCalled();
  });

  it("can render the model notice and prompt echo into a custom sink", async () => {
    let handler: ((event: unknown) => void) | undefined;

    const session = {
      subscribe(nextHandler: (event: unknown) => void) {
        handler = nextHandler;
        return () => {
          handler = undefined;
        };
      },
      prompt: vi.fn(async () => {
        handler?.({
          type: "message_start",
          message: { role: "assistant" },
        });
        handler?.({
          type: "message_end",
          message: { role: "assistant" },
        });
      }),
    } as never;

    const sink = new MockSink();
    await runOneShotPrompt(session, "Inspect the backlog.", [], undefined, "sales", "openai/gpt-5.4", {
      sink,
    });

    expect(sink.toolStatuses).toEqual(["Using model openai/gpt-5.4."]);
    expect(sink.appendedText).toContain(
      "\n\x1b[1m\x1b[95m- sales >>\x1b[0m \x1b[95mInspect the backlog.\x1b[0m\n\n",
    );
  });
});
