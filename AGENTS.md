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

Do **not** use this file as the source of truth for the operated business or company under management.

## Business Context Boundary

- The top-level workspace/project name `Hermit` refers to the software environment, not the company being operated on.
- The canonical company identity and business context come from `entities/company/record.md` and related files under `entities/company/`.
- Shared people context comes from `entities/people/`.
- Role operating context comes from `agents/<role-id>/AGENTS.md`, `agents/<role-id>/role.md`, and that role's canonical files.
- If workspace/software metadata conflicts with company files, prefer the canonical company and role files for business-facing work.

## Operating Model For Software Work

- Treat files in this workspace as canonical truth for the Hermit software system.
- Prefer updating existing canonical files over inventing new structures.
- Use raw evidence, transcripts, images, PDFs, slides, and notes as supporting material, not canonical truth.
- When evidence changes canonical understanding, update the canonical file and cite the evidence in `source_refs`.
- Do not rely on chat memory when the answer should be written to disk.
- Before making substantive software updates, read the smallest relevant set of docs, manifests, prompts, and implementation files first.

## Canonical Directories

- `entities/`: entity instance data only.
  - `entities/company/`: shared company-level context for the operated business.
  - `entities/people/`: shared people records with `record.md`, `development-plan.md`, `notes/`, and `artifacts/`.
  - Entity data directories such as `entities/deals/`, `entities/product/`, `entities/tickets/`, etc.
- `entity-defs/`: entity type definitions, scaffold templates, and custom explorer renderers.
- `agents/`: one subdirectory per operating role (agent).
- `docs/`: Hermit implementation and architecture documentation.
- `examples/`: Hermit examples for extensions, custom tools, and SDK usage.

Each agent directory contains its own:

- `role.md`: machine-readable role contract
- `AGENTS.md`: role prompt index and startup guidance
- `agent/`: role-specific operating system with `record.md` and `inbox.md`
- `prompts/`: reusable role instructions

## Naming Rules

- Use stable IDs at the directory level.
- Shared people use `p-<slug>`.
- Role-local entities use the ID strategy declared in the role manifest.
- Keep one canonical `record.md` per mutable entity directory.
- Use dated markdown files in `notes/` when a time-bound note should be preserved.
- Keep binary and supporting artifacts under `artifacts/` or role-defined evidence folders, not mixed into canonical markdown files.

## Canonical Truth Rules

- `agents/<role-id>/agent/record.md` stores the current clarified operating system for that role.
- `agents/<role-id>/agent/inbox.md` stores that role's raw captured commitments until clarified.
- Shared `record.md` files under `entities/company/` and `entities/people/` store the best current shared state.
- Entity `record.md` files store the best current state for each entity instance.
- Role-defined supporting files such as qualification sheets, activity logs, or ticket notes live beside the canonical record when the role manifest requires them.
- Prompt files are editable operating instructions, but they are not business facts.

## Prompt Index

Each role owns its own prompt index under `agents/<role-id>/AGENTS.md`.
Use the selected role's prompt directory as canonical for role work.

## Internal Architecture Reference

- [`docs/architecture.md`](docs/architecture.md): implementation design document for understanding how Hermit is built and why the architecture was chosen. Read this when the task requires understanding or changing the runtime's internal implementation.

## Prompt Maintenance

- Prompt files may be improved over time, but changes should preserve the file-first operating model.
- Keep role manifests explicit. Do not replace them with recursive prompt or template discovery.
- When a role contract changes, update that role's `AGENTS.md`, `role.md`, prompts, templates, tests, and docs together.
