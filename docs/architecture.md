# Architecture Design

## Purpose

This project implements a local, file-first sales leadership agent. The goal is to keep the workspace itself as the system of record while using an AI runtime to inspect, update, and reason over that file-backed context.

The design intentionally favors a small CLI and deterministic TypeScript orchestration over a larger service-oriented architecture. Business state lives in markdown files. Workflow instructions live in markdown prompt files. Code is responsible for routing, validation, ID/path generation, and tool wiring.

## Design Principles

### 1. File-first system of record

The workspace is the product. Company, people, product, and deal state are stored as files under canonical directories such as `company/`, `people/`, `product/`, and `deals/`.

Why:

- local files are inspectable, portable, versionable, and easy to edit
- the agent can work without a database, API server, or background jobs
- users can trust the workspace contents more than chat history
- supporting evidence can be preserved alongside canonical summaries

### 2. Prompts stay in markdown, not TypeScript

Prompt content is kept under `prompts/`, and `AGENTS.md` acts as the root contract and prompt index. The application loads and composes prompt bundles at runtime instead of embedding operating instructions in source code.

Why:

- behavior remains editable without changing the runtime
- prompt maintenance is visible and auditable
- orchestration logic stays separate from operating guidance
- the project can evolve operating guidance without turning code into hidden prompt config

### 3. Keep orchestration deterministic

TypeScript handles the parts that should be predictable: CLI parsing, directory scaffolding, entity lookup, ID generation, prompt bundle selection, onboarding state detection, session creation, transcript placement, and workspace validation.

Why:

- deterministic tasks are easier to test and reason about in code
- the model should not invent file locations or naming rules
- validation and safe writes reduce accidental workspace drift

### 4. Start with a small local runtime

The runtime is built on `@mariozechner/pi-coding-agent` and `@mariozechner/pi-ai` instead of a custom agent loop.

Why:

- the project inherits mature session handling, model registry support, and coding/file tools
- implementation stays compact
- the team can focus on the sales-leader workflow instead of agent infrastructure

## High-Level Architecture

The system has four layers:

1. CLI entrypoints in `src/cli.ts`
2. Deterministic orchestration modules in `src/`
3. Prompt and workspace contracts in `AGENTS.md` and `prompts/`
4. Canonical business data in workspace directories such as `company/`, `people/`, `product/`, and `deals/`

In practice, the flow looks like this:

1. A user runs a CLI command such as `chat`, `ask`, `ingest transcript`, or `doctor`.
2. The CLI resolves the workspace root and optional entity context.
3. The runtime loads the base prompt bundle from markdown files.
4. A session is created with standard coding tools plus project-specific tools.
5. The model reads additional prompt files from `prompts/` when the task requires domain-specific guidance.
6. The model reads and updates the file-backed workspace according to the prompt contract.
7. Validation commands and deterministic helpers keep the workspace shape consistent.

## Module Responsibilities

### `src/cli.ts`

This is the command surface for the application. It exposes:

- `chat`
- `ask`
- `ingest transcript`
- `doctor`

Why this shape:

- it keeps the product legible from the command line
- commands map directly to user workflows
- the runtime does not need a server or web UI to be useful

### `src/session.ts`

This module creates configured agent sessions and drives both interactive and one-shot runs. It is responsible for:

- loading the workspace scaffold
- loading the prompt bundle
- configuring the resource loader
- choosing a preferred model with fallback behavior
- attaching built-in coding tools and custom tools
- optionally persisting sessions under `.sales-agent/sessions`
- handling image attachments for multimodal prompts

Why:

- session creation is the integration point between workspace rules, prompt bundles, models, and tools
- centralizing this logic keeps CLI commands thin and consistent

### `src/prompt-library.ts`

This module loads `AGENTS.md` and the required prompt files, then renders a requested prompt bundle using simple template placeholders such as `{{workspaceRoot}}`, `{{entityId}}`, and `{{transcriptPath}}`.

Why:

- prompt composition should be explicit and deterministic
- prompt/template rendering is simpler and safer than ad hoc string assembly across the codebase
- `doctor` can validate that the prompt library and `AGENTS.md` stay aligned

### `src/workspace.ts`

This module owns workspace structure and file-backed entity discovery. It provides:

- root path resolution
- scaffold creation
- slug and ID generation
- safe file writing
- entity scanning from canonical `record.md` files
- deal lookup for transcript ingest
- transcript copy helpers

Why:

- filesystem rules are core product logic
- centralizing path and naming behavior prevents drift across commands

### `src/bootstrap.ts`

This module now exposes onboarding-related deterministic helpers instead of a fixed questionnaire. First-run setup is initiated by a normal chat session when the workspace is still missing core records.

Why:

- onboarding should feel conversational instead of form-driven
- deterministic helper functions still protect IDs, paths, and file shapes
- the workspace can become useful incrementally as the user answers questions

