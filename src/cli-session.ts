import type { AgentSession } from "@mariozechner/pi-coding-agent";
import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";

import { createAbortError } from "./abort.js";
import { withCheckpoints, type CheckpointOutcome } from "./git.js";
import { InteractiveSessionCache, snapshotPreexistingInteractiveSessionKeys } from "./chat-session-cache.js";
import { resolveWorkspaceSessionPath } from "./session-browser.js";
import { HERMIT_ROLE_ID, HERMIT_ROLE_ROOT } from "./constants.js";
import {
  inferRootAndRoleFromCwd,
  loadRole,
  readLastUsedChatRole,
  resolveChatSession,
  resolveRole,
  writeLastUsedChatRole,
} from "./roles.js";
import { runOneShotPrompt, type OneShotPromptRenderOptions } from "./session-loop.js";
import { resolveInitialChatPrompt } from "./session-prompts.js";
import { createHermitSession, createRoleSession, type InteractiveChatSession } from "./session-runtime.js";
import { assertProviderAwareModelConfigured } from "./model-auth.js";
import type { TelemetryRecorder } from "./telemetry-recorder.js";
import type { WorkspaceTurnCoordinator, WorkspaceTurnOwner } from "./turn-control.js";
import type { RoleDefinition, RoleSwitchRequest, SessionHistoryType } from "./types.js";
import { ensureWorkspaceRepository } from "./runtime-paths.js";

export async function resolveRoleContext(explicitRoleId?: string): Promise<{ root: string; roleId: string }> {
  const inferred = inferRootAndRoleFromCwd(process.cwd());
  const root = inferred.root;
  await ensureWorkspaceRepository(root);
  const roleId = explicitRoleId ?? inferred.roleId;

  if (roleId) {
    return { root, roleId };
  }

  const resolved = await resolveRole(root, undefined);
  return { root, roleId: resolved.role.id };
}

export async function resolveWorkspaceRoot(): Promise<string> {
  const root = inferRootAndRoleFromCwd(process.cwd()).root;
  await ensureWorkspaceRepository(root);
  return root;
}

export function collectImagePaths(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => path.resolve(value));
}

export async function resolveSessionContext(options: { role?: string }): Promise<{
  root: string;
  roleId: string;
  role: RoleDefinition;
  promptContext: {
    workspaceRoot: string;
    roleId: string;
    roleRoot: string;
    entityId?: string;
    entityPath?: string;
  };
}> {
  const { root, roleId } = await resolveRoleContext(options.role);
  const role = await loadRole(root, roleId);

  return {
    root,
    roleId,
    role,
    promptContext: buildRolePromptContext(root, role),
  };
}

export function buildRolePromptContext(root: string, role: RoleDefinition): {
  workspaceRoot: string;
  roleId: string;
  roleRoot: string;
} {
  return {
    workspaceRoot: root,
    roleId: role.id,
    roleRoot: path.relative(root, role.roleDir) || ".",
  };
}

export function buildHermitPromptContext(root: string): {
  workspaceRoot: string;
  roleId: string;
  roleRoot: string;
} {
  return {
    workspaceRoot: root,
    roleId: HERMIT_ROLE_ID,
    roleRoot: HERMIT_ROLE_ROOT,
  };
}

export type SessionCommandName = "chat" | "ask" | "heartbeat";

export interface CommandGitContext {
  sessionId: string;
  promptContext: {
    gitBranch?: string;
    gitHeadSha?: string;
    gitHeadShortSha?: string;
    gitHeadSubject?: string;
    gitDirty?: boolean;
    gitCheckpointBeforeSha?: string;
  };
  telemetryContext: {
    sessionId: string;
    gitBranch?: string;
    gitHeadAtStart?: string;
    checkpointBeforeSha?: string;
  };
}

interface TelemetryHandle {
  setGitSessionEndContext(context: {
    gitHeadAtEnd?: string;
    checkpointAfterSha?: string;
    commandOutcome?: CheckpointOutcome;
  }): void;
  close(): Promise<void>;
}

export const DISABLE_GIT_CHECKPOINTS_OPTION_DESCRIPTION =
  "Disable automatic git checkpoint commits before and after the command.";

