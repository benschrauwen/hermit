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

export interface WorkspaceSessionToolCall {
  id: string;
  name: string;
  arguments: unknown;
  resultText?: string;
  resultIsError?: boolean;
}

export interface WorkspaceSessionMessage {
  id: string;
  role: string;
  timestamp: string;
  text: string;
  reasoning?: string;
  reasoningLocked?: boolean;
  toolCalls?: WorkspaceSessionToolCall[];
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

type ContentPart = Record<string, unknown>;

function asContentParts(content: unknown): ContentPart[] {
  if (typeof content === "string") {
    return content.length > 0 ? [{ type: "text", text: content }] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.filter((part): part is ContentPart => Boolean(part) && typeof part === "object");
}

function extractMessageText(message: { content?: unknown }): string {
  return asContentParts(message.content)
    .map((part) => {
      if (part.type === "text" && typeof part.text === "string") {
        return part.text;
      }
      return "";
    })
    .filter((value) => value.length > 0)
    .join("\n");
}

function parseThinkingSignature(signature: unknown): { text?: string; locked?: boolean } {
  if (typeof signature !== "string" || signature.length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(signature) as {
      type?: string;
      encrypted_content?: string;
      summary?: Array<{ type?: string; text?: string }>;
    };
    if (Array.isArray(parsed.summary) && parsed.summary.length > 0) {
      const text = parsed.summary
        .map((item) => (item.type === "summary_text" && typeof item.text === "string" ? item.text : ""))
        .filter((value) => value.length > 0)
        .join("\n\n");
      if (text.length > 0) {
        return { text };
      }
    }
    if (parsed.type === "reasoning" && typeof parsed.encrypted_content === "string") {
      return { locked: true };
    }
  } catch {
    return {};
  }
  return {};
}

function extractReasoningFromContent(content: unknown): { text?: string; locked?: boolean } {
  const parts: string[] = [];
  let locked = false;

  for (const part of asContentParts(content)) {
    if (part.type !== "thinking") {
      continue;
    }
    if (typeof part.thinking === "string" && part.thinking.length > 0) {
      parts.push(part.thinking);
      continue;
    }
    const fromSignature = parseThinkingSignature(part.thinkingSignature);
    if (fromSignature.text) {
      parts.push(fromSignature.text);
    } else if (fromSignature.locked) {
      locked = true;
    }
  }

  const text = parts.join("\n\n").trim();
  if (text.length > 0) {
    return { text };
  }
  if (locked) {
    return { locked: true };
  }
  return {};
}

function extractToolCallsFromContent(content: unknown): WorkspaceSessionToolCall[] {
  const toolCalls: WorkspaceSessionToolCall[] = [];
  for (const part of asContentParts(content)) {
    if (part.type !== "toolCall" || typeof part.id !== "string" || typeof part.name !== "string") {
      continue;
    }
    toolCalls.push({
      id: part.id,
      name: part.name,
      arguments: "arguments" in part ? part.arguments : {},
    });
  }
  return toolCalls;
}

function extractToolResultText(message: { content?: unknown }): string {
  return extractMessageText(message);
}

function indexToolResults(entries: SessionEntry[]): Map<string, { text: string; isError: boolean }> {
  const results = new Map<string, { text: string; isError: boolean }>();
  for (const entry of entries) {
    if (entry.type !== "message") {
      continue;
    }
    const message = entry.message as {
      role?: string;
      toolCallId?: string;
      content?: unknown;
      isError?: boolean;
    };
    if (message.role !== "toolResult" || typeof message.toolCallId !== "string") {
      continue;
    }
    results.set(message.toolCallId, {
      text: extractToolResultText(message),
      isError: Boolean(message.isError),
    });
  }
  return results;
}

function attachToolResults(
  toolCalls: WorkspaceSessionToolCall[],
  toolResults: Map<string, { text: string; isError: boolean }>,
): WorkspaceSessionToolCall[] {
  return toolCalls.map((toolCall) => {
    const result = toolResults.get(toolCall.id);
    if (!result) {
      return toolCall;
    }
    return {
      ...toolCall,
      resultText: result.text,
      resultIsError: result.isError,
    };
  });
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

function entryToMessage(
  entry: SessionEntry,
  toolResults: Map<string, { text: string; isError: boolean }>,
): WorkspaceSessionMessage | undefined {
  if (entry.type === "message") {
    const message = entry.message as { role?: string; content?: unknown };
    if (message.role === "toolResult") {
      return undefined;
    }

    const text = extractMessageText(message);
    const reasoning = extractReasoningFromContent(message.content);
    const toolCalls = attachToolResults(extractToolCallsFromContent(message.content), toolResults);
    const hasContent =
      text.length > 0 ||
      Boolean(reasoning.text) ||
      Boolean(reasoning.locked) ||
      toolCalls.length > 0;

    if (!hasContent) {
      return undefined;
    }

    return {
      id: entry.id,
      role: message.role ?? "unknown",
      timestamp: entry.timestamp,
      text,
      ...(reasoning.text ? { reasoning: reasoning.text } : {}),
      ...(reasoning.locked ? { reasoningLocked: true } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
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
  const toolResults = indexToolResults(entries);
  const messages: WorkspaceSessionMessage[] = [];
  for (const entry of entries) {
    const message = entryToMessage(entry, toolResults);
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
