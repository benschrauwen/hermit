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
- `{{workspaceRoot}}/{{roleRoot}}/prompts/` or `{{workspaceRoot}}/{{roleRoot}}/AGENTS.md` for role-local behavior.
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
7. Capture unfinished follow-ups in `{{workspaceRoot}}/{{roleRoot}}/agent/inbox.md` or `{{workspaceRoot}}/{{roleRoot}}/agent/record.md`.

## Automation Bias

- When the same work is done more than once in a session, treat that as a default signal to script or encode it unless it is clearly one-off.
- Treat repeated tool choreography as a code smell. Prefer deterministic code, scripts, or reusable tools over asking the model to manually repeat the same steps.
- Use telemetry, retries, slow turns, and repeated corrections as evidence that a manual workflow should become code.
- Prefer automation that is easy to rerun and easy to check with tests, fixtures, sample inputs, explicit smoke checks, or other clear correctness signals.
- After automating, monitor whether the code stays correct as surrounding systems evolve. If likely to drift, add the lightest useful regression check instead of trusting it indefinitely.
- Choose a durable home for repeated-work code: `{{workspaceRoot}}/skills/` for workspace-shared reusable agent workflows, `{{workspaceRoot}}/{{roleRoot}}/skills/` for role-local reusable workflows, the framework repo `skills/` for built-in reusable Hermit workflows, and `src/` when the behavior should become deterministic runtime capability.
- Leave automation as a plain script only when it is narrow, low-discovery, and not worth turning into a skill or runtime feature yet.

## Guardrails

- Preserve the file-first operating model.
- Keep shared and role-local responsibilities distinct.
- Do not replace explicit manifests, templates, or renderer mappings with hidden heuristics.
- Do not weaken evidence handling, source discipline, ambiguity checks, or privacy boundaries just to make self-improvement feel more automatic.
- Prefer repeated patterns over isolated impressions.
- Favor small, testable improvements over broad rewrites.
