import path from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, promises as fs } from "node:fs";

import type {
  WorkspaceSessionDetail,
  WorkspaceSessionListItem,
} from "../../../src/session-browser.js";

import { getFrameworkRoot, importWithNode } from "./workspace.js";

type SessionBrowserModule = Pick<
  typeof import("../../../src/session-browser.js"),
  "listWorkspaceSessions" | "loadWorkspaceSessionDetail"
>;

const sessionBrowserCache = new Map<string, { version: string; pending: Promise<SessionBrowserModule> }>();

async function loadSessionBrowserModule(): Promise<SessionBrowserModule> {
  const sessionsPath = path.resolve(getFrameworkRoot(), "src", "session-browser.ts");
  if (!existsSync(sessionsPath)) {
    throw new Error(`Framework source not found at ${sessionsPath}.`);
  }

  const stat = await fs.stat(sessionsPath);
  const version = String(stat.mtimeMs);
  const cached = sessionBrowserCache.get(sessionsPath);
  if (cached && cached.version === version) {
    return cached.pending;
  }

  const importUrl = new URL(pathToFileURL(sessionsPath).href);
  importUrl.searchParams.set("v", version);
  const pending = importWithNode(importUrl.href).then((mod) => mod as SessionBrowserModule);
  sessionBrowserCache.set(sessionsPath, { version, pending });
  return pending;
}

export type { WorkspaceSessionDetail, WorkspaceSessionListItem };

export async function listWorkspaceSessions(workspaceRoot: string): Promise<WorkspaceSessionListItem[]> {
  const mod = await loadSessionBrowserModule();
  return mod.listWorkspaceSessions(workspaceRoot);
}

export async function loadWorkspaceSessionDetail(
  workspaceRoot: string,
  sessionKey: string,
): Promise<WorkspaceSessionDetail | undefined> {
  const mod = await loadSessionBrowserModule();
  return mod.loadWorkspaceSessionDetail(workspaceRoot, sessionKey);
}

export function formatSessionTimestamp(value: Date): string {
  return value.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatHistoryTypeLabel(historyType: string): string {
  return historyType === "heartbeat" ? "Heartbeat" : "Interactive";
}

export function formatSessionRelativePath(workspaceRoot: string, sessionPath: string): string {
  const relative = path.relative(path.resolve(workspaceRoot), path.resolve(sessionPath));
  if (relative.startsWith("..")) {
    return sessionPath;
  }
  return relative.split(path.sep).join("/");
}
