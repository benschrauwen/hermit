# Hermit

<p align="center">
  <img src="public/mascot.png" alt="Hermit" width="200" />
</p>

<p align="center">
  <strong>Local, file-first runtime for autonomous applications.</strong>
</p>

**Hermit** is a runtime that turns a local workspace into the system of record for autonomous agents. Business state lives in markdown files — inspectable, portable, versionable. The runtime loads role contracts, wires agent sessions, and keeps behavior deterministic while the operating context stays editable. No database, no opaque store. Files are the product.

[Architecture](docs/architecture.md) · [Observability](docs/observability.md) · [License](LICENSE)

## Quick Start

```bash
bun install
export OPENAI_API_KEY=your_key_here
bun cli chat --role sales
```

When running from inside `agents/<role-id>/`, the role is inferred automatically.

## Commands

```bash
bun cli chat --role sales              # interactive session
bun cli chat --role engineering        # switch roles
bun cli ask --role sales "Review the top open deals"
bun cli heartbeat --role sales         # one autonomous GTD upkeep turn
bun cli ingest transcript ./notes/acme-call.md --role sales --entity d-2026-0001-acme-expansion
bun cli doctor --role sales            # validate workspace integrity
bun cli telemetry report --window 7d   # aggregate local runtime telemetry
bun run explorer                       # launch the workspace UI
```

`heartbeat` runs a single background turn for a role, intended for cron-style upkeep. It uses a separate persisted session history under that role so automated runs stay distinct from normal interactive chat history.

## Features

- **Role-based agents** — each role ships its own prompts, templates, workflows, entity types, and operating rules via a declarative `role.md` manifest.
- **Shared and role-local skills** — reusable pi skills can live under `skills/` or `agents/<role-id>/skills/` and are auto-exposed to sessions.
- **Deterministic scaffolding** — entities, records, and evidence are created through safe, ID-stable operations.
- **Evidence ingestion** — transcripts and supporting material update canonical records without replacing them.
- **Workspace explorer** — a local read-only Astro UI for browsing the system of record, driven by the same runtime the CLI uses.
- **Doctor** — validates workspace integrity: prompt links, required files, duplicate IDs, placeholder drift.
- **Local observability** — append-only local telemetry for sessions, turns, tool calls, retries, and report generation for recent runtime performance.

## Workspace Structure

```
entities/
  company/         # shared company context
  people/          # shared people records
  deals/           # deal entities
  product/         # product entities
  tickets/         # ticket entities
  initiatives/     # initiative entities
  systems/         # system entities
  incidents/       # incident entities
entity-defs/
  deal/            # deal scaffold templates
  product/         # product scaffold templates
  ...              # other entity type templates
  renderers/       # custom explorer renderers
skills/            # shared pi skills available to all roles
agents/
  sales/
    role.md        # role contract (manifest)
    AGENTS.md      # prompt index
    agent/         # operating state (record.md, inbox.md)
    prompts/       # role-specific prompts
    skills/        # role-specific pi skills
  engineering/
    role.md
    AGENTS.md
    agent/
    prompts/
    skills/
prompts/           # shared prompt library
explorer/          # read-only Astro workspace UI
```

## How Roles Work

Each role is defined by `agents/<role-id>/role.md`. The manifest declares:

- **Prompt catalog** — maps stable IDs to shared or role-local prompt files
- **Prompt bundles** — ordered sets injected at session startup (`default`, `onboarding`, `transcript-ingest`)
- **Skill directories** — optional shared `skills/` and role-local `agents/<role-id>/skills/` instructions loaded by pi on demand
- **Entity types** — directory layout, ID strategy, fields, required files
- **Templates** — markdown scaffolds in `entity-defs/` with placeholder substitution
- **Capabilities** — optional features like transcript ingestion

The runtime stays generic. Roles define behavior through files, not code changes. Adding a new role:

1. Create `agents/<role-id>/role.md`
2. Add prompt catalog entries and prompt files
3. Add `AGENTS.md`, entity directories under `entities/`, and templates under `entity-defs/`
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

The explorer reuses the same role and entity model as the CLI — no separate domain layer, no data duplication.

For the full design document, see [`docs/architecture.md`](docs/architecture.md). For runtime telemetry, reporting, and storage conventions, see [`docs/observability.md`](docs/observability.md).

## License

MIT
