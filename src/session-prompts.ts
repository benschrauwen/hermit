import type { WorkspaceInitializationState } from "./types.js";

export const ONBOARDING_CHAT_OPENING_PROMPT =
  "The workspace is not initialized yet. Begin first-role bootstrap now. Follow the shared bootstrap guidance, keep the setup focused but complete, and ask the single highest-value question first.";

export const DEFAULT_CHAT_OPENING_PROMPT =
  "This is the first turn of a new interactive session. First execute the required startup reading from the system prompt and role files before responding. If there is one genuinely important due item or background change the user should know about now, mention it in one sentence. Treat this live session like a focused 1:1 for alignment, prioritization, and approvals, not as the main place for prolonged execution. If the user brings a complex request that would take many steps or substantial research, default to scoping it, capturing the follow-up work for heartbeat, and asking whether any specific step should happen immediately. Then give a brief, natural opening in your normal voice and ask what they want to work on. Do not mention internal files, tools, or reasoning. Do not suggest exploratory inspection unless the user asks for orientation or the workspace is clearly not ready.";

export const DEFAULT_HEARTBEAT_PROMPT =
  "Run one autonomous heartbeat turn focused on the role's canonical GTD backlog. Review `agent/inbox.md` and `agent/record.md`. If the shared `inbox/` directory exists and contains newly dropped files, treat routing those files as eligible work: move durable material into the correct role or entity directories, preserve source refs when the files change canonical understanding, and delete one-off temporary drop files once their contents are safely captured elsewhere. Then choose at most one clear, high-confidence, unblocked next step you can complete without user input. Do not infer or resurrect tasks from vague prior chat context. Do not start new initiatives, broad reorganizations, or speculative research. Prefer backlog clarification, next-action cleanup, waiting-for follow-up, or a small factual update to canonical records. If blocked, record the blocker and the exact missing input in the appropriate file instead of asking the user. If no clearly worthwhile step exists, do nothing and return an empty output.";

export const HERMIT_STRATEGIC_REVIEW_PROMPT =
  "Run a daily strategic review for the Hermit framework itself. Read `.hermit/agent/record.md` and `.hermit/agent/inbox.md` fully, then follow both `prompts/35-strategic-reflection.md` and `prompts/90-self-improvement.md`. Run the review as an explicit `evidence -> hypothesis -> test -> re-evaluate hypothesis` loop. Start with any open or recent items in `## Strategic Experiments` in `.hermit/agent/record.md`, and use git history when helpful to verify what actually changed since the previous review. Cover all review areas from strategic reflection, but focus the work on Hermit runtime code, prompts, docs, templates, validation, tests, explorer behavior, and operating guidance rather than user domain work. For telemetry, read the most recent reports under `.hermit/telemetry/reports/`. Use `doctor` when workspace-health evidence is relevant. Write dated notes to `## Strategic Observations` in `.hermit/agent/record.md`, update `## Strategic Experiments` with what was tried and the next test, promote actionable follow-ups into `.hermit/agent/inbox.md` or `.hermit/agent/record.md`, and update `last_strategic_review` in the record frontmatter to today. Small, clearly correct framework fixes may be applied directly, but avoid speculative redesigns. Give a brief summary of findings as output.";

export const STRATEGIC_REVIEW_HEARTBEAT_PROMPT =
  "Run a daily strategic review instead of normal task advancement. Read `agent/record.md` and `agent/inbox.md` fully, then follow the strategic review guidance in `prompts/35-strategic-reflection.md`. Run the review as an explicit `evidence -> hypothesis -> test -> re-evaluate hypothesis` loop. Start by reviewing any open or recent items in `## Strategic Experiments` in `agent/record.md`, and use git history when helpful to see exactly which files the agent changed since the previous review and whether yesterday's test affected the expected areas. Cover all review areas: goal clarity, effort alignment, organizational fitness, process and prompt quality, telemetry health, and research for missing skills or better approaches. For telemetry, read the most recent reports under `.hermit/telemetry/reports/`. For skill gaps or better approaches, search online only when local evidence suggests a real gap and workspace files are not enough. Write observations to the `## Strategic Observations` section of `agent/record.md` with today's date. Update `## Strategic Experiments` with what was tried, whether it helped, and the next hypothesis or test. Promote actionable findings to inbox items or next actions. If you identify prompt, entity definition, or role manifest changes, capture them as follow-up items marked for user review — do not apply them directly. Small, clearly correct code fixes may be applied directly but must be noted for surfacing at the next interactive session. Update `last_strategic_review` in the record frontmatter to today's date. Give a brief summary of findings as output.";

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
