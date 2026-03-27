import process from "node:process";

import type { AgentSession } from "@mariozechner/pi-coding-agent";

import { HERMIT_ROLE_ID } from "./constants.js";
import { loadImageAttachments } from "./image-attachments.js";
import { formatUserPromptEcho } from "./session-formatting.js";
import { attachConsoleStreaming } from "./session-terminal.js";
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
  const streaming = attachConsoleStreaming(session, telemetry);

  try {
    if (modelLabel) {
      process.stdout.write(formatModelNotice(modelLabel));
    }
    process.stdout.write(formatUserPromptEcho(prompt, activeRoleLabel));
    await session.prompt(prompt, {
      images: await loadImageAttachments(imagePaths),
    });
  } finally {
    streaming.stop();
  }
}
