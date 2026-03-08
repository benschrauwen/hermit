# Hermit Workspace

This workspace is the system of record for Hermit, a local file-first runtime for autonomous applications.
The current implementation is centered on multi-role leadership agents. Shared company and people context live at the workspace root, while each leadership role runs from its own subdirectory under `roles/`.

## Operating Model

- Treat files in this workspace as canonical truth.
- Prefer updating existing canonical files over inventing new structures.
- Use raw evidence, transcripts, images, PDFs, slides, and notes as supporting material, not canonical truth.
- When evidence changes canonical understanding, update the canonical file and cite the evidence in `source_refs`.
- Do not rely on chat memory when the answer should be written to disk.
- At session start, read `agent/record.md` and `agent/inbox.md` so internal commitments, reminders, and due questions carry forward across sessions.
- Before making substantive updates, read the relevant company, people, product, and deal files first.

## Canonical Directories

- `company/`: shared company-level context and strategy.
- `people/`: shared people records with `record.md`, `development-plan.md`, `notes/`, and `artifacts/`.
- `roles/`: one subdirectory per role.

Each role directory contains its own:

- `role.md`: machine-readable role contract
- `AGENTS.md`: prompt index for that role
- `agent/`: role-specific operating system with `record.md` and `inbox.md`
- `prompts/`: reusable role instructions
- `templates/`: role-local scaffold templates
- role-defined entity directories such as `deals/`, `product/`, `tickets/`, `campaigns/`, or `leads/`

## Naming Rules

- Use stable IDs at the directory level.
- Shared people use `p-<slug>`.
- Role-local entities use the ID strategy declared in the role manifest.
- Keep one canonical `record.md` per mutable entity directory.
- Use dated markdown files in `notes/` when a time-bound note should be preserved.
- Keep binary and supporting artifacts under `artifacts/` or role-defined evidence folders, not mixed into canonical markdown files.

## Canonical Truth Rules

- `roles/<role-id>/agent/record.md` stores the current clarified operating system for that role.
- `roles/<role-id>/agent/inbox.md` stores that role's raw captured commitments until clarified.
- Shared `record.md` files under `company/` and `people/` store the best current shared state.
- Role-local `record.md` files store the best current state for that role's entities.
- Role-defined supporting files such as qualification sheets, activity logs, or ticket notes live beside the canonical record when the role manifest requires them.
- Prompt files are editable operating instructions, but they are not business facts.

## Prompt Index

Each role owns its own prompt index under `roles/<role-id>/AGENTS.md`.
The runtime should treat the selected role's prompt directory as canonical for that session.

## Internal Architecture Reference

- [`docs/architecture.md`](docs/architecture.md): implementation design document for understanding how Hermit is built and why the architecture was chosen. Read this only when the task requires understanding or changing the runtime's internal implementation. Do not treat it as required context for normal sales leadership work.

## Prompt Maintenance

- Prompt files may be improved over time, but changes should preserve the file-first operating model.
- Keep role manifests explicit. Do not replace them with recursive prompt or template discovery.
- When a role contract changes, update that role's `AGENTS.md`, `role.md`, prompts, templates, tests, and docs together.
