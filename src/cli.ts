#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import path from "node:path";
import process from "node:process";

import { runDoctor } from "./doctor.js";
import { runTranscriptIngest } from "./ingest.js";
import { inferRootAndRoleFromCwd, loadRole, resolveRole } from "./roles.js";
import {
  createRoleSession,
  DEFAULT_HEARTBEAT_PROMPT,
  resolveInitialChatPrompt,
  runChatLoop,
  runOneShotPrompt,
} from "./session.js";
import { generateTelemetryReport, renderTelemetryReportSummary, writeTelemetryReport } from "./telemetry.js";
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

const program = new Command();

program.name("hermit").description("Local file-first runtime for autonomous applications").version("0.1.0");

program
  .command("chat")
  .description("Open an interactive role chat session.")
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
      const { root, role, promptContext } = await resolveSessionContext(options);
      const { session, workspaceState, telemetry } = await createRoleSession({
        root,
        role,
        persist: true,
        continueRecent: Boolean(options.continue),
        telemetryCommandName: "chat",
        promptContext,
      });

      const initialPrompt = resolveInitialChatPrompt({
        workspaceState,
        ...(options.prompt !== undefined ? { initialPrompt: options.prompt } : {}),
        ...(options.continue !== undefined ? { continueRecent: options.continue } : {}),
      });

      await runChatLoop(session, {
        ...(initialPrompt !== undefined ? { initialPrompt } : {}),
        initialImages: collectImagePaths(options.image),
        telemetry,
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
      const { session, telemetry } = await createRoleSession({
        root,
        role,
        persist: false,
        telemetryCommandName: "ask",
        promptContext,
      });

      await runOneShotPrompt(session, promptParts.join(" "), collectImagePaths(options.image), telemetry);
    },
  );

program
  .command("heartbeat")
  .description("Run one autonomous background upkeep turn for the selected role.")
  .option("--role <id>", "Role ID to run.")
  .option("--continue", "Continue the most recent persisted heartbeat session for this role.")
  .option("--prompt <text>", "Optional heartbeat prompt override.")
  .action(
    async (options: {
      role?: string;
      continue?: boolean;
      prompt?: string;
    }) => {
      const { root, promptContext, role } = await resolveSessionContext(options);
      const { session, telemetry } = await createRoleSession({
        root,
        role,
        persist: true,
        continueRecent: Boolean(options.continue),
        sessionHistoryType: "heartbeat",
        telemetryCommandName: "heartbeat",
        promptContext,
      });

      await runOneShotPrompt(session, options.prompt ?? DEFAULT_HEARTBEAT_PROMPT, [], telemetry);
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
