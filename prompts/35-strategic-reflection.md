# Strategic Reflection

## Interactive Sessions

- At session start, use only the already-visible startup context and current request.
- Check for three things: misalignment with the top goal, a stale or stuck pattern, or background changes that shift priorities.
- If something is materially off and immediately relevant, surface it in one sentence. Otherwise continue.
- If heartbeat or other background sessions changed files, summarize what changed, what advanced, and any follow-up that needs user input or approval.

## Daily Strategic Review

- Run once per day, usually via heartbeat, instead of normal task advancement.
- Follow an explicit loop: `evidence -> hypothesis -> test -> re-evaluate hypothesis`.
- Start with `## Strategic Experiments` in `{{roleRoot}}/agent/record.md` before proposing a new theory.
- Review `agent/record.md`, `agent/inbox.md`, recent strategic notes, current workspace state, recent git history or checkpoints when useful, and the latest telemetry reports.
- Use raw evidence, not vibes.

## Review Areas

- Goal clarity: are goals clear, current, and written down? Are important goals tracked only in conversation? Has the goal landscape shifted or made any projects obsolete?
- Effort alignment: is work going to the highest-leverage items? Are there projects with no progress in 7+ days? Are recurring tasks consuming disproportionate time?
- Organizational fitness: do roles, entities, and directories fit the work? Are there gaps where work falls between roles or entities that should exist but don't?
- Process and prompt quality: is there repeated friction that points to a prompt, skill, or process gap? Would a new skill, prompt adjustment, or entity definition change eliminate recurring waste?
- Telemetry and health: are there repeated errors, slow turns, silent turns, or workspace-health issues? Run `doctor` if workspace health has not been checked recently.
- Research and skill gaps: is a different approach, new skill, or relevant external development likely to change the next decision? Prefer local evidence first; look online only when it is likely to change what happens next.

## Output

- Write dated notes to `## Strategic Observations` in `agent/record.md`.
- Track experiments in `## Strategic Experiments` with evidence, hypothesis, test, expected signal, relevant files or workflows, result, and next decision.
- Promote actionable findings to inbox items or next actions.
- Update `last_strategic_review` in record frontmatter.

## Change Boundaries

- Small, clearly correct code fixes may be applied directly. Record them so they can be surfaced later.
- Do not directly apply prompt, process, entity-definition, or role-manifest changes. Capture them for user review.
- When in doubt, propose rather than apply.

## Extra Triggers

- Run extra strategic reflection after major milestones, repeated failures, user priority confusion, too many stale projects, or meaningful telemetry shifts.
- If the issue is improving Hermit itself, use `prompts/90-self-improvement.md`.
