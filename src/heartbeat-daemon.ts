import { parseDuration } from "./duration.js";

export const DEFAULT_HEARTBEAT_DAEMON_INTERVAL = "1h";
export const DEFAULT_HEARTBEAT_DAEMON_INTERVAL_MS = 60 * 60 * 1000;

export interface HeartbeatCycleFailure {
  roleId: string;
  error: unknown;
}

export interface HeartbeatCycleResult {
  startedAtMs: number;
  completedAtMs: number;
  successfulRoleIds: string[];
  failures: HeartbeatCycleFailure[];
}

export function parseHeartbeatDaemonInterval(value: string): number {
  return parseDuration(value);
}

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

export function formatHeartbeatDaemonDuration(ms: number): string {
  if (ms < MS_PER_SECOND) {
    return `${ms}ms`;
  }
  if (ms % MS_PER_HOUR === 0) {
    return `${ms / MS_PER_HOUR}h`;
  }
  if (ms % MS_PER_MINUTE === 0) {
    return `${ms / MS_PER_MINUTE}m`;
  }
  if (ms % MS_PER_SECOND === 0) {
    return `${ms / MS_PER_SECOND}s`;
  }

  return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
}

export function resolveHeartbeatDaemonDelay(intervalMs: number, startedAtMs: number, nowMs = Date.now()): number {
  return Math.max(0, intervalMs - Math.max(0, nowMs - startedAtMs));
}

export async function runHeartbeatCycle(options: {
  roleIds: string[];
  runRoleHeartbeat: (roleId: string) => Promise<void>;
  isCancelled?: () => boolean;
  now?: () => number;
}): Promise<HeartbeatCycleResult> {
  const now = options.now ?? Date.now;
  const successfulRoleIds: string[] = [];
  const failures: HeartbeatCycleFailure[] = [];
  const startedAtMs = now();

  for (const roleId of options.roleIds) {
    if (options.isCancelled?.()) {
      break;
    }

    try {
      await options.runRoleHeartbeat(roleId);
      successfulRoleIds.push(roleId);
    } catch (error) {
      failures.push({ roleId, error });
    }
  }

  return {
    startedAtMs,
    completedAtMs: now(),
    successfulRoleIds,
    failures,
  };
}
