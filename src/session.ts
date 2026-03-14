export type { InteractiveChatSession, RoleSwitchRequest, SessionHistoryType } from "./session-types.js";

export {
  DEFAULT_CHAT_OPENING_PROMPT,
  DEFAULT_HEARTBEAT_PROMPT,
  ONBOARDING_CHAT_OPENING_PROMPT,
  STRATEGIC_REVIEW_HEARTBEAT_PROMPT,
  resolveInitialChatPrompt,
} from "./session-prompts.js";

export {
  resolveBootstrapSessionDirectory,
  resolvePersistedSessionDirectory,
  resolveRoleSkillPaths,
  resolveSharedSkillPaths,
} from "./session-paths.js";

export { loadImageAttachments } from "./session-attachments.js";

export {
  attachConsoleStreaming,
  formatActivityStatus,
  formatEntryDesignator,
  formatUserPromptEcho,
  renderTerminalMarkdown,
  type StreamingHandle,
} from "./session-terminal.js";

export { runChatLoop, runOneShotPrompt } from "./session-loop.js";

export { createHermitSession, createRoleSession } from "./session-runtime.js";
