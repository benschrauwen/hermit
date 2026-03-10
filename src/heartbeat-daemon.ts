export const DEFAULT_HEARTBEAT_DAEMON_INTERVAL = "1h";
export const DEFAULT_HEARTBEAT_DAEMON_INTERVAL_MS = 60 * 60 * 1000;

const INTERVAL_UNIT_TO_MS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
} as const;

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
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^(\d+)(ms|s|m|h)$/);
  if (!match) {
    throw new Error(
      `Invalid heartbeat interval "${value}". Use a whole number followed by ms, s, m, or h, for example "30m" or "1h".`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2] as keyof typeof INTERVAL_UNIT_TO_MS;
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`Invalid heartbeat interval "${value}". The numeric value must be a positive whole number.`);
  }

  return amount * INTERVAL_UNIT_TO_MS[unit];
}

export function formatHeartbeatDaemonDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms % INTERVAL_UNIT_TO_MS.h === 0) {
    return `${ms / INTERVAL_UNIT_TO_MS.h}h`;
  }
  if (ms % INTERVAL_UNIT_TO_MS.m === 0) {
    return `${ms / INTERVAL_UNIT_TO_MS.m}m`;
  }
  if (ms % INTERVAL_UNIT_TO_MS.s === 0) {
    return `${ms / INTERVAL_UNIT_TO_MS.s}s`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
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
