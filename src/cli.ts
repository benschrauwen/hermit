#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import matter from "gray-matter";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { printDoctorContext, runDoctor } from "./doctor.js";
import { createCheckpoint, getRepoState, shouldCheckpoint, shouldCheckpointForOutcome, type CheckpointOutcome } from "./git.js";
import {
  createHeartbeatDaemonController,
  DEFAULT_HEARTBEAT_DAEMON_INTERVAL,
  formatHeartbeatDaemonDuration,
  parseHeartbeatDaemonInterval,
  planHeartbeatDaemonCycle,
  resolveHeartbeatDaemonDelay,
  runHeartbeatCycle,
} from "./heartbeat-daemon.js";
import { runTranscriptIngest } from "./ingest.js";
import { InteractiveSessionCache, snapshotPreexistingInteractiveSessionKeys } from "./chat-session-cache.js";
import { HERMIT_ROLE_ID, HERMIT_ROLE_ROOT } from "./constants.js";
import {
  inferRootAndRoleFromCwd,
  listRoleIds,
  loadRole,
  readLastUsedChatRole,
  resolveChatSession,
  resolveRole,
  writeLastUsedChatRole,
} from "./roles.js";
import {
  createHermitSession,
  createRoleSession,
  DEFAULT_HEARTBEAT_PROMPT,
  HERMIT_STRATEGIC_REVIEW_PROMPT,
  type InteractiveChatSession,
  type RoleSwitchRequest,
  STRATEGIC_REVIEW_HEARTBEAT_PROMPT,
  resolveInitialChatPrompt,
  runChatLoop,
  runOneShotPrompt,
} from "./session.js";
import { assertProviderAwareModelConfigured } from "./model-auth.js";
import { generateTelemetryReport, renderTelemetryReportSummary, writeTelemetryReport } from "./telemetry.js";
import type { RoleDefinition } from "./types.js";
import { ensureWorkspaceScaffold } from "./workspace.js";

async function resolveRoleContext(explicitRoleId?: string): Promise<{ root: string; roleId: string }> {
  const inferred = inferRootAndRoleFromCwd(process.cwd());
  const root = inferred.root;
  const roleId = explicitRoleId ?? inferred.roleId;

  if (roleId) {
    return { root, roleId };
  }

  const resolved = await resolveRole(root, undefined);
  return { root, roleId: resolved.role.id };
}

function resolveWorkspaceRoot(): string {
  return inferRootAndRoleFromCwd(process.cwd()).root;
}

function collectImagePaths(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => path.resolve(value));
}

