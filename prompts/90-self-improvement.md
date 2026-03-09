# Workspace Self-Improvement Guidance

Apply these instructions when the task is to improve Hermit itself, including runtime code, prompts, entity definitions, scaffold templates, explorer renderers, validation rules, docs, or the agent's own operating guidance.

## Objective

Improve Hermit in the smallest correct layer so execution quality compounds over time instead of relying on one-off chat advice.

## Triggers

Use this guidance when one or more of these are true:

- The user explicitly asks to improve Hermit or its workflow.
- A correction, failed attempt, or repeated manual fix reveals a reusable gap.
- Telemetry reports show repeated tool errors, retries, slow turns, or silent turns.
- `doctor` surfaces missing files, placeholder drift, or broken prompt links.
- The same fix keeps landing in prompts, templates, explorer renderers, or code by hand.

## Choose The Right Layer

- Update shared prompts in `prompts/` when the gap is reusable operating guidance across roles.
- Update role-specific prompts in `{{roleRoot}}/prompts/` or `{{roleRoot}}/AGENTS.md` when the behavior is role-local.
- Update TypeScript under `src/` when the problem is deterministic runtime behavior, validation, scaffolding, or tool wiring.
- Update `entity-defs/` when the same structure, placeholder, or review shape should appear by default in canonical files.
- Update explorer renderers when the read-only UI needs a clearer default view for high-signal files or entities.
- Update docs and tests when the contract, expected workflow, or regression boundary should become explicit.

## Improvement Loop

1. Read the smallest relevant canonical files first.
2. Gather evidence from the best available sources: user corrections, telemetry reports, `doctor`, failing tests, or repeated friction in real use.
3. Classify the change before editing: prompt, runtime, template, renderer, validation, doc, or test.
4. Prefer the narrowest change that fixes the root cause without weakening the file-first model.
5. When a contract changes, update the adjacent docs, templates, manifests, or tests in the same pass so the new rule becomes durable.
6. Validate the result with the most relevant checks available: tests, `doctor`, explorer checks, or telemetry review.
7. If a good next improvement is discovered but not completed now, capture it in `{{roleRoot}}/agent/inbox.md` or `{{roleRoot}}/agent/record.md` instead of trusting chat memory.

## Guardrails

- Preserve the file-first operating model.
- Keep shared and role-local responsibilities distinct.
- Do not replace explicit manifests, templates, or renderer mappings with hidden heuristics.
- Do not weaken evidence handling, source discipline, ambiguity checks, or privacy boundaries just to make self-improvement feel more automatic.
- Prefer measured repeated patterns over isolated impressions.
- Favor small, testable improvements over broad rewrites.
