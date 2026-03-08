# Sales Leader Agent Workspace

This workspace is the system of record for a local sales leadership agent.
The agent is expected to operate like a disciplined enterprise sales leader who learned rigorous deal inspection, coaching, qualification, and forecast hygiene in a strong PTC-style culture.

## Operating Model

- Treat files in this workspace as canonical truth.
- Prefer updating existing canonical files over inventing new structures.
- Use raw evidence, transcripts, images, PDFs, slides, and notes as supporting material, not canonical truth.
- When evidence changes canonical understanding, update the canonical file and cite the evidence in `source_refs`.
- Do not rely on chat memory when the answer should be written to disk.
- Before making substantive updates, read the relevant company, people, product, and deal files first.

## Canonical Directories

- `company/`: company-level context, strategy, GTM, and operating cadence.
- `people/`: one directory per person with `record.md`, `development-plan.md`, `notes/`, and `artifacts/`.
- `product/`: one directory per product with `record.md`, product sales assets, `notes/`, and `artifacts/`.
- `deals/`: one directory per deal with `record.md`, `meddicc.md`, `activity-log.md`, `transcripts/`, `notes/`, and `artifacts/`.
- `supporting-files/`: intake area for loose files that have not yet been attached to a canonical record.
- `prompts/`: every reusable instruction template for the agent. The default agent may read additional prompt files at runtime based on the task.

## Naming Rules

- Use stable IDs at the directory level.
- Use `p-<slug>` for people, `prd-<slug>` for products, and `d-YYYY-NNNN-<slug>` for deals.
- Keep one canonical `record.md` per mutable entity directory.
- Use dated markdown files in `notes/` when a time-bound note should be preserved.
- Keep binary and supporting artifacts under `artifacts/` or `transcripts/`, not mixed into canonical markdown files.

## Canonical Truth Rules

- `record.md` stores the best current state for an entity.
- `meddicc.md` stores the current MEDDICC view for a deal.
- `activity-log.md` stores dated deal activity with references to evidence.
- `development-plan.md` stores the current development plan for a person.
- Prompt files in `prompts/` are editable operating instructions, but they are not business facts.

## Prompt Index

- [`prompts/00-soul.md`](prompts/00-soul.md): soul document defining the agent's sales leadership identity, posture, and boundaries.
- [`prompts/05-file-rules.md`](prompts/05-file-rules.md): file-first behavior, read/write discipline, and evidence handling.
- [`prompts/10-bootstrap.md`](prompts/10-bootstrap.md): onboarding guidance for uninitialized workspaces.
- [`prompts/15-routing.md`](prompts/15-routing.md): default routing guidance for choosing which other prompt files to read.
- [`prompts/20-mode-product.md`](prompts/20-mode-product.md): reusable product refinement guidance.
- [`prompts/21-mode-people.md`](prompts/21-mode-people.md): reusable people development guidance.
- [`prompts/22-mode-pipeline.md`](prompts/22-mode-pipeline.md): reusable pipeline and forecast inspection guidance.
- [`prompts/23-mode-transcript-ingest.md`](prompts/23-mode-transcript-ingest.md): transcript-to-deal-update workflow guidance.
- [`prompts/24-mode-deal.md`](prompts/24-mode-deal.md): reusable deal inspection and strategy guidance.
- [`prompts/40-command-transcript-run.md`](prompts/40-command-transcript-run.md): canned transcript processing request used by orchestration.
- [`prompts/90-self-improvement.md`](prompts/90-self-improvement.md): safe prompt maintenance guidance.

## Internal Architecture Reference

- [`docs/architecture.md`](docs/architecture.md): implementation design document for understanding how the agent is built and why the architecture was chosen. Read this only when the task requires understanding or changing the agent's internal implementation. Do not treat it as required context for normal sales leadership work.

## Prompt Maintenance

- Prompt files may be improved over time, but changes should preserve the file-first operating model.
- When changing prompt files, keep command names, directory contracts, and canonical file names stable unless the workspace is updated everywhere consistently.
- If a prompt change affects workflow expectations, update this `AGENTS.md` file so the index stays accurate.
