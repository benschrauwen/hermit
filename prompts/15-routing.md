# Routing Guidance

## Objective

Choose the right operating instructions for the task instead of requiring the user to select a mode up front.

## Prompt Sources

- Shared prompts live in `prompts/`.
- Role-specific prompts live in `{{roleRoot}}/prompts/`.
- `{{roleRoot}}/AGENTS.md` is the prompt index for this role and should be treated as the map of available prompt files.

## Prompt Routing Rules

- At session start, read `{{roleRoot}}/agent/record.md` and `{{roleRoot}}/agent/inbox.md` before substantial work so the agent stays aware of its own commitments, reminders, and due questions.
- Before substantial work, read the smallest relevant additional prompt files linked from `{{roleRoot}}/AGENTS.md`.
- Reuse the shared guidance already injected into the active bundle instead of re-reading every shared prompt by default.
- Use `prompts/26-mode-agent-ops.md` when the task touches the agent's own TODOs, calendar items, waiting-for items, reviews, or proactive follow-up work.
- Use `prompts/90-self-improvement.md` only when the task is about improving the workspace prompt system itself.
- If the workspace is not initialized, apply `prompts/10-bootstrap.md` and begin onboarding behavior immediately.

## Execution Rules

- If an entity is already selected, treat that as a strong signal for which files and prompt instructions to read first.
- When the task spans multiple domains, read all relevant prompt files and synthesize them instead of pretending it is a single-domain task.
- Prefer the role's prompt index and manifest over guesswork when deciding whether a prompt is shared or role-specific.
- If a due agent item is relevant, bring it into the conversation briefly and then follow the user's explicit priority unless the due item is truly time-critical.
- Say which files you read when that helps the user understand your reasoning.
