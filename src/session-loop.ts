import process from "node:process";
import readline from "node:readline/promises";

import type { AgentSession } from "@mariozechner/pi-coding-agent";

import { HERMIT_ROLE_ID } from "./constants.js";
import { loadImageAttachments } from "./session-attachments.js";
import { attachConsoleStreaming, formatEntryDesignator, formatUserPromptEcho } from "./session-terminal.js";
import type { InteractiveChatSession, RoleSwitchRequest } from "./session-types.js";
import type { TelemetryRecorder } from "./telemetry-recorder.js";

const ANSI_DIM = "\x1b[90m";
const ANSI_RESET = "\x1b[0m";

export async function runOneShotPrompt(
  session: AgentSession,
  prompt: string,
  imagePaths: string[] = [],
  telemetry?: TelemetryRecorder,
  activeRoleLabel = HERMIT_ROLE_ID,
): Promise<void> {
  const stopStreaming = attachConsoleStreaming(session, telemetry);

  try {
    process.stdout.write(formatUserPromptEcho(prompt, activeRoleLabel));
    await session.prompt(prompt, {
      images: await loadImageAttachments(imagePaths),
    });
  } finally {
    stopStreaming();
  }
}

export async function runChatLoop(
  options: {
    initialSession: InteractiveChatSession;
    initialPrompt?: string;
    initialImages?: string[];
    onRoleSwitch?: (request: RoleSwitchRequest, previousRoleLabel: string) => Promise<InteractiveChatSession>;
  },
): Promise<void> {
  let activeSession = options.initialSession;
  let stopStreaming = attachConsoleStreaming(activeSession.session, activeSession.telemetry);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  async function switchRolesIfRequested(): Promise<void> {
    let switchCount = 0;
    while (true) {
      const request = activeSession.consumeRoleSwitchRequest();
      if (!request) {
        return;
      }
      if (!options.onRoleSwitch) {
        return;
      }
      switchCount += 1;
      if (switchCount > 5) {
        throw new Error("Too many role switches were requested in a single turn.");
      }

      const previousRoleLabel = activeSession.activeRoleLabel;
      stopStreaming();
      activeSession = await options.onRoleSwitch(request, previousRoleLabel);
      stopStreaming = attachConsoleStreaming(activeSession.session, activeSession.telemetry);
      process.stdout.write(`${ANSI_DIM}Switched active role to ${activeSession.activeRoleLabel}.${ANSI_RESET}\n`);
      await activeSession.session.prompt(
        `The active chat role was switched from ${previousRoleLabel} to ${activeSession.activeRoleLabel}. Briefly acknowledge the switch, adopt the new role immediately, and continue the conversation without asking the user to repeat prior context.`,
      );
    }
  }

  async function promptActiveSession(prompt: string, imagePaths: string[] = []): Promise<void> {
    await activeSession.session.prompt(prompt, {
      images: await loadImageAttachments(imagePaths),
    });
    await switchRolesIfRequested();
  }

  try {
    if (options.initialPrompt) {
      await promptActiveSession(options.initialPrompt, options.initialImages ?? []);
    }

    while (true) {
      const input = (await rl.question(`\n${formatEntryDesignator(activeSession.activeRoleLabel)} `)).trim();
      process.stdout.write(ANSI_RESET);
      if (!input) {
        continue;
      }

      if (input === "/exit" || input === "/quit") {
        break;
      }

      await promptActiveSession(input);
    }
  } finally {
    stopStreaming();
    rl.close();
  }
}
