# Hermit Software Workspace

This file is for work on the **Hermit software runtime and repository itself**.
It describes the codebase, prompt system, runtime behavior, docs, tests, and examples that make Hermit work.

## Scope

Use this file when the task involves changing or inspecting Hermit itself, including:

- runtime or CLI code
- prompt assembly or routing behavior
- role manifests or initialization behavior
- explorer, TUI, SDK, extensions, themes, or provider integrations
- tests, examples, docs, or architecture

Do **not** use this file as the source of truth for the user's configured domain or operating context.

## Business Context Boundary

- The top-level workspace/project name `Hermit` refers to the software environment, not the user's configured domain model.
- Canonical domain context comes from the workspace files the user and setup skills create under `entities/`, `entity-defs/`, and `agents/`.
- Role operating context comes from `agents/<role-id>/AGENTS.md`, `agents/<role-id>/role.md`, and that role's canonical files.
- If workspace/software metadata conflicts with canonical workspace files, prefer the canonical workspace files and role files for domain-facing work.

## Operating Model For Software Work

- Treat files in this workspace as canonical truth for the Hermit software system.
- Prefer updating existing canonical files over inventing new structures.
- Use raw evidence, transcripts, images, PDFs, slides, and notes as supporting material, not canonical truth.
- When evidence changes canonical understanding, update the canonical file and cite the evidence in `source_refs`.
- Do not rely on chat memory when the answer should be written to disk.
- Before making substantive software updates, read the smallest relevant set of docs, manifests, prompts, and implementation files first.

## Canonical Directories

- `entities/`: entity instance data only.
 - Shared and role-managed entity directories live here.
 - Exact structure is defined by `entity-defs/entities.md` and the setup skills, not by the runtime.
- `entity-defs/`: shared entity definitions and custom explorer renderers.
- `inbox/`: shared intake area for uncategorized incoming user files before they are routed to their durable homes or removed as temporary drops.
- `prompts/templates/`: shared non-entity scaffolds such as core agent operating templates.
- `skills/`: shared pi skills that can be loaded on demand across roles.
- `agents/`: one subdirectory per operating role (agent).
- `docs/`: Hermit implementation and architecture documentation.
- `examples/`: Hermit examples for extensions, custom tools, and SDK usage.

Each agent directory contains its own:

- `role.md`: machine-readable role behavior contract
- `AGENTS.md`: role prompt index and startup guidance
- `agent/`: role-specific operating system with `record.md` and `inbox.md`
- `prompts/`: reusable role instructions
- `skills/`: reusable role-local pi skills

## Naming Rules

- Use stable IDs at the directory level.
- Entity IDs and structure come from `entity-defs/entities.md`.
- Keep one canonical `record.md` per mutable entity directory.
- Use dated markdown files in `notes/` when a time-bound note should be preserved.
- Keep binary and supporting artifacts under `artifacts/` or role-defined evidence folders, not mixed into canonical markdown files.

## Canonical Truth Rules

- `agents/<role-id>/agent/record.md` stores the current clarified operating system for that role.
- `agents/<role-id>/agent/inbox.md` stores that role's raw captured commitments until clarified.
- `inbox/` stores incoming uncategorized user files temporarily; it is not a canonical archive and should be drained into the right role or entity directories.
- Shared and role-managed entity `record.md` files under `entities/` store the best current state for each entity instance.
- Entity-defined supporting files live beside the canonical record when `entity-defs/entities.md` requires them.
- Prompt files are editable operating instructions, but they are not business facts.
- Skill files are editable operating instructions and helper workflows, but they are not business facts.

## Prompt Index

Each role owns its own prompt index under `agents/<role-id>/AGENTS.md`.
Use the selected role's prompt directory as canonical for role work.

## Internal Architecture Reference

- [`docs/architecture.md`](docs/architecture.md): implementation design document for understanding how Hermit is built and why the architecture was chosen. Read this when the task requires understanding or changing the runtime's internal implementation.

## Prompt Maintenance

- Prompt files may be improved over time, but changes should preserve the file-first operating model.
- Keep role manifests explicit for behavior and capabilities, and keep entity definitions explicit in `entity-defs/entities.md`.
- When a role contract changes, update that role's `AGENTS.md`, `role.md`, prompts, tests, and docs together. When entity structure changes, update `entity-defs/`, tests, and docs together.

## Self-Improvement Loop

- When improving Hermit itself, first classify the smallest correct change surface: shared prompt, role prompt, runtime code, `entity-defs/`, explorer renderer, validation, doc, or test.
- Use repeated friction, explicit corrections, telemetry reports, `doctor` findings, and failing tests as evidence when available.
- Prefer durable fixes that encode the lesson into prompts, templates, validation, or tests instead of leaving it as chat-only guidance.
- If a contract changes, update the adjacent docs, templates, manifests, and regression coverage in the same pass.
