import process from "node:process";
import readline from "node:readline/promises";

import type { AgentSession } from "@mariozechner/pi-coding-agent";

import { HERMIT_ROLE_ID } from "./constants.js";
import { ChatTui, attachChatTuiStreaming } from "./session-chat-ui.js";
import { loadImageAttachments } from "./session-attachments.js";
import { attachConsoleStreaming, formatEntryDesignator, formatUserPromptEcho } from "./session-terminal.js";
import type { InteractiveChatSession, RoleSwitchRequest } from "./session-types.js";
import type { TelemetryRecorder } from "./telemetry-recorder.js";

const ANSI_DIM = "\x1b[90m";
const ANSI_RESET = "\x1b[0m";

function formatModelNotice(modelLabel: string): string {
  return `${ANSI_DIM}Using model ${modelLabel}.${ANSI_RESET}\n`;
}

export async function runOneShotPrompt(
  session: AgentSession,
  prompt: string,
  imagePaths: string[] = [],
  telemetry?: TelemetryRecorder,
  activeRoleLabel = HERMIT_ROLE_ID,
  modelLabel?: string,
): Promise<void> {
  const stopStreaming = attachConsoleStreaming(session, telemetry);

  try {
    if (modelLabel) {
      process.stdout.write(formatModelNotice(modelLabel));
    }
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
  if (process.stdin.isTTY && process.stdout.isTTY) {
    await runTuiChatLoop(options);
    return;
  }

  await runReadlineChatLoop(options);
}

function normalizeChatInput(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isExitCommand(input: string): boolean {
  const command = input.trim();
  return command === "/exit" || command === "/quit";
}

async function runReadlineChatLoop(
  options: {
    initialSession: InteractiveChatSession;
    initialPrompt?: string;
    initialImages?: string[];
    onRoleSwitch?: (request: RoleSwitchRequest, previousRoleLabel: string) => Promise<InteractiveChatSession>;
  },
): Promise<void> {
  let activeSession = options.initialSession;
  let stopStreaming = attachConsoleStreaming(activeSession.session, activeSession.telemetry);
  process.stdout.write(formatModelNotice(activeSession.modelLabel));
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

      if (request.roleId === activeSession.activeRoleLabel) {
        process.stdout.write(`${ANSI_DIM}Ignored redundant role switch to ${activeSession.activeRoleLabel}.${ANSI_RESET}\n`);
        return;
      }

      const previousRoleLabel = activeSession.activeRoleLabel;
      stopStreaming();
      activeSession = await options.onRoleSwitch(request, previousRoleLabel);
      stopStreaming = attachConsoleStreaming(activeSession.session, activeSession.telemetry);
      process.stdout.write(
        `${ANSI_DIM}Switched active role to ${activeSession.activeRoleLabel} using ${activeSession.modelLabel}.${ANSI_RESET}\n`,
      );
      return;
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
      const input = normalizeChatInput(await rl.question(`\n${formatEntryDesignator(activeSession.activeRoleLabel)} `));
      process.stdout.write(ANSI_RESET);
      if (!input.trim()) {
        continue;
      }

      if (isExitCommand(input)) {
        break;
      }

      await promptActiveSession(input);
    }
  } finally {
    stopStreaming();
    rl.close();
  }
}

async function runTuiChatLoop(
  options: {
    initialSession: InteractiveChatSession;
    initialPrompt?: string;
    initialImages?: string[];
    onRoleSwitch?: (request: RoleSwitchRequest, previousRoleLabel: string) => Promise<InteractiveChatSession>;
  },
): Promise<void> {
  let activeSession = options.initialSession;
  const chatUi = new ChatTui(activeSession.activeRoleLabel);
  chatUi.appendSystemNotice(`Using model ${activeSession.modelLabel}.`);
  let stopStreaming = attachChatTuiStreaming(activeSession.session, chatUi, activeSession.telemetry);
  chatUi.setInterruptHandler(async () => {
    await activeSession.session.abort();
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

      if (request.roleId === activeSession.activeRoleLabel) {
        chatUi.appendSystemNotice(`Ignored redundant role switch to ${activeSession.activeRoleLabel}.`);
        return;
      }

      const previousRoleLabel = activeSession.activeRoleLabel;
      stopStreaming();
      activeSession = await options.onRoleSwitch(request, previousRoleLabel);
      chatUi.setActiveRoleLabel(activeSession.activeRoleLabel);
      chatUi.setInterruptHandler(async () => {
        await activeSession.session.abort();
      });
      stopStreaming = attachChatTuiStreaming(activeSession.session, chatUi, activeSession.telemetry);
      chatUi.appendSystemNotice(`Switched active role to ${activeSession.activeRoleLabel} using ${activeSession.modelLabel}.`);
      return;
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
      if (chatUi.consumeExitRequest()) {
        return;
      }
    }

    while (true) {
      const input = normalizeChatInput(await chatUi.readInput());
      if (!input.trim()) {
        continue;
      }

      if (isExitCommand(input)) {
        break;
      }

      chatUi.appendUserPrompt(input);
      await promptActiveSession(input);
      if (chatUi.consumeExitRequest()) {
        break;
      }
    }
  } finally {
    stopStreaming();
    await chatUi.close();
  }
}