class TelemetryCollection implements TelemetryHandle {
  private readonly recorders: TelemetryHandle[] = [];

  add(recorder: TelemetryHandle): void {
    this.recorders.push(recorder);
  }

  setGitSessionEndContext(context: { gitHeadAtEnd?: string; checkpointAfterSha?: string; commandOutcome?: CheckpointOutcome }): void {
    for (const recorder of this.recorders) {
      recorder.setGitSessionEndContext(context);
    }
  }

  async close(): Promise<void> {
    for (const recorder of this.recorders) {
      await recorder.close();
    }
  }
}

async function withGitCheckpoint(options: {
  root: string;
  commandName: SessionCommandName;
  roleId?: string;
  gitCheckpointsEnabled?: boolean;
  run: (context: CommandGitContext) => Promise<TelemetryHandle | undefined>;
}): Promise<void> {
  const sessionId = randomUUID();
  let telemetry: TelemetryHandle | undefined;

  await withCheckpoints({
    workspaceRoot: options.root,
    meta: {
      commandName: options.commandName,
      sessionId,
      ...(options.roleId !== undefined ? { roleId: options.roleId } : {}),
    },
    enabled: options.gitCheckpointsEnabled,
    run: async (beforeStates) => {
      const startState = beforeStates.get(options.root);
      const context: CommandGitContext = {
        sessionId,
        promptContext: {
          ...(startState?.branch !== undefined ? { gitBranch: startState.branch } : {}),
          ...(startState?.headSha !== undefined ? { gitHeadSha: startState.headSha } : {}),
          ...(startState?.headShortSha !== undefined ? { gitHeadShortSha: startState.headShortSha } : {}),
          ...(startState?.headSubject !== undefined ? { gitHeadSubject: startState.headSubject } : {}),
          ...(startState !== undefined ? { gitDirty: startState.dirty } : {}),
        },
        telemetryContext: {
          sessionId,
          ...(startState?.branch !== undefined ? { gitBranch: startState.branch } : {}),
          ...(startState?.headSha !== undefined ? { gitHeadAtStart: startState.headSha } : {}),
        },
      };
      telemetry = await options.run(context);
    },
    onComplete: async ({ outcome, afterStates, checkpoints }) => {
      const afterState = afterStates.get(options.root);
      const checkpointAfter = checkpoints.get(options.root);
      const endHead = checkpointAfter ?? afterState;
      telemetry?.setGitSessionEndContext({
        ...(endHead?.headSha !== undefined ? { gitHeadAtEnd: endHead.headSha } : {}),
        ...(checkpointAfter?.checkpointSha !== undefined ? { checkpointAfterSha: checkpointAfter.checkpointSha } : {}),
        commandOutcome: outcome,
      });
      await telemetry?.close();
    },
  });
}

export interface HeartbeatExecutionResult {
  status: "ran" | "skipped";
  activeTurnOwner?: WorkspaceTurnOwner;
}

export interface OneShotCommandSession {
  session: AgentSession;
  telemetry: TelemetryRecorder;
  modelLabel: string;
  activeRoleLabel: string;
}