async function resolveSessionContext(options: { role?: string }): Promise<{
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

function buildRolePromptContext(root: string, role: RoleDefinition): {
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

function buildHermitPromptContext(root: string): {
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

const STRATEGIC_REVIEW_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function isStrategicReviewDueForRecord(recordPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(recordPath, "utf-8");
    const { data } = matter(content);
    const lastReview = data.last_strategic_review;
    if (!lastReview) return true;
    const lastDate = new Date(lastReview);
    if (isNaN(lastDate.getTime())) return true;
    return Date.now() - lastDate.getTime() > STRATEGIC_REVIEW_INTERVAL_MS;
  } catch {
    return false;
  }
}

async function isStrategicReviewDue(role: RoleDefinition): Promise<boolean> {
  return isStrategicReviewDueForRecord(path.join(role.roleDir, "agent", "record.md"));
}

async function isHermitStrategicReviewDue(root: string): Promise<boolean> {
  return isStrategicReviewDueForRecord(path.join(root, HERMIT_ROLE_ROOT, "agent", "record.md"));
}

async function shouldRunStrategicReviewSweep(root: string, roles: RoleDefinition[]): Promise<boolean> {
  if (await isHermitStrategicReviewDue(root)) {
    return true;
  }

  for (const role of roles) {
    if (await isStrategicReviewDue(role)) {
      return true;
    }
  }

  return false;
}

type SessionCommandName = "chat" | "ask" | "heartbeat";

interface CommandGitContext {
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

const DISABLE_GIT_CHECKPOINTS_OPTION_DESCRIPTION = "Disable automatic git checkpoint commits before and after the command.";

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

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /\babort(?:ed|ing)?\b/i.test(message);
}

function createAbortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

async function withGitCheckpoint(options: {
  root: string;
  commandName: SessionCommandName;
  roleId?: string;
  gitCheckpointsEnabled?: boolean;
  run: (context: CommandGitContext) => Promise<TelemetryHandle | undefined>;
}): Promise<void> {
  const sessionId = randomUUID();
  const gitCheckpointsEnabled = options.gitCheckpointsEnabled !== false;
  const checkpointMeta = {
    commandName: options.commandName,
    sessionId,
    ...(options.roleId !== undefined ? { roleId: options.roleId } : {}),
  };

  const beforeState = await getRepoState(options.root);
  const checkpointBefore = shouldCheckpoint(beforeState, gitCheckpointsEnabled)
    ? await createCheckpoint(options.root, { ...checkpointMeta, phase: "before" })
    : undefined;

  const startState = checkpointBefore ? await getRepoState(options.root) : beforeState;
  const context: CommandGitContext = {
    sessionId,
    promptContext: {
      ...(startState?.branch !== undefined ? { gitBranch: startState.branch } : {}),
      ...(startState?.headSha !== undefined ? { gitHeadSha: startState.headSha } : {}),
      ...(startState?.headShortSha !== undefined ? { gitHeadShortSha: startState.headShortSha } : {}),
      ...(startState?.headSubject !== undefined ? { gitHeadSubject: startState.headSubject } : {}),
      ...(startState !== undefined ? { gitDirty: startState.dirty } : {}),
      ...(checkpointBefore?.checkpointSha !== undefined ? { gitCheckpointBeforeSha: checkpointBefore.checkpointSha } : {}),
    },
    telemetryContext: {
      sessionId,
      ...(startState?.branch !== undefined ? { gitBranch: startState.branch } : {}),
      ...(startState?.headSha !== undefined ? { gitHeadAtStart: startState.headSha } : {}),
      ...(checkpointBefore?.checkpointSha !== undefined ? { checkpointBeforeSha: checkpointBefore.checkpointSha } : {}),
    },
  };

  let telemetry: TelemetryHandle | undefined;
  let commandOutcome: CheckpointOutcome = "success";
  try {
    telemetry = await options.run(context);
  } catch (error) {
    commandOutcome = isAbortError(error) ? "aborted" : "failed";
    throw error;
  } finally {
    const afterState = await getRepoState(options.root);
    const checkpointAfter = shouldCheckpointForOutcome(afterState, commandOutcome, gitCheckpointsEnabled)
      ? await createCheckpoint(options.root, { ...checkpointMeta, phase: "after", outcome: commandOutcome })
      : undefined;
    const endHead = checkpointAfter ?? afterState;

    telemetry?.setGitSessionEndContext({
      ...(endHead?.headSha !== undefined ? { gitHeadAtEnd: endHead.headSha } : {}),
      ...(checkpointAfter?.checkpointSha !== undefined ? { checkpointAfterSha: checkpointAfter.checkpointSha } : {}),
      commandOutcome,
    });
    await telemetry?.close();
  }
}

interface HeartbeatRunOptions {
  continue?: boolean;
  prompt?: string;
  strategicReview?: boolean;
  automaticStrategicReview?: boolean;
}

async function resolveHeartbeatPrompt(role: RoleDefinition, options: HeartbeatRunOptions): Promise<string> {
  if (options.prompt) {
    return options.prompt;
  }
  if (options.strategicReview || options.automaticStrategicReview !== false && await isStrategicReviewDue(role)) {
    return STRATEGIC_REVIEW_HEARTBEAT_PROMPT;
  }
  return DEFAULT_HEARTBEAT_PROMPT;
}

async function runHeartbeatForRole(options: {
  root: string;
  role: RoleDefinition;
  promptContext: {
    workspaceRoot: string;
    roleId: string;
    roleRoot: string;
  };
  continueRecent?: boolean;
  prompt?: string;
  strategicReview?: boolean;
  automaticStrategicReview?: boolean;
  gitCheckpointsEnabled?: boolean;
  isCancelled?: () => boolean;
  registerActiveAbort?: (abortActiveSession?: (() => Promise<void>) | undefined) => void;
}): Promise<void> {
  await withGitCheckpoint({
    root: options.root,
    commandName: "heartbeat",
    roleId: options.role.id,
    ...(options.gitCheckpointsEnabled !== undefined ? { gitCheckpointsEnabled: options.gitCheckpointsEnabled } : {}),
    run: async (gitContext) => {
      const { session, telemetry, modelLabel } = await createRoleSession({
        root: options.root,
        role: options.role,
        persist: true,
        continueRecent: Boolean(options.continueRecent),
        sessionHistoryType: "heartbeat",
        telemetryCommandName: "heartbeat",
        telemetryContext: gitContext.telemetryContext,
        promptContext: {
          ...options.promptContext,
          ...gitContext.promptContext,
        },
      });

      const abortActiveSession = async () => {
        await session.abort();
      };
      options.registerActiveAbort?.(abortActiveSession);

      try {
        if (options.isCancelled?.()) {
          throw createAbortError("Heartbeat daemon aborted the active role session.");
        }

        const heartbeatPrompt = await resolveHeartbeatPrompt(options.role, {
          ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
          ...(options.strategicReview !== undefined ? { strategicReview: options.strategicReview } : {}),
          ...(options.automaticStrategicReview !== undefined
            ? { automaticStrategicReview: options.automaticStrategicReview }
            : {}),
        });
        await runOneShotPrompt(session, heartbeatPrompt, [], telemetry, options.role.id, modelLabel);
        return telemetry;
      } finally {
        options.registerActiveAbort?.(undefined);
      }
    },
  });
}

async function runStrategicReviewForHermit(options: {
  root: string;
  continueRecent?: boolean;
  gitCheckpointsEnabled?: boolean;
  isCancelled?: () => boolean;
  registerActiveAbort?: (abortActiveSession?: (() => Promise<void>) | undefined) => void;
}): Promise<void> {
  await withGitCheckpoint({
    root: options.root,
    commandName: "heartbeat",
    roleId: HERMIT_ROLE_ID,
    ...(options.gitCheckpointsEnabled !== undefined ? { gitCheckpointsEnabled: options.gitCheckpointsEnabled } : {}),
    run: async (gitContext) => {
      const { session, telemetry, modelLabel } = await createHermitSession({
        root: options.root,
        persist: true,
        continueRecent: Boolean(options.continueRecent),
        sessionHistoryType: "heartbeat",
        bootstrapMode: false,
        telemetryCommandName: "heartbeat",
        telemetryContext: gitContext.telemetryContext,
        promptContext: {
          ...buildHermitPromptContext(options.root),
          ...gitContext.promptContext,
        },
      });

      const abortActiveSession = async () => {
        await session.abort();
      };
      options.registerActiveAbort?.(abortActiveSession);

      try {
        if (options.isCancelled?.()) {
          throw createAbortError("Heartbeat daemon aborted the active Hermit strategic-review session.");
        }

        await runOneShotPrompt(session, HERMIT_STRATEGIC_REVIEW_PROMPT, [], telemetry, HERMIT_ROLE_ID, modelLabel);
        return telemetry;
      } finally {
        options.registerActiveAbort?.(undefined);
      }
    },
  });
}

function formatDaemonTimestamp(date = new Date()): string {
  return date.toISOString();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sleepUntilNextHeartbeat(ms: number, isRunning: () => boolean): Promise<void> {
  if (ms <= 0 || !isRunning()) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onSignal = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timeout);
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    };

    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });
}

