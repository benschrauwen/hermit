import { randomUUID } from "node:crypto";

import type { AgentSession } from "@mariozechner/pi-coding-agent";

import { withCheckpoints } from "./git.js";
import { loadImageAttachments } from "./image-attachments.js";

export type WorkspaceTurnKind = "interactive" | "heartbeat" | "ask";

export interface WorkspaceTurnOwner {
  id: string;
  kind: WorkspaceTurnKind;
  commandName: string;
  acquiredAt: string;
  roleId?: string;
}

export interface WorkspaceTurnHandle {
  owner: WorkspaceTurnOwner;
  release(): Promise<void>;
}

export interface WorkspaceTurnCoordinator {
  getActiveOwner(): WorkspaceTurnOwner | undefined;
  acquire(
    owner: {
      kind: WorkspaceTurnKind;
      commandName: string;
      roleId?: string;
    },
    options?: {
      mode?: "wait" | "skip";
      onWait?: (currentOwner?: WorkspaceTurnOwner) => void;
    },
  ): Promise<WorkspaceTurnHandle | undefined>;
}

interface PendingWorkspaceTurnWaiter {
  owner: WorkspaceTurnOwner;
  resolve: (handle: WorkspaceTurnHandle) => void;
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
    acquiredAt: new Date().toISOString(),
    ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
  };
}

export function createWorkspaceTurnCoordinator(): WorkspaceTurnCoordinator {
  let activeOwner: WorkspaceTurnOwner | undefined;
  const waiters: PendingWorkspaceTurnWaiter[] = [];

  const activateNextWaiter = (): void => {
    if (activeOwner || waiters.length === 0) {
      return;
    }

    const nextWaiter = waiters.shift();
    if (!nextWaiter) {
      return;
    }

    activeOwner = nextWaiter.owner;
    nextWaiter.resolve(createHandle(nextWaiter.owner));
  };

  const createHandle = (owner: WorkspaceTurnOwner): WorkspaceTurnHandle => ({
    owner,
    async release() {
      if (activeOwner?.id !== owner.id) {
        return;
      }

      activeOwner = undefined;
      activateNextWaiter();
    },
  });

  return {
    getActiveOwner(): WorkspaceTurnOwner | undefined {
      return activeOwner;
    },
    async acquire(ownerInput, options = {}): Promise<WorkspaceTurnHandle | undefined> {
      const owner = createWorkspaceTurnOwner(ownerInput);
      if (!activeOwner) {
        activeOwner = owner;
        return createHandle(owner);
      }

      if (options.mode === "skip") {
        return undefined;
      }

      options.onWait?.(activeOwner);
      return new Promise<WorkspaceTurnHandle>((resolve) => {
        waiters.push({ owner, resolve });
      });
    },
  };
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
  turnCoordinator?: WorkspaceTurnCoordinator;
  onWaitForTurn?: (currentOwner?: WorkspaceTurnOwner) => void;
  onTurnStarted?: () => void;
}): Promise<void> {
  const turn = options.turnCoordinator
    ? await options.turnCoordinator.acquire(
        {
          kind: "interactive",
          commandName: "chat",
          roleId: options.roleId,
        },
        options.onWaitForTurn ? { onWait: options.onWaitForTurn } : {},
      )
    : undefined;

  try {
    await runCheckpointedTurn({
      root: options.root,
      commandName: "chat",
      roleId: options.roleId,
      ...(options.gitCheckpointsEnabled !== undefined ? { gitCheckpointsEnabled: options.gitCheckpointsEnabled } : {}),
      run: async () => {
        const maybeWaitForIdle = options.session as AgentSession & {
          waitForIdle?: () => Promise<void>;
        };
        const promptPromise = options.session.prompt(options.prompt, {
          images: await loadImageAttachments(options.imagePaths ?? []),
        });
        options.onTurnStarted?.();
        await promptPromise;
        await maybeWaitForIdle.waitForIdle?.();
      },
    });
  } finally {
    await turn?.release();
  }
}
