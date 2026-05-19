import { SessionManager, type SessionEntry, type SessionInfo } from "@mariozechner/pi-coding-agent";
import path from "node:path";

import { HERMIT_ROLE_ID } from "./constants.js";
import { inspectWorkspaceRoles } from "./roles.js";
import { resolveHermitSessionDirectory, resolvePersistedSessionDirectory } from "./session-runtime.js";
import type { SessionHistoryType } from "./types.js";

export type ExplorerSessionHistoryType = SessionHistoryType;

export interface WorkspaceSessionSource {
  roleId: string;
  roleLabel: string;
  historyType: ExplorerSessionHistoryType;
  sessionsDir: string;
}

export interface WorkspaceSessionListItem {
  key: string;
  roleId: string;
  roleLabel: string;
  historyType: ExplorerSessionHistoryType;
  path: string;
  id: string;
  name?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  firstMessage: string;
}

export interface WorkspaceSessionMessage {
  id: string;
  role: string;
  timestamp: string;
  text: string;
}

export interface WorkspaceSessionDetail {
  key: string;
  roleId: string;
  roleLabel: string;
  historyType: ExplorerSessionHistoryType;
  path: string;
  id: string;
  name?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  messages: WorkspaceSessionMessage[];
}

function extractMessageText(message: { content?: unknown }): string {
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part) {
        return String(part.text);
      }
      return "";
    })
    .filter((value) => value.length > 0)
    .join("\n");
}

function resolveWorkspaceRoot(workspaceRoot: string): string {
  return path.resolve(workspaceRoot);
}

export function encodeSessionKey(workspaceRoot: string, sessionPath: string): string {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const absolute = path.resolve(sessionPath);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Session path is outside workspace: ${sessionPath}`);
  }
  return Buffer.from(relative, "utf8").toString("base64url");
}

export function decodeSessionKey(workspaceRoot: string, sessionKey: string): string {
  const root = resolveWorkspaceRoot(workspaceRoot);
  let relative: string;
  try {
    relative = Buffer.from(sessionKey, "base64url").toString("utf8");
  } catch {
    throw new Error("Invalid session key");
  }

  const absolute = path.resolve(root, relative);
  const normalizedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (absolute !== root && !absolute.startsWith(normalizedRoot)) {
    throw new Error("Invalid session key");
  }
  if (!absolute.endsWith(".jsonl")) {
    throw new Error("Invalid session key");
  }
  return absolute;
}

function toListItem(workspaceRoot: string, source: WorkspaceSessionSource, info: SessionInfo): WorkspaceSessionListItem {
  return {
    key: encodeSessionKey(workspaceRoot, info.path),
    roleId: source.roleId,
    roleLabel: source.roleLabel,
    historyType: source.historyType,
    path: info.path,
    id: info.id,
    ...(info.name ? { name: info.name } : {}),
    created: info.created,
    modified: info.modified,
    messageCount: info.messageCount,
    firstMessage: info.firstMessage,
  };
}

export async function listWorkspaceSessionSources(workspaceRoot: string): Promise<WorkspaceSessionSource[]> {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const sources: WorkspaceSessionSource[] = [
    {
      roleId: HERMIT_ROLE_ID,
      roleLabel: HERMIT_ROLE_ID,
      historyType: "interactive",
      sessionsDir: resolveHermitSessionDirectory(root, "interactive"),
    },
    {
      roleId: HERMIT_ROLE_ID,
      roleLabel: HERMIT_ROLE_ID,
      historyType: "heartbeat",
      sessionsDir: resolveHermitSessionDirectory(root, "heartbeat"),
    },
  ];

  const { roles } = await inspectWorkspaceRoles(root);
  for (const role of roles) {
    sources.push({
      roleId: role.id,
      roleLabel: role.name,
      historyType: "interactive",
      sessionsDir: resolvePersistedSessionDirectory(role, "interactive"),
    });
    sources.push({
      roleId: role.id,
      roleLabel: role.name,
      historyType: "heartbeat",
      sessionsDir: path.join(role.roleDir, ".role-agent", "heartbeat-sessions"),
    });
  }

  return sources;
}

export async function listWorkspaceSessions(workspaceRoot: string): Promise<WorkspaceSessionListItem[]> {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const sources = await listWorkspaceSessionSources(root);
  const sessions: WorkspaceSessionListItem[] = [];

  for (const source of sources) {
    const listed = await SessionManager.list(root, source.sessionsDir);
    for (const info of listed) {
      sessions.push(toListItem(root, source, info));
    }
  }

  sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  return sessions;
}

function entryToMessage(entry: SessionEntry): WorkspaceSessionMessage | undefined {
  if (entry.type === "message") {
    const text = extractMessageText(entry.message as { content?: unknown });
    if (!text) {
      return undefined;
    }
    return {
      id: entry.id,
      role: entry.message.role,
      timestamp: entry.timestamp,
      text,
    };
  }

  if (entry.type === "custom_message") {
    const text =
      typeof entry.content === "string"
        ? entry.content
        : entry.content
            .map((part) => (part.type === "text" ? part.text : ""))
            .filter((value) => value.length > 0)
            .join("\n");
    if (!text || !entry.display) {
      return undefined;
    }
    return {
      id: entry.id,
      role: entry.customType,
      timestamp: entry.timestamp,
      text,
    };
  }

  if (entry.type === "compaction") {
    return {
      id: entry.id,
      role: "compaction",
      timestamp: entry.timestamp,
      text: entry.summary,
    };
  }

  if (entry.type === "branch_summary") {
    return {
      id: entry.id,
      role: "branch_summary",
      timestamp: entry.timestamp,
      text: entry.summary,
    };
  }

  return undefined;
}

export function extractSessionMessages(entries: SessionEntry[]): WorkspaceSessionMessage[] {
  const messages: WorkspaceSessionMessage[] = [];
  for (const entry of entries) {
    const message = entryToMessage(entry);
    if (message) {
      messages.push(message);
    }
  }
  return messages;
}

export async function loadWorkspaceSessionDetail(
  workspaceRoot: string,
  sessionKey: string,
): Promise<WorkspaceSessionDetail | undefined> {
  const root = resolveWorkspaceRoot(workspaceRoot);
  const sessionPath = decodeSessionKey(root, sessionKey);
  const sources = await listWorkspaceSessionSources(root);
  const matchedSource = sources.find((candidate) => {
    const sessionsDir = path.resolve(candidate.sessionsDir);
    const resolvedSessionPath = path.resolve(sessionPath);
    return resolvedSessionPath === sessionsDir || resolvedSessionPath.startsWith(`${sessionsDir}${path.sep}`);
  });
  if (!matchedSource) {
    return undefined;
  }

  const listed = await SessionManager.list(root, matchedSource.sessionsDir);
  const info = listed.find((item) => path.resolve(item.path) === path.resolve(sessionPath));
  if (!info) {
    return undefined;
  }

  const manager = SessionManager.open(sessionPath);
  const messages = extractSessionMessages(manager.getEntries());

  return {
    key: sessionKey,
    roleId: matchedSource.roleId,
    roleLabel: matchedSource.roleLabel,
    historyType: matchedSource.historyType,
    path: info.path,
    id: info.id,
    ...(info.name ? { name: info.name } : {}),
    created: info.created,
    modified: info.modified,
    messageCount: info.messageCount,
    messages,
  };
}
