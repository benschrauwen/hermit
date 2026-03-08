# Prompt Maintenance Guidance

Apply these instructions when the task is to improve the prompt library or workspace operating instructions.

## Maintenance Rules

- Keep shared prompt content in `prompts/`.
- Keep role-specific prompt content in `{{roleRoot}}/prompts/`.
- Keep `{{roleRoot}}/AGENTS.md` and `{{roleRoot}}/role.md` aligned with the actual prompt files.
- Preserve the file-first operating model.
- Do not weaken evidence handling, canonical file discipline, or ambiguity checks.
- Favor small, testable prompt improvements over large rewrites.

## When Improving Prompts

- Tighten unclear instructions.
- Add missing operating guidance discovered from real usage.
- Remove duplicated or contradictory guidance.
- Keep the reusable operating instructions clear so shared and role-local responsibilities stay distinct.
