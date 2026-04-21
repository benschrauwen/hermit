import path from "node:path";

import type { RoleLoadIssue, WorkspaceInitializationState } from "./types.js";

export const ONBOARDING_CHAT_OPENING_PROMPT =
  "The workspace is not initialized yet. Begin first-role bootstrap now. Follow the shared bootstrap guidance, keep the setup focused but complete, and ask the single highest-value question first.";

export const DEFAULT_CHAT_OPENING_PROMPT =
  "This is the first turn of a new interactive session. First execute the required startup reading from the system prompt and role files before responding. If there is one genuinely important due item or background change the user should know about now, mention it in one sentence. Treat this live session like a focused 1:1 for alignment, prioritization, and approvals, not as the main place for prolonged execution. If the user brings a complex request that would take many steps or substantial research, default to scoping it, capturing the follow-up work for heartbeat, and asking whether any specific step should happen immediately. Then give a brief, natural opening in your normal voice and ask what they want to work on. Do not mention internal files, tools, or reasoning. Do not suggest exploratory inspection unless the user asks for orientation or the workspace is clearly not ready.";

export const STARTUP_ISSUES_CHAT_OPENING_PROMPT =
  "The workspace started in degraded mode because at least one role failed to load. First explain the issue briefly in plain language, mention that Hermit stayed available so the workspace can be repaired from inside this session, and ask whether the user wants you to fix it now. Do not assume the broken role is usable until repaired.";

export const DEFAULT_HEARTBEAT_PROMPT =
  "Run one autonomous heartbeat turn focused on the role's canonical GTD backlog. Review the role's inbox and record files under the workspace root. If the shared workspace inbox directory exists and contains newly dropped files, treat routing those files as eligible work: move durable material into the correct role or entity directories, preserve source refs when the files change canonical understanding, and delete one-off temporary drop files once their contents are safely captured elsewhere. Then choose at most one clear, high-confidence, unblocked next step you can complete without user input. Do not infer or resurrect tasks from vague prior chat context. Do not start new initiatives, broad reorganizations, or speculative research. Prefer backlog clarification, next-action cleanup, waiting-for follow-up, or a small factual update to canonical records. If blocked, record the blocker and the exact missing input in the appropriate file instead of asking the user. If no clearly worthwhile step exists, do nothing and return an empty output.";

export const HERMIT_STRATEGIC_REVIEW_PROMPT =
  "Run a daily strategic review for the Hermit framework itself. Read the Hermit agent record and inbox under the workspace root fully, then follow the strategic reflection and self-improvement guidance already loaded in the system prompt. Run the review as an explicit `evidence -> hypothesis -> test -> re-evaluate hypothesis` loop. Start with any open or recent items in the Hermit `## Strategic Experiments` section, and use git history when helpful to verify what actually changed since the previous review. Cover all review areas from strategic reflection, but focus the work on Hermit runtime code, prompts, docs, templates, validation, tests, explorer behavior, and operating guidance rather than user domain work. For telemetry, read the most recent reports under the workspace root `.hermit/telemetry/reports/`. Use `doctor` when workspace-health evidence is relevant. Write dated notes to the Hermit `## Strategic Observations` section, update `## Strategic Experiments` with what was tried and the next test, promote actionable follow-ups into the Hermit inbox or record, and update `last_strategic_review` in the record frontmatter to today. Small, clearly correct framework fixes may be applied directly, but avoid speculative redesigns. Give a brief summary of findings as output.";

export const STRATEGIC_REVIEW_HEARTBEAT_PROMPT =
  "Run a daily strategic review instead of normal task advancement. Read the role's record and inbox files under the workspace root fully, then follow the strategic review guidance already loaded in the system prompt. Run the review as an explicit `evidence -> hypothesis -> test -> re-evaluate hypothesis` loop. Start by reviewing any open or recent items in the role's `## Strategic Experiments`, and use git history when helpful to see exactly which files the agent changed since the previous review and whether yesterday's test affected the expected areas. Cover all review areas: goal clarity, effort alignment, organizational fitness, process and prompt quality, telemetry health, and research for missing skills or better approaches. For telemetry, read the most recent reports under the workspace root `.hermit/telemetry/reports/`. For skill gaps or better approaches, search online only when local evidence suggests a real gap and workspace files are not enough. Write observations to the role's `## Strategic Observations` section with today's date. Update `## Strategic Experiments` with what was tried, whether it helped, and the next hypothesis or test. Promote actionable findings to inbox items or next actions. If you identify prompt, entity definition, or role manifest changes, capture them as follow-up items marked for user review — do not apply them directly. Small, clearly correct code fixes may be applied directly but must be noted for surfacing at the next interactive session. Update `last_strategic_review` in the record frontmatter to today's date. Give a brief summary of findings as output.";

const MAX_STARTUP_ISSUES_IN_SYSTEM_PROMPT = 5;

export function renderWorkspaceStartupIssuesSystemPrompt(root: string, issues: readonly RoleLoadIssue[]): string {
  if (issues.length === 0) {
    return "";
  }

  const visibleIssues = issues.slice(0, MAX_STARTUP_ISSUES_IN_SYSTEM_PROMPT);
  const renderedIssues = visibleIssues.map((issue) => {
    const manifestFile = path.relative(root, issue.manifestFile) || issue.manifestFile;
    return `- ${issue.roleId}: ${issue.message} (manifest: ${manifestFile})`;
  });
  const omittedCount = issues.length - visibleIssues.length;

  return [
    "## Workspace Load Issues",
    "Hermit started in degraded mode because some roles could not be loaded. The session must remain usable so you can diagnose and repair those files from inside Hermit.",
    "Current issues:",
    ...renderedIssues,
    ...(omittedCount > 0 ? [`- ${omittedCount} additional role load issue(s) omitted from this summary.`] : []),
    "Operating rules:",
    "- Treat the listed roles as unavailable until repaired.",
    "- If the user did not ask for something else more urgent, briefly mention the degraded startup state and offer to fix it.",
    "- You may inspect and edit the broken workspace files directly from this Hermit session.",
  ].join("\n");
}

export function resolveInitialChatPrompt(options: {
  initialPrompt?: string;
  continueRecent?: boolean;
  hasStartupIssues?: boolean;
  workspaceState: WorkspaceInitializationState;
}): string | undefined {
  if (options.initialPrompt !== undefined) {
    return options.initialPrompt;
  }

  if (options.hasStartupIssues) {
    return STARTUP_ISSUES_CHAT_OPENING_PROMPT;
  }

  if (!options.workspaceState.initialized) {
    return ONBOARDING_CHAT_OPENING_PROMPT;
  }

  if (options.continueRecent) {
    return undefined;
  }

  return DEFAULT_CHAT_OPENING_PROMPT;
}
