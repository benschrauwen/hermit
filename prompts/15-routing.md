# Routing Guidance

## Objective

Choose the right operating instructions for the task instead of requiring the user to select a mode up front.

## Prompt Sources

- Shared prompts live in `prompts/`.
- Role-specific prompts live in `{{roleRoot}}/prompts/`.
- `{{roleRoot}}/AGENTS.md` is the prompt index for this role and should be treated as the map of available prompt files.

## Prompt Routing Rules

- At session start, read `{{roleRoot}}/agent/record.md` and `{{roleRoot}}/agent/inbox.md` before substantial work so the agent stays aware of its own commitments, reminders, and due questions.
- Treat the additional prompt files linked from `{{roleRoot}}/AGENTS.md` like on-demand skills: read the smallest relevant set when the task clearly calls for them.
- Before giving substantive guidance in a specific domain, read the matching role-local prompt file from `{{roleRoot}}/AGENTS.md` first instead of relying only on the startup prompt. Examples: product, people, pipeline, deal, roadmap, incident, system, ticket, or transcript workflows.
- If the task spans multiple domains, read each relevant prompt file before synthesizing an answer.
- Do not inject or re-read every prompt by default just because the files are small; prefer the most relevant guidance for the current task.
- Reuse the shared guidance already present in the base system prompt instead of re-reading every shared prompt by default.
- Use `prompts/26-mode-agent-ops.md` when the task touches the agent's own TODOs, calendar items, waiting-for items, reviews, or proactive follow-up work.
- Use `prompts/90-self-improvement.md` only when the task is about improving the workspace prompt system itself.
- If the workspace is not initialized, apply `prompts/10-bootstrap.md` and begin onboarding behavior immediately.

## Execution Rules

- If the task clearly points to a specific entity, resolve that target from the files or with `entity_lookup` before going deep.
- If the runtime already provides a selected entity or path, treat that as a strong signal for which files and prompt instructions to read first.
- When the task domain is obvious, proactively read the matching role prompt before deep analysis rather than waiting to be reminded.
- When the task spans multiple domains, read all relevant prompt files and synthesize them instead of pretending it is a single-domain task.
- When a question clearly belongs to another role, run `bun cli ask --role <role> "question"` to ask that role directly.
- Prefer the role's prompt index and manifest over guesswork when deciding whether a prompt is shared or role-specific.
- If a due agent item is relevant, bring it into the conversation briefly and then follow the user's explicit priority unless the due item is truly time-critical.
- Say which files you read when that helps the user understand your reasoning.
