import type { WorkspaceInitializationState } from "./types.js";

export const ONBOARDING_CHAT_OPENING_PROMPT =
  "The workspace is not initialized yet. Begin first-role bootstrap now. Follow the shared bootstrap guidance, keep the setup focused but complete, and ask the single highest-value question first.";

export const DEFAULT_CHAT_OPENING_PROMPT =
  "Start the conversation by speaking first. Give a brief, direct opening grounded in the workspace context when helpful, then ask the single most useful question or suggest the most useful next area to inspect. Keep it concise.";

export const DEFAULT_HEARTBEAT_PROMPT =
  "Run one autonomous heartbeat turn focused on the role's GTD backlog. Review `agent/inbox.md` and `agent/record.md`, then choose the highest-impact unblocked item you can advance without waiting on a user reply. Make one small, concrete step, not a big jump or broad reorganization. Prefer clarifying backlog, tightening next actions, moving a waiting-for item forward, updating canonical records, or doing targeted research that you can write back into the workspace. If blocked, record the blocker and the next required input in the appropriate file instead of asking the user. Write the resulting updates back to the canonical files before you finish. When finished with the task, give a brief summary of what you did as output for future reference. It is totally fine to do nothing if there is nothing to do, just return with an empty output.";

export const STRATEGIC_REVIEW_HEARTBEAT_PROMPT =
  "Run a daily strategic review instead of normal task advancement. Read `agent/record.md` and `agent/inbox.md` fully, then follow the strategic review guidance in `prompts/35-strategic-reflection.md`. Cover all review areas: goal clarity, effort alignment, organizational fitness, process and prompt quality, telemetry health, and research for missing skills or better approaches. For telemetry, read the most recent reports under `.hermit/telemetry/reports/`. For skill gaps or better approaches, search online when relevant. Write observations to the `## Strategic Observations` section of `agent/record.md` with today's date. Promote actionable findings to inbox items or next actions. If you identify prompt, entity definition, or role manifest changes, capture them as follow-up items marked for user review — do not apply them directly. Small, clearly correct code fixes may be applied directly but must be noted for surfacing at the next interactive session. Update `last_strategic_review` in the record frontmatter to today's date. Give a brief summary of findings as output.";

export function resolveInitialChatPrompt(options: {
  initialPrompt?: string;
  continueRecent?: boolean;
  workspaceState: WorkspaceInitializationState;
}): string | undefined {
  if (options.initialPrompt !== undefined) {
    return options.initialPrompt;
  }

  if (!options.workspaceState.initialized) {
    return ONBOARDING_CHAT_OPENING_PROMPT;
  }

  if (options.continueRecent) {
    return undefined;
  }

  return DEFAULT_CHAT_OPENING_PROMPT;
}
