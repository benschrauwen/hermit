#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import path from "node:path";
import process from "node:process";

import {
  collectImagePaths,
  DISABLE_GIT_CHECKPOINTS_OPTION_DESCRIPTION,
  resolveRoleContext,
  resolveSessionContext,
  resolveWorkspaceRoot,
  runInteractiveChatCommand,
  runManagedOneShotCommand,
} from "./cli-session.js";
import { DEFAULT_HEARTBEAT_DAEMON_INTERVAL } from "./heartbeat-daemon.js";
import { printDoctorContext, runDoctor } from "./doctor.js";
import { assertProviderAwareModelConfigured } from "./model-auth.js";
import { createRoleSession } from "./session-runtime.js";
import { generateTelemetryReport, renderTelemetryReportSummary, writeTelemetryReport } from "./telemetry-report.js";
import { resolveFrameworkRoot } from "./runtime-paths.js";
import { runWorkspaceStartLoop } from "./workspace-start.js";

const program = new Command();
const COMBINED_START_INITIAL_HEARTBEAT_DELAY = "1m";

program.name("hermit").description("Local file-first runtime for autonomous applications").version("0.1.0");

program
  .command("start")
  .description("Open the combined workspace screen with explorer, heartbeat daemon, and interactive chat.")
  .option("--no-git-checkpoints", DISABLE_GIT_CHECKPOINTS_OPTION_DESCRIPTION)
  .option("--role <id>", "Role ID to run.")
  .option("--continue", "Continue the most recent persisted chat and heartbeat sessions for this workspace.")
  .option(
    "--interval <duration>",
    'Delay between heartbeat cycles. Use a whole number followed by ms, s, m, or h (for example "30m" or "1h").',
    DEFAULT_HEARTBEAT_DAEMON_INTERVAL,
  )
  .option("--image <path>", "Attach image(s) to the initial prompt.", (value, previous: string[] = []) => [...previous, value], [])
  .option("--prompt <text>", "Optional initial prompt before the interactive loop starts.")
  .action(
    async (options: {
      role?: string;
      continue?: boolean;
      interval: string;
      image?: string[];
      prompt?: string;
      gitCheckpoints?: boolean;
    }) => {
      await runInteractiveChatCommand(options, async ({ resolved, initialSession, initialPrompt, initialImages, onRoleSwitch }) => {
        await runWorkspaceStartLoop({
          workspaceRoot: resolved.root,
          frameworkRoot: resolveFrameworkRoot(),
          heartbeatInterval: options.interval,
          initialHeartbeatDelay: COMBINED_START_INITIAL_HEARTBEAT_DELAY,
          ...(options.continue !== undefined ? { continueHeartbeatSessions: options.continue } : {}),
          ...(options.gitCheckpoints !== undefined ? { gitCheckpointsEnabled: options.gitCheckpoints } : {}),
          initialSession,
          ...(initialPrompt !== undefined ? { initialPrompt } : {}),
          initialImages,
          ...(initialPrompt !== undefined ? { showInitialPromptEcho: options.prompt !== undefined } : {}),
          onRoleSwitch,
        });
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
      await runManagedOneShotCommand({
        root,
        commandName: "ask",
        roleId: role.id,
        turnKind: "ask",
        ...(options.gitCheckpoints !== undefined ? { gitCheckpointsEnabled: options.gitCheckpoints } : {}),
        createSession: async (gitContext) => {
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

          return {
            session,
            telemetry,
            modelLabel,
            activeRoleLabel: role.id,
          };
        },
        resolvePrompt: async () => promptParts.join(" "),
        imagePaths: collectImagePaths(options.image),
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
    const root = await resolveWorkspaceRoot();
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
