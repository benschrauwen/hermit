import process from "node:process";

import type { AgentSession } from "@mariozechner/pi-coding-agent";

import { HERMIT_ROLE_ID } from "./constants.js";
import { loadImageAttachments } from "./image-attachments.js";
import { formatUserPromptEcho } from "./session-formatting.js";
import { attachConsoleStreaming, attachSessionStreaming, type SessionOutputSink } from "./session-terminal.js";
import type { TelemetryRecorder } from "./telemetry-recorder.js";

const ANSI_DIM = "\x1b[90m";
const ANSI_RESET = "\x1b[0m";

function formatModelNotice(modelLabel: string): string {
  return `${ANSI_DIM}Using model ${modelLabel}.${ANSI_RESET}\n`;
}

export interface OneShotPromptRenderOptions {
  sink?: SessionOutputSink;
  echoPrompt?: boolean;
  showModelNotice?: boolean;
}

export async function runOneShotPrompt(
  session: AgentSession,
  prompt: string,
  imagePaths: string[] = [],
  telemetry?: TelemetryRecorder,
  activeRoleLabel = HERMIT_ROLE_ID,
  modelLabel?: string,
  renderOptions: OneShotPromptRenderOptions = {},
): Promise<void> {
  const streaming = renderOptions.sink
    ? attachSessionStreaming(session, renderOptions.sink, telemetry)
    : attachConsoleStreaming(session, telemetry);

  try {
    if (modelLabel && renderOptions.showModelNotice !== false) {
      const modelNotice = formatModelNotice(modelLabel);
      if (renderOptions.sink) {
        renderOptions.sink.appendToolStatus(`Using model ${modelLabel}.`);
      } else {
        process.stdout.write(modelNotice);
      }
    }
    if (renderOptions.echoPrompt !== false) {
      const promptEcho = formatUserPromptEcho(prompt, activeRoleLabel);
      if (renderOptions.sink) {
        renderOptions.sink.appendText(promptEcho);
      } else {
        process.stdout.write(promptEcho);
      }
    }
    await session.prompt(prompt, {
      images: await loadImageAttachments(imagePaths),
    });
  } finally {
    streaming.stop();
  }
}