export async function runManagedOneShotCommand(options: {
  root: string;
  commandName: SessionCommandName;
  roleId: string;
  turnKind: "ask" | "heartbeat";
  gitCheckpointsEnabled?: boolean;
  turnCoordinator?: WorkspaceTurnCoordinator;
  turnMode?: "wait" | "skip";
  onWaitForTurn?: (owner?: WorkspaceTurnOwner) => void;
  createSession: (gitContext: CommandGitContext) => Promise<OneShotCommandSession>;
  resolvePrompt: () => Promise<string>;
  imagePaths?: string[];
  isCancelled?: () => boolean;
  cancelMessage?: string;
  registerActiveAbort?: (abortActiveSession?: (() => Promise<void>) | undefined) => void;
  renderOptions?: OneShotPromptRenderOptions;
}): Promise<HeartbeatExecutionResult> {
  const turn = options.turnCoordinator
    ? await options.turnCoordinator.acquire(
        {
          kind: options.turnKind,
          commandName: options.commandName,
          roleId: options.roleId,
        },
        {
          mode: options.turnMode ?? "wait",
          ...(options.onWaitForTurn ? { onWait: options.onWaitForTurn } : {}),
        },
      )
    : undefined;
  if (options.turnCoordinator && !turn) {
    const activeTurnOwner = options.turnCoordinator.getActiveOwner();
    return {
      status: "skipped",
      ...(activeTurnOwner ? { activeTurnOwner } : {}),
    };
  }

  try {
    await withGitCheckpoint({
      root: options.root,
      commandName: options.commandName,
      roleId: options.roleId,
      ...(options.gitCheckpointsEnabled !== undefined ? { gitCheckpointsEnabled: options.gitCheckpointsEnabled } : {}),
      run: async (gitContext) => {
        const sessionContext = await options.createSession(gitContext);
        options.registerActiveAbort?.(async () => {
          await sessionContext.session.abort();
        });

        try {
          if (options.isCancelled?.()) {
            throw createAbortError(options.cancelMessage ?? `${options.commandName} aborted the active session.`);
          }

          await runOneShotPrompt(
            sessionContext.session,
            await options.resolvePrompt(),
            options.imagePaths ?? [],
            sessionContext.telemetry,
            sessionContext.activeRoleLabel,
            sessionContext.modelLabel,
            options.renderOptions,
          );
          return sessionContext.telemetry;
        } finally {
          options.registerActiveAbort?.(undefined);
        }
      },
    });

    return { status: "ran" };
  } finally {
    await turn?.release();
  }
}

type ChatSessionTarget = Awaited<ReturnType<typeof resolveChatSession>>;

interface InteractiveChatSessionLoad {
  continueRecent?: boolean;
  continueSessionPath?: string;
  sessionHistoryType?: SessionHistoryType;
}

async function buildInteractiveChatSession(
  target: ChatSessionTarget,
  gitContext: CommandGitContext,
  load: InteractiveChatSessionLoad = {},
): Promise<InteractiveChatSession> {
  const sessionOptions = {
    persist: true as const,
    ...(load.continueRecent ? { continueRecent: true } : {}),
    ...(load.continueSessionPath !== undefined
      ? {
          continueSessionPath: load.continueSessionPath,
          ...(load.sessionHistoryType !== undefined ? { sessionHistoryType: load.sessionHistoryType } : {}),
        }
      : {}),
  };
  let pendingRoleSwitch: RoleSwitchRequest | undefined;
  const onRoleSwitchRequest = (request: RoleSwitchRequest) => {
    pendingRoleSwitch = request;
  };

  const sessionContext =
    target.kind === "hermit"
      ? await createHermitSession({
          root: target.root,
          bootstrapMode: target.bootstrapMode,
          startupIssues: target.startupIssues,
          telemetryCommandName: "chat",
          telemetryContext: gitContext.telemetryContext,
          promptContext: {
            ...buildHermitPromptContext(target.root),
            ...gitContext.promptContext,
          },
          onRoleSwitchRequest,
          ...sessionOptions,
        })
      : await createRoleSession({
          root: target.root,
          role: target.role,
          telemetryCommandName: "chat",
          telemetryContext: gitContext.telemetryContext,
          promptContext: {
            ...buildRolePromptContext(target.root, target.role),
            ...gitContext.promptContext,
          },
          onRoleSwitchRequest,
          ...sessionOptions,
        });

  return {
    ...sessionContext,
    activeRoleLabel: target.kind === "role" ? target.role.id : HERMIT_ROLE_ID,
    consumeRoleSwitchRequest: () => {
      const request = pendingRoleSwitch;
      pendingRoleSwitch = undefined;
      return request;
    },
  };
}

function getChatSessionKey(target: ChatSessionTarget): string {
  return target.kind === "role" ? target.role.id : HERMIT_ROLE_ID;
}

function parseContinueOption(value: boolean | string | undefined): {
  continueRecent: boolean;
  sessionPath?: string;
} {
  if (value === undefined || value === false) {
    return { continueRecent: false };
  }
  if (value === true) {
    return { continueRecent: true };
  }
  const sessionPath = value.trim();
  return sessionPath.length > 0 ? { continueRecent: false, sessionPath } : { continueRecent: true };
}

