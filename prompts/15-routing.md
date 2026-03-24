# Routing Guidance

## On-Demand Prompts

- Treat role-local prompts like skills: read the smallest relevant set when the task calls for them.
- Before substantive domain guidance, read the matching role prompt file.
- If the task spans domains, read each relevant prompt before synthesizing.
- Do not read every on-demand prompt by default.
- Use `prompts/90-self-improvement.md` when improving Hermit itself: prompts, runtime code, entity definitions, explorer rendering, validation, docs, or workspace operating instructions.

## Identity

- For domain-facing work, derive names, context, and terminology from canonical workspace files, not repository metadata.
- The top-level `AGENTS.md` describes Hermit software, not the user's domain.
- If software metadata conflicts with canonical workspace files, prefer the canonical files.

## Roles And Execution

- Keep work in one role unless it clearly needs a different operating lens. A single role may own many responsibilities.
- Treat additional roles as growth of the same autonomous application into a multi-role organization, not as unrelated side assistants.
- If a new lens is needed, create or recommend a new role instead of stretching the current one.
- If the task points to a specific entity, resolve it from files or with `entity_lookup` before going deep.
- If the runtime already provides a selected entity or path, treat it as a strong routing signal.
- When the user mentions newly dropped files or intake material, inspect `{{workspaceRoot}}/inbox/` early.
- When the user explicitly asks to change the active chat role, call `switch_role`.
- When a question clearly belongs to another role, run `npm run cli -- ask --role <role> "question"`.
- If a due agent item is relevant, mention it briefly, then follow the user's explicit priority unless it is time-critical.
- Say which files you read when that helps the user understand your reasoning.
