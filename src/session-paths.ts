import path from "node:path";

import { resolveFrameworkRoot, resolveSharedSkillDirectories, uniquePaths } from "./runtime-paths.js";
import type { SessionHistoryType } from "./session-types.js";
import type { RoleDefinition } from "./types.js";

const HERMIT_INTERACTIVE_SESSION_DIRECTORY = path.join(".hermit", "sessions", "hermit");
const HERMIT_HEARTBEAT_SESSION_DIRECTORY = path.join(".hermit", "sessions", "hermit-heartbeat");

export function resolvePersistedSessionDirectory(
  role: RoleDefinition,
  historyType: SessionHistoryType = "interactive",
): string {
  if (historyType === "heartbeat") {
    return path.join(role.roleDir, ".role-agent", "heartbeat-sessions");
  }

  return role.sessionsDir;
}

export function resolveHermitSessionDirectory(root: string, historyType: SessionHistoryType = "interactive"): string {
  return path.join(
    root,
    historyType === "heartbeat" ? HERMIT_HEARTBEAT_SESSION_DIRECTORY : HERMIT_INTERACTIVE_SESSION_DIRECTORY,
  );
}

export function resolveRoleSkillPaths(role: RoleDefinition): string[] {
  return uniquePaths([...resolveSharedSkillDirectories(role.root, role.frameworkRoot), role.roleSkillsDir]);
}

export function resolveSharedSkillPaths(root: string, frameworkRoot = resolveFrameworkRoot()): string[] {
  return resolveSharedSkillDirectories(root, frameworkRoot);
}