export interface InteractiveChatCommandOptions {
  role?: string;
  continue?: boolean | string;
  image?: string[];
  prompt?: string;
  gitCheckpoints?: boolean;
}

export async function runInteractiveChatCommand(
  options: InteractiveChatCommandOptions,
  runLoop: (context: {
    resolved: ChatSessionTarget;
    initialSession: InteractiveChatSession;
    initialPrompt?: string;
    initialImages: string[];
    onRoleSwitch: (request: RoleSwitchRequest, previousRoleLabel: string) => Promise<InteractiveChatSession>;
  }) => Promise<void>,
): Promise<void> {
  assertProviderAwareModelConfigured();
  const inferred = inferRootAndRoleFromCwd(process.cwd());
  const { continueRecent, sessionPath: continueSessionPath } = parseContinueOption(options.continue);

  let sessionFile: { roleId: string; path: string; historyType: SessionHistoryType } | undefined;
  if (continueSessionPath !== undefined) {
    sessionFile = await resolveWorkspaceSessionPath(inferred.root, continueSessionPath);
    if (options.role !== undefined && options.role !== sessionFile.roleId) {
      throw new Error(
        `Session belongs to role ${sessionFile.roleId}, but --role ${options.role} was specified.`,
      );
    }
  }

  const lastRoleId =
    options.role === undefined && inferred.roleId === undefined && sessionFile === undefined
      ? await readLastUsedChatRole(inferred.root)
      : undefined;
  const explicitRoleId = options.role ?? sessionFile?.roleId;
  const resolved = await resolveChatSession(inferred.root, {
    ...(explicitRoleId !== undefined ? { explicitRoleId } : {}),
    ...(inferred.roleId !== undefined ? { inferredRoleId: inferred.roleId } : {}),
    ...(lastRoleId !== undefined ? { lastRoleId } : {}),
  });
  await ensureWorkspaceRepository(resolved.root);
  const initialRoleId = resolved.kind === "role" ? resolved.role.id : HERMIT_ROLE_ID;
  await writeLastUsedChatRole(resolved.root, initialRoleId);
  await withGitCheckpoint({
    root: resolved.root,
    commandName: "chat",
    roleId: initialRoleId,
    gitCheckpointsEnabled: false,
    run: async (gitContext) => {
      const telemetry = new TelemetryCollection();
      const sessionCache = new InteractiveSessionCache(
        continueRecent,
        await snapshotPreexistingInteractiveSessionKeys(resolved.root),
      );

      const getOrCreateSession = async (target: ChatSessionTarget) => {
        return sessionCache.getOrCreate(getChatSessionKey(target), async (shouldContinueRecent) => {
          const session = await buildInteractiveChatSession(target, gitContext, {
            continueRecent: shouldContinueRecent,
          });
          telemetry.add(session.telemetry);
          return session;
        });
      };

      const onRoleSwitch = async (request: RoleSwitchRequest): Promise<InteractiveChatSession> => {
        const nextTarget = await resolveChatSession(resolved.root, { explicitRoleId: request.roleId });
        await writeLastUsedChatRole(resolved.root, request.roleId);
        return (await getOrCreateSession(nextTarget)).session;
      };

      const initialEntry = sessionFile
        ? {
            session: await buildInteractiveChatSession(resolved, gitContext, {
              continueSessionPath: sessionFile.path,
              sessionHistoryType: sessionFile.historyType,
            }),
            continuedFromPersistedSession: true,
          }
        : await getOrCreateSession(resolved);
      const initialPrompt = resolveInitialChatPrompt({
        workspaceState: initialEntry.session.workspaceState,
        hasStartupIssues: resolved.startupIssues.length > 0,
        ...(options.prompt !== undefined ? { initialPrompt: options.prompt } : {}),
        ...(initialEntry.continuedFromPersistedSession ? { continueRecent: true } : {}),
      });

      await runLoop({
        resolved,
        initialSession: initialEntry.session,
        ...(initialPrompt !== undefined ? { initialPrompt } : {}),
        initialImages: collectImagePaths(options.image),
        onRoleSwitch,
      });
      return telemetry;
    },
  });
}
