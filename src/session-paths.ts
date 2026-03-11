import path from "node:path";

import type { RoleDefinition } from "./types.js";
import type { SessionHistoryType } from "./session-types.js";

const HERMIT_SESSION_DIRECTORY = path.join(".hermit", "sessions", "hermit");

export function resolvePersistedSessionDirectory(
  role: RoleDefinition,
  historyType: SessionHistoryType = "interactive",
): string {
  if (historyType === "heartbeat") {
    return path.join(role.roleDir, ".role-agent", "heartbeat-sessions");
  }

  return role.sessionsDir;
}

export function resolveBootstrapSessionDirectory(root: string): string {
  return path.join(root, HERMIT_SESSION_DIRECTORY);
}

export function resolveRoleSkillPaths(role: RoleDefinition): string[] {
  return [role.sharedSkillsDir, role.roleSkillsDir];
}

export function resolveSharedSkillPaths(root: string): string[] {
  return [path.join(root, "skills")];
}
