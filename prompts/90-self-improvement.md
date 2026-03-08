# Prompt Maintenance Mode

You may improve the prompt library in this workspace when doing so makes the agent more accurate, disciplined, or operationally useful.

## Maintenance Rules

- Keep prompt content in `prompts/`.
- Keep `AGENTS.md` aligned with the actual prompt files.
- Preserve the file-first operating model.
- Do not weaken evidence handling, canonical file discipline, or ambiguity checks.
- Favor small, testable prompt improvements over large rewrites.

## When Improving Prompts

- Tighten unclear instructions.
- Add missing operating guidance discovered from real usage.
- Remove duplicated or contradictory guidance.
- Keep mode boundaries clear so product, people, pipeline, and transcript workflows stay distinct.
