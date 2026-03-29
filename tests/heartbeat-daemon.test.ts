import { describe, expect, it } from "vitest";

import {
  createHeartbeatDaemonController,
  formatHeartbeatDaemonDuration,
  parseHeartbeatDaemonInterval,
  planHeartbeatDaemonCycle,
  resolveHeartbeatDaemonDelay,
  resolveHeartbeatDaemonTargetIds,
  runHeartbeatCycle,
} from "../src/heartbeat-daemon.js";

describe("parseHeartbeatDaemonInterval", () => {
  it("parses common interval units", () => {
    expect(parseHeartbeatDaemonInterval("1h")).toBe(60 * 60 * 1000);
    expect(parseHeartbeatDaemonInterval("30m")).toBe(30 * 60 * 1000);
    expect(parseHeartbeatDaemonInterval("45s")).toBe(45 * 1000);
    expect(parseHeartbeatDaemonInterval("250ms")).toBe(250);
  });

  it("rejects invalid interval strings", () => {
    expect(() => parseHeartbeatDaemonInterval("1.5h")).toThrow(/Invalid duration/);
    expect(() => parseHeartbeatDaemonInterval("0h")).toThrow(/positive/);
    expect(() => parseHeartbeatDaemonInterval("hourly")).toThrow(/Invalid duration/);
  });
});

describe("formatHeartbeatDaemonDuration", () => {
  it("formats durations using the largest clean unit", () => {
    expect(formatHeartbeatDaemonDuration(250)).toBe("250ms");
    expect(formatHeartbeatDaemonDuration(30 * 1000)).toBe("30s");
    expect(formatHeartbeatDaemonDuration(15 * 60 * 1000)).toBe("15m");
    expect(formatHeartbeatDaemonDuration(2 * 60 * 60 * 1000)).toBe("2h");
  });
});

describe("resolveHeartbeatDaemonDelay", () => {
  it("subtracts elapsed time and never returns a negative delay", () => {
    expect(resolveHeartbeatDaemonDelay(60_000, 1_000, 11_000)).toBe(50_000);
    expect(resolveHeartbeatDaemonDelay(60_000, 1_000, 61_500)).toBe(0);
  });
});

describe("resolveHeartbeatDaemonTargetIds", () => {
  it("prepends Hermit before combined strategic-review sweeps", () => {
    expect(resolveHeartbeatDaemonTargetIds(["role-a", "role-b"])).toEqual(["Hermit", "role-a", "role-b"]);
  });

  it("avoids duplicating Hermit when it is already present", () => {
    expect(resolveHeartbeatDaemonTargetIds(["Hermit", "role-a"])).toEqual(["Hermit", "role-a"]);
  });
});

describe("planHeartbeatDaemonCycle", () => {
  it("waits when no roles are configured and no strategic review is due", () => {
    expect(planHeartbeatDaemonCycle([], false)).toEqual({
      mode: "wait",
      targetIds: [],
    });
  });

  it("runs a Hermit-only strategic review when no roles are configured but a review is due", () => {
    expect(planHeartbeatDaemonCycle([], true)).toEqual({
      mode: "strategic-review",
      targetIds: ["Hermit"],
    });
  });

  it("keeps normal role heartbeats when roles are configured", () => {
    expect(planHeartbeatDaemonCycle(["role-a", "role-b"], false)).toEqual({
      mode: "heartbeat",
      targetIds: ["role-a", "role-b"],
    });
  });
});

describe("runHeartbeatCycle", () => {
  it("runs heartbeats sequentially and continues after failures", async () => {
    const steps: string[] = [];

    const result = await runHeartbeatCycle({
      roleIds: ["role-a", "role-b", "role-c"],
      runRoleHeartbeat: async (roleId) => {
        steps.push(`start:${roleId}`);
        if (roleId === "role-b") {
          throw new Error("boom");
        }
        steps.push(`done:${roleId}`);
      },
      now: (() => {
        let current = 1_000;
        return () => {
          current += 100;
          return current;
        };
      })(),
    });

    expect(steps).toEqual([
      "start:role-a",
      "done:role-a",
      "start:role-b",
      "start:role-c",
      "done:role-c",
    ]);
    expect(result.successfulRoleIds).toEqual(["role-a", "role-c"]);
    expect(result.skippedRoleIds).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.roleId).toBe("role-b");
    expect(result.completedAtMs).toBeGreaterThan(result.startedAtMs);
  });

  it("stops before the next role when cancellation is requested", async () => {
    const attempted: string[] = [];
    let cancelled = false;

    const result = await runHeartbeatCycle({
      roleIds: ["role-a", "role-b"],
      isCancelled: () => cancelled,
      runRoleHeartbeat: async (roleId) => {
        attempted.push(roleId);
        cancelled = true;
      },
    });

    expect(attempted).toEqual(["role-a"]);
    expect(result.successfulRoleIds).toEqual(["role-a"]);
    expect(result.skippedRoleIds).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it("tracks skipped turns separately", async () => {
    const result = await runHeartbeatCycle({
      roleIds: ["role-a", "role-b"],
      runRoleHeartbeat: async (roleId) => {
        if (roleId === "role-b") {
          return "skipped";
        }
        return "success";
      },
    });

    expect(result.successfulRoleIds).toEqual(["role-a"]);
    expect(result.skippedRoleIds).toEqual(["role-b"]);
    expect(result.failures).toEqual([]);
  });
});

describe("createHeartbeatDaemonController", () => {
  it("can abort the active session without stopping the daemon", async () => {
    const steps: string[] = [];
    const controller = createHeartbeatDaemonController();

    controller.setActiveAbort(async () => {
      steps.push("aborted");
    });

    expect(controller.abortActiveSession()).toEqual({
      abortedActiveSession: true,
    });
    await Promise.resolve();
    expect(steps).toEqual(["aborted"]);
    expect(controller.isRunning()).toBe(true);
  });

  it("aborts the active session when the daemon stops", async () => {
    const steps: string[] = [];
    const controller = createHeartbeatDaemonController();

    controller.setActiveAbort(async () => {
      steps.push("aborted");
    });

    expect(controller.stop()).toEqual({
      requested: true,
      abortedActiveSession: true,
    });
    await Promise.resolve();
    expect(steps).toEqual(["aborted"]);
    expect(controller.isRunning()).toBe(false);
  });

  it("only requests the active-session abort once per session", async () => {
    const steps: string[] = [];
    const controller = createHeartbeatDaemonController();

    controller.setActiveAbort(async () => {
      steps.push("aborted");
    });

    expect(controller.abortActiveSession()).toEqual({
      abortedActiveSession: true,
    });
    expect(controller.abortActiveSession()).toEqual({
      abortedActiveSession: true,
    });
    await Promise.resolve();
    expect(steps).toEqual(["aborted"]);
  });

  it("only stops once", () => {
    const controller = createHeartbeatDaemonController();

    expect(controller.stop()).toEqual({
      requested: true,
      abortedActiveSession: false,
    });
    expect(controller.stop()).toEqual({
      requested: false,
      abortedActiveSession: false,
    });
  });
});
