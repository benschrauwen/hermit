import { describe, expect, it } from "vitest";

import {
  formatHeartbeatDaemonDuration,
  parseHeartbeatDaemonInterval,
  resolveHeartbeatDaemonDelay,
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
    expect(() => parseHeartbeatDaemonInterval("1.5h")).toThrow(/Invalid heartbeat interval/);
    expect(() => parseHeartbeatDaemonInterval("0h")).toThrow(/positive whole number/);
    expect(() => parseHeartbeatDaemonInterval("hourly")).toThrow(/Invalid heartbeat interval/);
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
    expect(result.failures).toEqual([]);
  });
});
