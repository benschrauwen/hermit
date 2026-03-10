#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import matter from "gray-matter";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { runDoctor } from "./doctor.js";
import { createCheckpoint, getRepoState, shouldCheckpoint } from "./git.js";
import { runTranscriptIngest } from "./ingest.js";
import { inferRootAndRoleFromCwd, loadRole, resolveChatSession, resolveRole } from "./roles.js";
import {
  createBootstrapSession,
  createRoleSession,
  DEFAULT_HEARTBEAT_PROMPT,
  STRATEGIC_REVIEW_HEARTBEAT_PROMPT,
  resolveInitialChatPrompt,
  runChatLoop,
  runOneShotPrompt,
} from "./session.js";
import { generateTelemetryReport, renderTelemetryReportSummary, writeTelemetryReport } from "./telemetry.js";
import type { TelemetryRecorder } from "./telemetry-recorder.js";
import type { RoleDefinition } from "./types.js";

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
    promptContext: {
      workspaceRoot: root,
      roleId,
      roleRoot: path.relative(root, role.roleDir) || ".",
    },
  };
}

const STRATEGIC_REVIEW_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function isStrategicReviewDue(role: RoleDefinition): Promise<boolean> {
  const recordPath = path.join(role.roleDir, "agent", "record.md");
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

async function withGitCheckpoint(options: {
  root: string;
  commandName: SessionCommandName;
  roleId?: string;
  run: (context: CommandGitContext) => Promise<TelemetryRecorder | undefined>;
}): Promise<void> {
  const sessionId = randomUUID();
  const checkpointMeta = {
    commandName: options.commandName,
    sessionId,
    ...(options.roleId !== undefined ? { roleId: options.roleId } : {}),
  };

  const beforeState = await getRepoState(options.root);
  const checkpointBefore = shouldCheckpoint(beforeState)
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

  let telemetry: TelemetryRecorder | undefined;
  try {
    telemetry = await options.run(context);
  } finally {
    const afterState = await getRepoState(options.root);
    const checkpointAfter = shouldCheckpoint(afterState)
      ? await createCheckpoint(options.root, { ...checkpointMeta, phase: "after" })
      : undefined;
    const endHead = checkpointAfter ?? afterState;

    telemetry?.setGitSessionEndContext({
      ...(endHead?.headSha !== undefined ? { gitHeadAtEnd: endHead.headSha } : {}),
      ...(checkpointAfter?.checkpointSha !== undefined ? { checkpointAfterSha: checkpointAfter.checkpointSha } : {}),
    });
    await telemetry?.close();
  }
}

const program = new Command();

program.name("hermit").description("Local file-first runtime for autonomous applications").version("0.1.0");

program
  .command("chat")
  .description("Open an interactive chat session.")
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
    }) => {
      const inferred = inferRootAndRoleFromCwd(process.cwd());
      const resolved = await resolveChatSession(inferred.root, {
        ...(options.role !== undefined ? { explicitRoleId: options.role } : {}),
        ...(inferred.roleId !== undefined ? { inferredRoleId: inferred.roleId } : {}),
      });
      await withGitCheckpoint({
        root: resolved.root,
        commandName: "chat",
        ...(resolved.kind === "role" ? { roleId: resolved.role.id } : {}),
        run: async (gitContext) => {
          const sessionContext =
            resolved.kind === "bootstrap"
              ? await createBootstrapSession({
                  root: resolved.root,
                  persist: true,
                  continueRecent: Boolean(options.continue),
                  telemetryCommandName: "chat",
                  telemetryContext: gitContext.telemetryContext,
                  promptContext: {
                    workspaceRoot: resolved.root,
                    ...gitContext.promptContext,
                  },
                })
              : await createRoleSession({
                  root: resolved.root,
                  role: resolved.role,
                  persist: true,
                  continueRecent: Boolean(options.continue),
                  telemetryCommandName: "chat",
                  telemetryContext: gitContext.telemetryContext,
                  promptContext: {
                    workspaceRoot: resolved.root,
                    roleId: resolved.role.id,
                    roleRoot: path.relative(resolved.root, resolved.role.roleDir) || ".",
                    ...gitContext.promptContext,
                  },
                });

          const initialPrompt = resolveInitialChatPrompt({
            workspaceState: sessionContext.workspaceState,
            ...(options.prompt !== undefined ? { initialPrompt: options.prompt } : {}),
            ...(options.continue !== undefined ? { continueRecent: options.continue } : {}),
          });

          await runChatLoop(sessionContext.session, {
            ...(initialPrompt !== undefined ? { initialPrompt } : {}),
            initialImages: collectImagePaths(options.image),
            telemetry: sessionContext.telemetry,
          });

          return sessionContext.telemetry;
        },
      });
    },
  );

program
  .command("ask")
  .description("Run a one-shot prompt in the selected role session.")
  .option("--role <id>", "Role ID to run.")
  .option("--image <path>", "Attach image(s) to the prompt.", (value, previous: string[] = []) => [...previous, value], [])
  .argument("<prompt...>", "Prompt text to send to the agent.")
  .action(
    async (
      promptParts: string[],
      options: {
        role?: string;
        image?: string[];
      },
    ) => {
      const { root, role, promptContext } = await resolveSessionContext(options);
      await withGitCheckpoint({
        root,
        commandName: "ask",
        roleId: role.id,
        run: async (gitContext) => {
          const { session, telemetry } = await createRoleSession({
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

          await runOneShotPrompt(session, promptParts.join(" "), collectImagePaths(options.image), telemetry);
          return telemetry;
        },
      });
    },
  );

program
  .command("heartbeat")
  .description("Run one autonomous background upkeep turn for the selected role.")
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
    }) => {
      const { root, promptContext, role } = await resolveSessionContext(options);
      await withGitCheckpoint({
        root,
        commandName: "heartbeat",
        roleId: role.id,
        run: async (gitContext) => {
          const { session, telemetry } = await createRoleSession({
            root,
            role,
            persist: true,
            continueRecent: Boolean(options.continue),
            sessionHistoryType: "heartbeat",
            telemetryCommandName: "heartbeat",
            telemetryContext: gitContext.telemetryContext,
            promptContext: {
              ...promptContext,
              ...gitContext.promptContext,
            },
          });

          let heartbeatPrompt: string;
          if (options.prompt) {
            heartbeatPrompt = options.prompt;
          } else if (options.strategicReview || await isStrategicReviewDue(role)) {
            heartbeatPrompt = STRATEGIC_REVIEW_HEARTBEAT_PROMPT;
          } else {
            heartbeatPrompt = DEFAULT_HEARTBEAT_PROMPT;
          }
          await runOneShotPrompt(session, heartbeatPrompt, [], telemetry);
          return telemetry;
        },
      });
    },
  );

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
  .action(async (options: { role?: string }) => {
    const { root, roleId } = await resolveRoleContext(options.role);
    const healthy = await runDoctor(root, roleId);
    process.exitCode = healthy ? 0 : 1;
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
