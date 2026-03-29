import { beforeEach, describe, expect, it, vi } from "vitest";

const { runInteractiveSessionTurnMock } = vi.hoisted(() => ({
  runInteractiveSessionTurnMock: vi.fn(),
}));

vi.mock("../src/turn-control.js", () => ({
  runInteractiveSessionTurn: runInteractiveSessionTurnMock,
}));

import { InteractiveSessionController } from "../src/interactive-session-controller.js";

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("InteractiveSessionController", () => {
  beforeEach(() => {
    runInteractiveSessionTurnMock.mockReset();
  });

  it("queues follow-ups only after the active turn starts running", async () => {
    const turnStarted = createDeferred();
    const turnFinished = createDeferred();

    runInteractiveSessionTurnMock.mockImplementation(async (options: { onTurnStarted?: () => void }) => {
      await turnStarted.promise;
      options.onTurnStarted?.();
      await turnFinished.promise;
    });

    let sessionEventHandler:
      | ((event: { type: string; message?: { role?: string; content?: unknown } }) => void)
      | undefined;
    const followUp = vi.fn();
    const subscribe = vi.fn((handler: typeof sessionEventHandler) => {
      sessionEventHandler = handler;
      return () => undefined;
    });

    const states: Array<"idle" | "waiting" | "running"> = [];
    const queuedCounts: number[] = [];
    const queuedFollowUpsStarted: string[] = [];
    const controller = new InteractiveSessionController({
      root: "/tmp/workspace",
      initialSession: {
        session: {
          subscribe,
          followUp,
        } as never,
        telemetry: {} as never,
        workspaceState: {} as never,
        activeRoleLabel: "role-a",
        modelLabel: "openai/gpt-5.4",
        consumeRoleSwitchRequest: () => undefined,
      },
      attachStreaming: () => ({
        stop() {},
        clearStatus() {},
      }),
      onTurnStateChange: (state) => {
        states.push(state);
      },
      onQueuedFollowUpCountChange: (count) => {
        queuedCounts.push(count);
      },
      onQueuedFollowUpStart: (prompt) => {
        queuedFollowUpsStarted.push(prompt);
      },
    });

    const promptPromise = controller.prompt("Start work");
    await Promise.resolve();

    expect(controller.getTurnState()).toBe("waiting");
    expect(controller.queueFollowUp("Queued too early")).toBe(false);

    turnStarted.resolve();
    await Promise.resolve();

    expect(controller.getTurnState()).toBe("running");
    expect(controller.queueFollowUp("Queued follow-up")).toBe(true);
    expect(followUp).toHaveBeenCalledWith("Queued follow-up");

    sessionEventHandler?.({
      type: "message_start",
      message: { role: "user", content: "Queued follow-up" },
    });

    sessionEventHandler?.({
      type: "message_end",
      message: { role: "user" },
    });

    turnFinished.resolve();
    await promptPromise;

    expect(states).toEqual(["waiting", "running", "idle"]);
    expect(queuedCounts).toEqual([1, 0]);
    expect(queuedFollowUpsStarted).toEqual(["Queued follow-up"]);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});