### `src/templates.ts`

This module generates initial markdown documents for canonical records and supporting planning files.

Why:

- templates enforce consistent frontmatter and section structure
- new records begin in a valid shape that the agent can extend safely
- this reduces prompt complexity because the agent starts from structured documents

### `src/ingest.ts`

This module handles transcript ingest. It:

- resolves or confirms the target deal
- stores the raw transcript under the deal or unmatched inbox
- appends an entry to `activity-log.md`
- creates a transcript-ingest session
- runs a dedicated command prompt to update the deal state

Why:

- evidence preservation comes before interpretation
- transcript workflows need deterministic file handling plus AI summarization
- ambiguous matching should degrade safely to user choice or unmatched storage

### `src/doctor.ts`

This module validates the workspace by checking:

- required directories
- presence of `AGENTS.md`
- presence of required prompt files
- prompt links referenced from `AGENTS.md`
- duplicate entity IDs
- minimal canonical frontmatter in `record.md`
- required environment state such as `OPENAI_API_KEY`

Why:

- the workspace contract is part of the architecture, not an afterthought
- failures should be caught as structural issues before they become behavioral issues

### `src/agent-tools.ts`

This module defines project-specific tools layered on top of the runtime's built-in coding tools:

- `entity_lookup`
- `web_search`
- `computer_use` boundary placeholder

Why:

- sales workflows benefit from narrow, deterministic tools for common tasks
- live web search supports current market and competitor research
- the `computer_use` placeholder creates a future integration seam without forcing browser automation into v1

## Workspace Contract

The workspace layout is a core architectural decision, not just a storage detail.

### Canonical directories

- `company/` for company-level operating context
- `people/` for one directory per person
- `product/` for one directory per product
- `deals/` for one directory per deal
- `supporting-files/` for loose or unmatched evidence
- `prompts/` for reusable AI instructions
- `.sales-agent/sessions/` for persisted session history

### Canonical files

- `record.md` is the current best state for an entity
- `development-plan.md` stores the current coaching plan for a person
- `playbook.md` and `competitive-analysis.md` support product selling assets
- `meddicc.md` stores deal qualification state
- `activity-log.md` stores dated evidence-aware history

Why this contract:

- it gives the model predictable read/write locations
- it keeps mutable summaries separate from raw evidence
- it scales by adding directories and files rather than changing application infrastructure

## Prompt Architecture

Prompt selection is bundle-based. The code starts normal sessions with a small shared bundle, then the agent reads additional prompt files from `prompts/` when the task requires more specific instructions, for example:

- soul
- file rules
- routing guidance
- onboarding guidance when the workspace is not initialized

Special flows such as transcript ingest can also render a dedicated command prompt with contextual placeholders.

Why:

- shared guidance avoids duplicating core rules
- reusable instruction files keep specialized guidance targeted without forcing the user to choose a mode up front
- command prompts let the system inject precise context without hiding business logic in TypeScript

## Runtime And Model Strategy

The project defaults to `openai/gpt-5.4`, with environment-variable overrides for the main model and the web-search model.

Why:

- model selection belongs in configuration, not in prompt text
- the runtime should remain flexible as provider/model naming changes over time
- sensible fallback behavior improves resilience when preferred model IDs are unavailable

Image attachments are supported for chat, ask, and transcript workflows.

Why:

- screenshots and photos are realistic sales inputs
- multimodal support is valuable without requiring a larger platform build

## Evidence Handling

A key design choice is separating evidence from canonical state.

- transcripts are copied into deal folders or an unmatched inbox
- activity logs receive explicit dated entries
- the agent then updates canonical markdown files using the ingested evidence

Why:

- raw evidence remains recoverable
- canonical summaries can evolve without losing source material
- the workspace preserves traceability between observed inputs and current state

## What We Intentionally Did Not Build

The current architecture avoids:

- a database
- a web server
- hidden prompt configuration in code
- background job orchestration
- first-class computer/browser automation in v1

Why:

- the product goal is a trustworthy local workspace, not an always-on platform
- smaller scope makes the architecture easier to understand and maintain
- these boundaries preserve room for future expansion without complicating the initial build

## Extension Points

The current design leaves clear seams for future changes:

- add richer validation rules in `doctor`
- add more custom tools in `src/agent-tools.ts`
- extend prompt bundles with new reusable operating instructions
- enable real computer-use behind the existing boundary
- add more evidence ingestors that follow the same "store raw input first, update canonical state second" pattern

## Summary

What we implemented is a small local CLI agent whose architecture is centered on file-backed truth, markdown-based prompt control, deterministic orchestration, and a reusable agent runtime.

That combination was chosen because it keeps the system transparent, editable, and operationally simple while still making room for AI-assisted sales leadership workflows such as coaching, deal inspection, pipeline review, product asset creation, and transcript-driven updates.