type ChatSessionTarget = Awaited<ReturnType<typeof resolveChatSession>>;

async function buildInteractiveChatSession(
  target: ChatSessionTarget,
  gitContext: CommandGitContext,
  continueRecent: boolean,
): Promise<InteractiveChatSession> {
  let pendingRoleSwitch: RoleSwitchRequest | undefined;
  const onRoleSwitchRequest = (request: RoleSwitchRequest) => {
    pendingRoleSwitch = request;
  };

  const sessionContext =
    target.kind === "hermit"
      ? await createHermitSession({
          root: target.root,
          persist: true,
          continueRecent,
          bootstrapMode: target.bootstrapMode,
          telemetryCommandName: "chat",
          telemetryContext: gitContext.telemetryContext,
          promptContext: {
            ...buildHermitPromptContext(target.root),
            ...gitContext.promptContext,
          },
          onRoleSwitchRequest,
        })
      : await createRoleSession({
          root: target.root,
          role: target.role,
          persist: true,
          continueRecent,
          telemetryCommandName: "chat",
          telemetryContext: gitContext.telemetryContext,
          promptContext: {
            workspaceRoot: target.root,
            roleId: target.role.id,
            roleRoot: path.relative(target.root, target.role.roleDir) || ".",
            ...gitContext.promptContext,
          },
          onRoleSwitchRequest,
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

const program = new Command();

program.name("hermit").description("Local file-first runtime for autonomous applications").version("0.1.0");

program
  .command("chat")
  .description("Open an interactive chat session.")
  .option("--no-git-checkpoints", DISABLE_GIT_CHECKPOINTS_OPTION_DESCRIPTION)
  .option("--role <id>", "Role ID to run.")
  .option("--continue", "Continue the most recent persisted session for this workspace.")
  .option("--image <path>", "Attach image(s) to the initial prompt.", (value, previous: string[] = []) => [...previous, value], [])
  .option("--prompt <text>", "Optional initial prompt before the interactive loop starts.")
  .action(
    async (options: {
      role?: string;
      continue?: boolean;
      image?: string[];
      prompt?: string;
      gitCheckpoints?: boolean;
    }) => {
      assertProviderAwareModelConfigured();
      const inferred = inferRootAndRoleFromCwd(process.cwd());
      const lastRoleId =
        options.role === undefined && inferred.roleId === undefined
          ? await readLastUsedChatRole(inferred.root)
          : undefined;
      const resolved = await resolveChatSession(inferred.root, {
        ...(options.role !== undefined ? { explicitRoleId: options.role } : {}),
        ...(inferred.roleId !== undefined ? { inferredRoleId: inferred.roleId } : {}),
        ...(lastRoleId !== undefined ? { lastRoleId } : {}),
      });
      const initialRoleId = resolved.kind === "role" ? resolved.role.id : HERMIT_ROLE_ID;
      await writeLastUsedChatRole(resolved.root, initialRoleId);
      await withGitCheckpoint({
        root: resolved.root,
        commandName: "chat",
        roleId: initialRoleId,
        ...(options.gitCheckpoints !== undefined ? { gitCheckpointsEnabled: options.gitCheckpoints } : {}),
        run: async (gitContext) => {
          const telemetry = new TelemetryCollection();
          const sessionCache = new InteractiveSessionCache(
            Boolean(options.continue),
            await snapshotPreexistingInteractiveSessionKeys(resolved.root),
          );

          const getOrCreateSession = async (target: ChatSessionTarget) => {
            return sessionCache.getOrCreate(getChatSessionKey(target), async (continueRecent) => {
              const session = await buildInteractiveChatSession(target, gitContext, continueRecent);
              telemetry.add(session.telemetry);
              return session;
            });
          };

          const initialEntry = await getOrCreateSession(resolved);
          const initialPrompt = resolveInitialChatPrompt({
            workspaceState: initialEntry.session.workspaceState,
            ...(options.prompt !== undefined ? { initialPrompt: options.prompt } : {}),
            ...(initialEntry.continuedFromPersistedSession ? { continueRecent: true } : {}),
          });

          await runChatLoop({
            initialSession: initialEntry.session,
            ...(initialPrompt !== undefined ? { initialPrompt } : {}),
            initialImages: collectImagePaths(options.image),
            onRoleSwitch: async (request) => {
              const nextTarget = await resolveChatSession(resolved.root, { explicitRoleId: request.roleId });
              await writeLastUsedChatRole(resolved.root, request.roleId);
              return (await getOrCreateSession(nextTarget)).session;
            },
          });

          return telemetry;
        },
      });
    },
  );

program
  .command("ask")
  .description("Run a one-shot prompt in the selected role session.")
  .option("--no-git-checkpoints", DISABLE_GIT_CHECKPOINTS_OPTION_DESCRIPTION)
  .option("--role <id>", "Role ID to run.")
  .option("--image <path>", "Attach image(s) to the prompt.", (value, previous: string[] = []) => [...previous, value], [])
  .argument("<prompt...>", "Prompt text to send to the agent.")
  .action(
    async (
      promptParts: string[],
      options: {
        role?: string;
        image?: string[];
        gitCheckpoints?: boolean;
      },
    ) => {
      assertProviderAwareModelConfigured();
      const { root, role, promptContext } = await resolveSessionContext(options);
      await withGitCheckpoint({
        root,
        commandName: "ask",
        roleId: role.id,
        ...(options.gitCheckpoints !== undefined ? { gitCheckpointsEnabled: options.gitCheckpoints } : {}),
        run: async (gitContext) => {
          const { session, telemetry, modelLabel } = await createRoleSession({
            root,
            role,
            persist: false,
            telemetryCommandName: "ask",
            telemetryContext: gitContext.telemetryContext,
            promptContext: {
              ...promptContext,
              ...gitContext.promptContext,
            },
          });

          await runOneShotPrompt(
            session,
            promptParts.join(" "),
            collectImagePaths(options.image),
            telemetry,
            role.id,
            modelLabel,
          );
          return telemetry;
        },
      });
    },
  );

program
  .command("heartbeat")
  .description("Run one autonomous background upkeep turn for the selected role.")
  .option("--no-git-checkpoints", DISABLE_GIT_CHECKPOINTS_OPTION_DESCRIPTION)
  .option("--role <id>", "Role ID to run.")
  .option("--continue", "Continue the most recent persisted heartbeat session for this role.")
  .option("--prompt <text>", "Optional heartbeat prompt override.")
  .option("--strategic-review", "Force a full strategic review instead of normal task advancement.")
  .action(
    async (options: {
      role?: string;
      continue?: boolean;
      prompt?: string;
      strategicReview?: boolean;
      gitCheckpoints?: boolean;
    }) => {
      assertProviderAwareModelConfigured();
      const { root, role } = await resolveSessionContext(options);
      await runHeartbeatForRole({
        root,
        role,
        promptContext: buildRolePromptContext(root, role),
        ...(options.continue !== undefined ? { continueRecent: options.continue } : {}),
        ...(options.prompt !== undefined ? { prompt: options.prompt } : {}),
        ...(options.strategicReview !== undefined ? { strategicReview: options.strategicReview } : {}),
        ...(options.gitCheckpoints !== undefined ? { gitCheckpointsEnabled: options.gitCheckpoints } : {}),
      });
    },
  );

program
  .command("heartbeat-daemon")
  .description("Run role heartbeats on a repeating interval and a combined daily strategic-review sweep when due.")
  .option("--no-git-checkpoints", DISABLE_GIT_CHECKPOINTS_OPTION_DESCRIPTION)
  .option(
    "--interval <duration>",
    'Delay between heartbeat cycles. Use a whole number followed by ms, s, m, or h (for example "30m" or "1h").',
    DEFAULT_HEARTBEAT_DAEMON_INTERVAL,
  )
  .option("--continue", "Continue the most recent persisted heartbeat or strategic-review session for each target.")
  .action(async (options: { interval: string; continue?: boolean; gitCheckpoints?: boolean }) => {
    assertProviderAwareModelConfigured();
    const root = resolveWorkspaceRoot();
    const intervalMs = parseHeartbeatDaemonInterval(options.interval);

    const daemonController = createHeartbeatDaemonController({
      onAbortError: (error) => {
        console.error(
          `[${formatDaemonTimestamp()}] Failed to abort the active daemon session: ${getErrorMessage(error)}`,
        );
      },
    });
    let firstCycle = true;

    const stop = (signal: NodeJS.Signals) => {
      const stopResult = daemonController.stop();
      if (!stopResult.requested) {
        return;
      }
      console.log(
        stopResult.abortedActiveSession
          ? `[${formatDaemonTimestamp()}] Received ${signal}. Aborting the active session and stopping heartbeat daemon.`
          : `[${formatDaemonTimestamp()}] Received ${signal}. Stopping heartbeat daemon.`,
      );
    };

    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);

    try {
      console.log(
        `[${formatDaemonTimestamp()}] Heartbeat daemon started. Running role heartbeats every ${formatHeartbeatDaemonDuration(intervalMs)} and a combined daily strategic-review sweep when due.`,
      );

      while (daemonController.isRunning()) {
        await ensureWorkspaceScaffold(root);
        const roleIds = await listRoleIds(root);
        const roles: RoleDefinition[] = [];
        for (const roleId of roleIds) {
          const role = await loadRole(root, roleId);
          await ensureWorkspaceScaffold(root, role);
          roles.push(role);
        }
        const strategicReviewSweepDue = await shouldRunStrategicReviewSweep(root, roles);
        const cyclePlan = planHeartbeatDaemonCycle(roleIds, strategicReviewSweepDue);
        const cycleLabel = cyclePlan.mode === "strategic-review" ? "strategic review" : "heartbeat";

        if (cyclePlan.mode === "wait") {
          const waitLabel = firstCycle
            ? "No roles are configured. Monitoring Hermit strategic review only."
            : "No roles are currently configured. Monitoring Hermit strategic review only.";
          firstCycle = false;
          console.log(
            `[${formatDaemonTimestamp()}] ${waitLabel} Waiting ${formatHeartbeatDaemonDuration(intervalMs)} before checking again.`,
          );
          await sleepUntilNextHeartbeat(intervalMs, () => daemonController.isRunning());
          continue;
        }

        firstCycle = false;
        console.log(
          cyclePlan.mode === "strategic-review" && roleIds.length === 0
            ? `[${formatDaemonTimestamp()}] Starting Hermit strategic-review sweep with no configured roles.`
            : cyclePlan.mode === "strategic-review"
            ? `[${formatDaemonTimestamp()}] Starting combined strategic-review sweep for Hermit plus ${roleIds.length} role(s): ${roleIds.join(", ")}.`
            : `[${formatDaemonTimestamp()}] Starting heartbeat cycle for ${roleIds.length} role(s): ${roleIds.join(", ")}.`,
        );

        const cycle = await runHeartbeatCycle({
          roleIds: cyclePlan.targetIds,
          isCancelled: () => !daemonController.isRunning(),
          runRoleHeartbeat: async (roleId) => {
            if (roleId === HERMIT_ROLE_ID) {
              console.log(`[${formatDaemonTimestamp()}] Running Hermit strategic review.`);
              await runStrategicReviewForHermit({
                root,
                ...(options.continue !== undefined ? { continueRecent: options.continue } : {}),
                ...(options.gitCheckpoints !== undefined ? { gitCheckpointsEnabled: options.gitCheckpoints } : {}),
                isCancelled: () => !daemonController.isRunning(),
                registerActiveAbort: (abortActiveSession) => daemonController.setActiveAbort(abortActiveSession),
              });
              console.log(`[${formatDaemonTimestamp()}] Finished Hermit strategic review.`);
              return;
            }

            const role = roles.find((entry) => entry.id === roleId);
            if (!role) {
              throw new Error(`Failed to load role ${roleId} for daemon cycle.`);
            }
            console.log(
              strategicReviewSweepDue
                ? `[${formatDaemonTimestamp()}] Running strategic review for ${roleId}.`
                : `[${formatDaemonTimestamp()}] Running heartbeat for ${roleId}.`,
            );
            await runHeartbeatForRole({
              root,
              role,
              promptContext: buildRolePromptContext(root, role),
              ...(options.continue !== undefined ? { continueRecent: options.continue } : {}),
              automaticStrategicReview: false,
              ...(cyclePlan.mode === "strategic-review" ? { strategicReview: true } : {}),
              ...(options.gitCheckpoints !== undefined ? { gitCheckpointsEnabled: options.gitCheckpoints } : {}),
              isCancelled: () => !daemonController.isRunning(),
              registerActiveAbort: (abortActiveSession) => daemonController.setActiveAbort(abortActiveSession),
            });
            console.log(
              strategicReviewSweepDue
                ? `[${formatDaemonTimestamp()}] Finished strategic review for ${roleId}.`
                : `[${formatDaemonTimestamp()}] Finished heartbeat for ${roleId}.`,
            );
          },
        });

        for (const failure of cycle.failures) {
          const targetLabel =
            failure.roleId === HERMIT_ROLE_ID
              ? "Hermit strategic review"
              : `${cycleLabel} for ${failure.roleId}`;
          if (isAbortError(failure.error) && !daemonController.isRunning()) {
            console.log(`[${formatDaemonTimestamp()}] ${targetLabel} aborted.`);
            continue;
          }
          console.error(
            `[${formatDaemonTimestamp()}] ${targetLabel} failed: ${getErrorMessage(failure.error)}`,
          );
        }

        if (!daemonController.isRunning()) {
          break;
        }

        const waitMs = resolveHeartbeatDaemonDelay(intervalMs, cycle.startedAtMs, cycle.completedAtMs);
        const completedCount = cycle.successfulRoleIds.length;
        const failedCount = cycle.failures.length;
        console.log(
          `[${formatDaemonTimestamp()}] ${cyclePlan.mode === "strategic-review" ? "Strategic-review sweep" : "Heartbeat cycle"} finished in ${formatHeartbeatDaemonDuration(cycle.completedAtMs - cycle.startedAtMs)}. Completed ${completedCount} target(s), failed ${failedCount}. Next cycle in ${formatHeartbeatDaemonDuration(waitMs)}.`,
        );

        await sleepUntilNextHeartbeat(waitMs, () => daemonController.isRunning());
      }
    } finally {
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      console.log(`[${formatDaemonTimestamp()}] Heartbeat daemon stopped.`);
    }
  });

const ingestCommand = program.command("ingest").description("Ingest evidence into the workspace.");

ingestCommand
  .command("transcript <file>")
  .description("Store a transcript and update the selected role entity.")
  .option("--role <id>", "Role ID to run.")
  .option("--entity <id>", "Entity ID to update.")
  .option("--image <path>", "Attach image(s) to the transcript run.", (value, previous: string[] = []) => [...previous, value], [])
  .action(
    async (
      file: string,
      options: {
        role?: string;
        entity?: string;
        image?: string[];
      },
    ) => {
      const { root, roleId } = await resolveRoleContext(options.role);

      await runTranscriptIngest({
        root,
        roleId,
        transcriptPath: path.resolve(file),
        imagePaths: collectImagePaths(options.image),
        ...(options.entity !== undefined ? { entityId: options.entity } : {}),
      });
    },
  );

const telemetryCommand = program.command("telemetry").description("Inspect local Hermit telemetry.");

telemetryCommand
  .command("report")
  .description("Aggregate local telemetry into a report for a recent time window.")
  .option("--window <duration>", "Time window such as 24h, 7d, or 2w.", "7d")
  .option("--role <id>", "Optional role ID filter.")
  .action(async (options: { window: string; role?: string }) => {
    const root = resolveWorkspaceRoot();
    const report = await generateTelemetryReport(root, {
      window: options.window,
      ...(options.role !== undefined ? { roleId: options.role } : {}),
    });
    const paths = await writeTelemetryReport(root, report);
    console.log(renderTelemetryReportSummary(report));
    console.log(`- Markdown report: ${path.relative(root, paths.markdownPath)}`);
    console.log(`- JSON report: ${path.relative(root, paths.jsonPath)}`);
  });

program
  .command("doctor")
  .description("Validate shared workspace structure plus the selected role contract.")
  .option("--role <id>", "Role ID to validate.")
  .option("--context", "Print the rendered system-prompt source breakdown for the selected role.")
  .action(async (options: { role?: string; context?: boolean }) => {
    const { root, roleId } = await resolveRoleContext(options.role);
    const healthy = await runDoctor(root, roleId);
    if (options.context) {
      await printDoctorContext(root, roleId);
    }
    process.exitCode = healthy ? 0 : 1;
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
