import { HERMIT_ROLE_ID } from "./constants.js";
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

export interface HeartbeatDaemonCyclePlan {
  mode: "wait" | "heartbeat" | "strategic-review";
  targetIds: string[];
}

export interface HeartbeatDaemonStopResult {
  requested: boolean;
  abortedActiveSession: boolean;
}

export interface HeartbeatDaemonController {
  isRunning(): boolean;
  setActiveAbort(abortActiveSession?: (() => Promise<void>) | undefined): void;
  stop(): HeartbeatDaemonStopResult;
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

export function resolveHeartbeatDaemonTargetIds(roleIds: string[]): string[] {
  return [HERMIT_ROLE_ID, ...roleIds.filter((roleId) => roleId !== HERMIT_ROLE_ID)];
}

export function planHeartbeatDaemonCycle(roleIds: string[], strategicReviewSweepDue: boolean): HeartbeatDaemonCyclePlan {
  if (roleIds.length === 0) {
    if (strategicReviewSweepDue) {
      return {
        mode: "strategic-review",
        targetIds: [HERMIT_ROLE_ID],
      };
    }

    return {
      mode: "wait",
      targetIds: [],
    };
  }

  return {
    mode: strategicReviewSweepDue ? "strategic-review" : "heartbeat",
    targetIds: strategicReviewSweepDue ? resolveHeartbeatDaemonTargetIds(roleIds) : roleIds,
  };
}

export function createHeartbeatDaemonController(options: {
  onAbortError?: (error: unknown) => void;
} = {}): HeartbeatDaemonController {
  let keepRunning = true;
  let activeAbort: (() => Promise<void>) | undefined;

  return {
    isRunning(): boolean {
      return keepRunning;
    },
    setActiveAbort(abortActiveSession?: (() => Promise<void>) | undefined): void {
      activeAbort = abortActiveSession;
    },
    stop(): HeartbeatDaemonStopResult {
      if (!keepRunning) {
        return { requested: false, abortedActiveSession: false };
      }

      keepRunning = false;
      const abortActiveSession = activeAbort;
      if (abortActiveSession) {
        void abortActiveSession().catch((error) => {
          options.onAbortError?.(error);
        });
      }

      return {
        requested: true,
        abortedActiveSession: abortActiveSession !== undefined,
      };
    },
  };
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
