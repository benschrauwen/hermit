#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import path from "node:path";
import process from "node:process";

import { runDoctor } from "./doctor.js";
import { runTranscriptIngest } from "./ingest.js";
import { createSalesLeaderSession, runChatLoop, runOneShotPrompt } from "./session.js";
import { findEntityById } from "./workspace.js";

function resolveRoot(): string {
  return process.cwd();
}

async function resolvePromptContext(root: string, entityId: string | undefined): Promise<{ entityId?: string; entityPath?: string }> {
  if (!entityId) {
    return {};
  }

  const entity = await findEntityById(root, entityId);
  if (!entity) {
    throw new Error(`Unknown entity ID: ${entityId}`);
  }

  return {
    entityId: entity.id,
    entityPath: entity.path,
  };
}

function collectImagePaths(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => path.resolve(value));
}

const program = new Command();

program.name("sales-agent").description("Local file-first sales leader agent").version("0.1.0");

program
  .command("chat")
  .description("Open an interactive sales leader chat session.")
  .option("--entity <id>", "Entity ID to anchor the session.")
  .option("--continue", "Continue the most recent persisted session for this workspace.")
  .option("--image <path>", "Attach image(s) to the initial prompt.", (value, previous: string[] = []) => [...previous, value], [])
  .option("--prompt <text>", "Optional initial prompt before the interactive loop starts.")
  .action(
    async (options: {
      entity?: string;
      continue?: boolean;
      image?: string[];
      prompt?: string;
    }) => {
      const root = resolveRoot();
      const promptContext = await resolvePromptContext(root, options.entity);
      const { session, workspaceState } = await createSalesLeaderSession({
        root,
        kind: "default",
        persist: true,
        continueRecent: Boolean(options.continue),
        promptContext: {
          workspaceRoot: root,
          ...promptContext,
        },
      });

      const chatLoopOptions: { initialPrompt?: string; initialImages?: string[] } = {
        initialImages: collectImagePaths(options.image),
      };
      if (options.prompt !== undefined) {
        chatLoopOptions.initialPrompt = options.prompt;
      } else if (!workspaceState.initialized) {
        chatLoopOptions.initialPrompt =
          "The workspace is not initialized yet. Start onboarding now. Ask the single highest-value question first and use the deterministic creation tools as information becomes clear.";
      }

      await runChatLoop(session, chatLoopOptions);
    },
  );

program
  .command("ask")
  .description("Run a one-shot prompt in the normal sales leader session.")
  .option("--entity <id>", "Entity ID to anchor the prompt.")
  .option("--image <path>", "Attach image(s) to the prompt.", (value, previous: string[] = []) => [...previous, value], [])
  .argument("<prompt...>", "Prompt text to send to the agent.")
  .action(
    async (
      promptParts: string[],
      options: {
        entity?: string;
        image?: string[];
      },
    ) => {
      const root = resolveRoot();
      const promptContext = await resolvePromptContext(root, options.entity);
      const { session } = await createSalesLeaderSession({
        root,
        kind: "default",
        persist: false,
        promptContext: {
          workspaceRoot: root,
          ...promptContext,
        },
      });

      await runOneShotPrompt(session, promptParts.join(" "), collectImagePaths(options.image));
    },
  );

const ingestCommand = program.command("ingest").description("Ingest evidence into the workspace.");

ingestCommand
  .command("transcript <file>")
  .description("Store a call transcript and update the selected deal.")
  .option("--deal <id>", "Deal ID to update.")
  .option("--image <path>", "Attach image(s) to the transcript run.", (value, previous: string[] = []) => [...previous, value], [])
  .action(
    async (
      file: string,
      options: {
        deal?: string;
        image?: string[];
      },
    ) => {
      const ingestOptions: {
        root: string;
        transcriptPath: string;
        imagePaths: string[];
        dealId?: string;
      } = {
        root: resolveRoot(),
        transcriptPath: path.resolve(file),
        imagePaths: collectImagePaths(options.image),
      };
      if (options.deal !== undefined) {
        ingestOptions.dealId = options.deal;
      }

      await runTranscriptIngest(ingestOptions);
    },
  );

program
  .command("doctor")
  .description("Validate workspace structure, prompt links, and canonical record basics.")
  .action(async () => {
    const healthy = await runDoctor(resolveRoot());
    process.exitCode = healthy ? 0 : 1;
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
