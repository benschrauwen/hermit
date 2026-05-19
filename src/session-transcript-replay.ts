import type { AgentSession, SessionManager } from "@mariozechner/pi-coding-agent";

import { extractSessionMessages } from "./session-browser.js";

type SessionHistorySource = Pick<AgentSession, "sessionManager"> | SessionManager;

function getSessionManager(source: SessionHistorySource): SessionManager {
  return "sessionManager" in source ? source.sessionManager : source;
}
import {
  formatActivityStatus,
  formatUserPromptEcho,
  normalizeAssistantText,
  renderTerminalMarkdown,
  truncateInlineText,
} from "./session-formatting.js";
import type { SessionOutputSink } from "./session-terminal.js";

export function sessionHasTranscriptHistory(source: SessionHistorySource): boolean {
  return getSessionManager(source).getEntries().some((entry) => entry.type === "message");
}

export function renderSessionHistoryToSink(
  source: SessionHistorySource,
  sink: SessionOutputSink,
  activeRoleLabel: string,
): number {
  const messages = extractSessionMessages(getSessionManager(source).getEntries());
  if (messages.length === 0) {
    return 0;
  }

  for (const message of messages) {
    if (message.role === "user") {
      if (message.text) {
        sink.appendText(formatUserPromptEcho(message.text, activeRoleLabel));
      }
      continue;
    }

    if (message.role === "assistant") {
      for (const toolCall of message.toolCalls ?? []) {
        sink.appendToolStatus(formatActivityStatus(toolCall.name, toolCall.arguments));
      }
      if (message.text) {
        sink.appendText(`${renderTerminalMarkdown(normalizeAssistantText(message.text))}\n`);
      }
      continue;
    }

    if (message.role === "compaction" || message.role === "branch_summary") {
      const label = message.role === "compaction" ? "Compaction" : "Branch summary";
      sink.appendToolStatus(truncateInlineText(`${label}: ${message.text}`));
    }
  }

  return messages.length;
}
