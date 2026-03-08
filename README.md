# Hermit

<p align="center">
  <img src="public/mascot.png" alt="Hermit" width="200" />
</p>

**A local, file-first runtime for autonomous applications.**

Hermit treats the workspace as the system of record. Business state lives in markdown files and directories — inspectable, portable, versionable. The runtime is a thin orchestration layer that loads role contracts, wires agent sessions, and keeps behavior deterministic while the operating context stays editable.

## Features

- **File-first state** — company, people, product, and role-specific records live on disk as markdown. No database, no opaque store.
- **Role-based agents** — each role ships its own prompts, templates, workflows, entity types, and operating rules via a declarative `role.md` manifest.
- **Deterministic scaffolding** — entities, records, and evidence are created through safe, ID-stable operations.
- **Evidence ingestion** — transcripts and supporting material update canonical records without replacing them.
- **Workspace explorer** — a local read-only Astro UI for browsing the system of record, driven by the same runtime the CLI uses.
- **Doctor** — validates workspace integrity: prompt links, required files, duplicate IDs, placeholder drift.

## Quick Start

```bash
bun install
export OPENAI_API_KEY=your_key_here
bun cli chat --role sales
```

## Commands

```bash
bun cli chat --role sales              # interactive session
bun cli chat --role engineering        # switch roles
bun cli ask --role sales "Review the top open deals"
bun cli ingest transcript ./notes/acme-call.md --role sales --entity d-2026-0001-acme-expansion
bun cli doctor --role sales            # validate workspace integrity
bun run explorer                       # launch the workspace UI
```

When running from inside `roles/<role-id>/`, the role is inferred automatically.

## Workspace Structure

```
company/           # shared company context
people/            # shared people records
prompts/           # shared prompt library
roles/
  sales/
    role.md        # role contract (manifest)
    AGENTS.md      # prompt index
    agent/         # operating state (record.md, inbox.md)
    prompts/       # role-specific prompts
    templates/     # scaffold templates
    deals/         # role entities
    product/
  engineering/
    role.md
    AGENTS.md
    agent/
    prompts/
    templates/
    tickets/
templates/shared/
explorer/          # read-only Astro workspace UI
```

## How Roles Work

Each role is defined by `roles/<role-id>/role.md`. The manifest declares:

- **Prompt catalog** — maps stable IDs to shared or role-local prompt files
- **Prompt bundles** — small ordered sets injected at session startup (e.g. `default`, `onboarding`, `transcript-ingest`)
- **Entity types** — directory layout, ID strategy, fields, required files
- **Templates** — markdown scaffolds with placeholder substitution
- **Capabilities** — optional features like transcript ingestion

The runtime stays generic. Roles define behavior through files, not code changes. Adding a new role is a file-creation exercise:

1. Create `roles/<role-id>/role.md`
2. Add prompt catalog entries and prompt files
3. Add `AGENTS.md`, templates, and entity directories
4. Run `bun cli doctor --role <role-id>` to validate

## Environment

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Required for agent sessions and web search |
| `ROLE_AGENT_MODEL` | Model override (default: `openai/gpt-5.4`) |
| `ROLE_AGENT_WEB_SEARCH_MODEL` | Model override for web search tool |
| `ROLE_AGENT_THINKING_LEVEL` | Thinking level (default: `medium`) |
| `ROLE_AGENT_ENABLE_COMPUTER_USE` | Set `true` to expose computer-use boundary tool |

## Architecture

Hermit separates **deterministic orchestration** (TypeScript) from **operating context** (markdown):

- TypeScript owns CLI routing, role resolution, safe writes, ID generation, validation, tool wiring, and session management.
- Markdown owns business state, prompts, templates, and role contracts.

The explorer reuses the same role and entity model as the CLI — no separate domain layer, no data duplication. Role manifests can optionally declare custom explorer renderers for entity detail pages.

For the full design document, see [`docs/architecture.md`](docs/architecture.md).

## License

MIT
