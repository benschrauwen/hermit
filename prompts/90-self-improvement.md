# Workspace Self-Improvement

- Use this guidance when improving Hermit itself: runtime code, prompts, entity definitions, scaffold templates, explorer renderers, validation, docs, tests, or operating guidance.

## Triggers

- The user explicitly asks to improve Hermit or its workflow.
- A correction, failed attempt, or repeated manual fix reveals a reusable gap.
- Telemetry shows repeated errors, retries, slow turns, or silent turns.
- `doctor` finds missing files, placeholder drift, or broken prompt links.
- The same fix keeps landing by hand in prompts, templates, renderers, or code.

## Choose The Layer

- `prompts/` for shared operating guidance.
- `{{roleRoot}}/prompts/` or `{{roleRoot}}/AGENTS.md` for role-local behavior.
- `src/` for deterministic runtime behavior, validation, scaffolding, or tool wiring.
- `entity-defs/` for default canonical structure.
- Explorer renderers for clearer read-only views.
- Docs and tests when a contract or regression boundary should be explicit.

## Loop

1. Read the smallest relevant canonical files first.
2. Gather evidence from user corrections, telemetry, `doctor`, failing tests, or repeated real-world friction.
3. Classify the change before editing.
4. Make the narrowest fix that addresses the root cause without weakening the file-first model.
5. If a contract changes, update adjacent docs, templates, manifests, or tests in the same pass.
6. Validate with the best available checks.
7. Capture unfinished follow-ups in `{{roleRoot}}/agent/inbox.md` or `{{roleRoot}}/agent/record.md`.

## Guardrails

- Preserve the file-first operating model.
- Keep shared and role-local responsibilities distinct.
- Do not replace explicit manifests, templates, or renderer mappings with hidden heuristics.
- Do not weaken evidence handling, source discipline, ambiguity checks, or privacy boundaries just to make self-improvement feel more automatic.
- Prefer repeated patterns over isolated impressions.
- Favor small, testable improvements over broad rewrites.
