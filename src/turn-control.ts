import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import type { AgentSession } from "@mariozechner/pi-coding-agent";

import { withCheckpoints } from "./git.js";
import { loadImageAttachments } from "./image-attachments.js";

const WORKSPACE_TURN_LOCK_PATH = path.join(".hermit", "state", "active-turn.lock");
const WORKSPACE_TURN_LOCK_POLL_MS = 250;

export type WorkspaceTurnKind = "interactive" | "heartbeat" | "ask";

export interface WorkspaceTurnOwner {
  id: string;
  kind: WorkspaceTurnKind;
  commandName: string;
  pid: number;
  acquiredAt: string;
  roleId?: string;
}

export interface WorkspaceTurnLock {
  owner: WorkspaceTurnOwner;
  release(): Promise<void>;
}

function getWorkspaceTurnLockPath(root: string): string {
  return path.join(root, WORKSPACE_TURN_LOCK_PATH);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
}

async function unlinkIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}

async function ensureWorkspaceTurnLockParent(root: string): Promise<void> {
  await fs.mkdir(path.dirname(getWorkspaceTurnLockPath(root)), { recursive: true });
}

async function readWorkspaceTurnLockFile(lockPath: string): Promise<WorkspaceTurnOwner | undefined> {
  try {
    const content = await fs.readFile(lockPath, "utf8");
    const parsed = JSON.parse(content) as Partial<WorkspaceTurnOwner>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.kind !== "string" ||
      typeof parsed.commandName !== "string" ||
      typeof parsed.pid !== "number" ||
      typeof parsed.acquiredAt !== "string"
    ) {
      return undefined;
    }

    return {
      id: parsed.id,
      kind: parsed.kind as WorkspaceTurnKind,
      commandName: parsed.commandName,
      pid: parsed.pid,
      acquiredAt: parsed.acquiredAt,
      ...(typeof parsed.roleId === "string" ? { roleId: parsed.roleId } : {}),
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    return undefined;
  }
}

async function clearStaleWorkspaceTurnLock(root: string): Promise<boolean> {
  const lockPath = getWorkspaceTurnLockPath(root);
  const owner = await readWorkspaceTurnLockFile(lockPath);
  if (!owner || isProcessAlive(owner.pid)) {
    return false;
  }

  await unlinkIfExists(lockPath);
  return true;
}

function createWorkspaceTurnOwner(input: {
  kind: WorkspaceTurnKind;
  commandName: string;
  roleId?: string;
}): WorkspaceTurnOwner {
  return {
    id: randomUUID(),
    kind: input.kind,
    commandName: input.commandName,
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
    ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
  };
}

async function acquireWorkspaceTurnLockOnce(
  root: string,
  owner: WorkspaceTurnOwner,
): Promise<WorkspaceTurnLock | undefined> {
  const lockPath = getWorkspaceTurnLockPath(root);
  await ensureWorkspaceTurnLockParent(root);

  try {
    await fs.writeFile(lockPath, JSON.stringify(owner), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
      throw error;
    }

    if (await clearStaleWorkspaceTurnLock(root)) {
      return acquireWorkspaceTurnLockOnce(root, owner);
    }
    return undefined;
  }

  return {
    owner,
    async release() {
      const currentOwner = await readWorkspaceTurnLockFile(lockPath);
      if (currentOwner?.id === owner.id) {
        await unlinkIfExists(lockPath);
      }
    },
  };
}

export async function readWorkspaceTurnLock(root: string): Promise<WorkspaceTurnOwner | undefined> {
  return readWorkspaceTurnLockFile(getWorkspaceTurnLockPath(root));
}

export async function tryAcquireWorkspaceTurnLock(
  root: string,
  owner: {
    kind: WorkspaceTurnKind;
    commandName: string;
    roleId?: string;
  },
): Promise<WorkspaceTurnLock | undefined> {
  return acquireWorkspaceTurnLockOnce(root, createWorkspaceTurnOwner(owner));
}

export async function acquireWorkspaceTurnLock(
  root: string,
  owner: {
    kind: WorkspaceTurnKind;
    commandName: string;
    roleId?: string;
  },
  options: {
    pollMs?: number;
    onWait?: (currentOwner?: WorkspaceTurnOwner) => void;
  } = {},
): Promise<WorkspaceTurnLock> {
  const pollMs = options.pollMs ?? WORKSPACE_TURN_LOCK_POLL_MS;
  const createdOwner = createWorkspaceTurnOwner(owner);
  let hasWaited = false;

  while (true) {
    const lock = await acquireWorkspaceTurnLockOnce(root, createdOwner);
    if (lock) {
      return lock;
    }

    const currentOwner = await readWorkspaceTurnLock(root);
    if (!hasWaited) {
      options.onWait?.(currentOwner);
      hasWaited = true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export function formatWorkspaceTurnOwner(owner: WorkspaceTurnOwner | undefined): string {
  if (!owner) {
    return "another AI turn";
  }

  const roleLabel = owner.roleId ? ` for ${owner.roleId}` : "";
  switch (owner.kind) {
    case "interactive":
      return `interactive turn${roleLabel}`;
    case "heartbeat":
      return `heartbeat turn${roleLabel}`;
    case "ask":
      return `ask turn${roleLabel}`;
    default:
      return `${owner.commandName} turn${roleLabel}`;
  }
}

export async function runCheckpointedTurn(options: {
  root: string;
  commandName: string;
  roleId?: string;
  gitCheckpointsEnabled?: boolean;
  run: () => Promise<void>;
}): Promise<void> {
  await withCheckpoints({
    workspaceRoot: options.root,
    meta: {
      commandName: options.commandName,
      sessionId: randomUUID(),
      ...(options.roleId !== undefined ? { roleId: options.roleId } : {}),
    },
    enabled: options.gitCheckpointsEnabled,
    run: () => options.run(),
  });
}

export async function runInteractiveSessionTurn(options: {
  root: string;
  roleId: string;
  session: AgentSession;
  prompt: string;
  imagePaths?: string[];
  gitCheckpointsEnabled?: boolean;
  onWaitForTurn?: (currentOwner?: WorkspaceTurnOwner) => void;
}): Promise<void> {
  const lock = await acquireWorkspaceTurnLock(
    options.root,
    {
      kind: "interactive",
      commandName: "chat",
      roleId: options.roleId,
    },
    options.onWaitForTurn ? { onWait: options.onWaitForTurn } : {},
  );

  try {
    await runCheckpointedTurn({
      root: options.root,
      commandName: "chat",
      roleId: options.roleId,
      ...(options.gitCheckpointsEnabled !== undefined ? { gitCheckpointsEnabled: options.gitCheckpointsEnabled } : {}),
      run: async () => {
        await options.session.prompt(options.prompt, {
          images: await loadImageAttachments(options.imagePaths ?? []),
        });
      },
    });
  } finally {
    await lock.release();
  }
}
