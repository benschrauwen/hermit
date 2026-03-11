import type { AgentSession } from "@mariozechner/pi-coding-agent";

import type { TelemetryRecorder } from "./telemetry-recorder.js";
import type { WorkspaceInitializationState } from "./types.js";

export type SessionHistoryType = "interactive" | "heartbeat";

export interface RoleSwitchRequest {
  roleId: string;
  reason?: string;
}

export interface InteractiveChatSession {
  session: AgentSession;
  telemetry: TelemetryRecorder;
  workspaceState: WorkspaceInitializationState;
  activeRoleLabel: string;
  consumeRoleSwitchRequest: () => RoleSwitchRequest | undefined;
}
