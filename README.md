# Hermit

<p align="center">
  <img src="public/mascot.png" alt="Hermit" width="200" />
</p>

<p align="center">
  <strong>Local, file-first runtime for autonomous applications.</strong>
</p>

**Hermit** is a local, file-first runtime for autonomous applications. Your workspace *is* the system of record — markdown files you can read, edit, version, and own. Agents run with a built-in GTD loop that captures, clarifies, and autonomously advances work, even when you're not at the keyboard. The runtime monitors its own performance through local telemetry and continuously improves its own prompts, tools, and workflows based on what it learns. No database, no opaque store, no SaaS dependency. Files are the product.

[Architecture](docs/architecture.md) · [Observability](docs/observability.md) · [License](LICENSE)

## Quick Start

```bash
bun install
export OPENAI_API_KEY=your_key_here
bun cli chat
```

Use `bun cli chat` to bootstrap the very first role in an empty workspace. Once roles exist, run `bun cli chat --role <role-id>` from the workspace root, or run the command from inside `agents/<role-id>/` to infer the role from the current directory.

## Commands

```bash
bun cli chat                            # bootstrap the first role when no roles exist
bun cli chat --role <role-id>              # interactive session
bun cli ask --role <role-id> "Review the top open deals"
bun cli heartbeat --role <role-id>         # one autonomous GTD upkeep turn
bun cli heartbeat --role <role-id> --strategic-review  # force a full strategic review
bun cli ingest transcript ./notes/acme-call.md --role <role-id> --entity d-2026-0001-acme-expansion
bun cli doctor --role <role-id>            # validate workspace integrity
bun cli telemetry report --window 7d   # aggregate local runtime telemetry
bun run explorer                       # launch the workspace UI
```

`heartbeat` runs a single background turn for a role, intended for cron-style upkeep. It uses a separate persisted session history under that role so automated runs stay distinct from normal interactive chat history. When `--strategic-review` is passed, or when the last strategic review is more than 24 hours old, the heartbeat runs a full strategic review instead of normal task advancement (see below).

## Why Hermit

- **Fully autonomous** — agents capture work into an inbox, clarify it, and advance the highest-impact next action on their own. A cron-driven `heartbeat` keeps things moving between interactive sessions so nothing stalls.
- **File-first, not file-adjacent** — every piece of state is a markdown file in your workspace. No hidden database, no opaque blob store. You can read, edit, or `grep` anything the system knows.
- **Git-versioned by default** — session commands create checkpoint commits automatically. Your entire operating history is in `git log`, diffable and revertable with standard tools.
- **Self-improving** — the runtime records local telemetry for every session, aggregates it into reports, and uses the evidence to tighten its own prompts, fix fragile tools, and eliminate repeated failures.
- **Strategic reflection** — a daily strategic review steps back from task execution to question whether goals are clear, effort is going to the right places, the organizational structure fits the work, and whether prompts, skills, or processes need to evolve. The review also checks telemetry health and researches better approaches or missing skills. Findings are written to `agent/record.md` and surfaced at the next interactive session.
- **Role-based agents** — each role ships its own prompts, skills, entity types, and operating rules through a declarative `role.md` manifest. Adding a role is a file-creation exercise, not a code change.
- **Reusable skills** — shared and role-local pi skills are auto-discovered and available on demand across sessions.
- **Deterministic scaffolding** — entities, records, and evidence are created through safe, ID-stable operations. No accidental overwrites, no orphaned files.
- **Evidence ingestion** — transcripts, call notes, and supporting material merge into canonical records without replacing them.
- **Workspace explorer** — a local read-only Astro UI for browsing the full system of record, powered by the same runtime the CLI uses.
- **Doctor** — validates workspace integrity end to end: prompt links, required files, duplicate IDs, placeholder drift.
- **100% local** — nothing leaves your machine. No cloud dependency, no vendor lock-in. Bring your own LLM key and run.

## Workspace Structure

```
entities/
  <entity-id>/     # entity data
entity-defs/
  entities.md      # entity schema and explorer config
  <entity-id>/     # entity scaffold templates
  renderers/       # custom explorer renderers
skills/            # shared pi skills available to all roles
agents/
  <role-id>/
    role.md        # role contract (manifest)
    AGENTS.md      # prompt index
    agent/         # operating state (record.md, inbox.md)
    prompts/       # role-specific prompts
    skills/        # role-specific pi skills
prompts/           # shared prompt library
explorer/          # read-only Astro workspace UI
```

## How Roles Work

Each role is defined by `agents/<role-id>/role.md`. The manifest declares:

- **Prompt catalog** — maps stable IDs to shared or role-local prompt files
- **Prompt bundles** — ordered sets injected at session startup (`default`, `onboarding`, `transcript-ingest`)
- **Skill directories** — optional shared `skills/` and role-local `agents/<role-id>/skills/` instructions loaded by pi on demand
- **Capabilities** — optional features like transcript ingestion

Entity schema lives in `entity-defs/entities.md`, and entity starter templates and explorer renderers live under `entity-defs/`. The `agents/` directory is for behavior and agent state, while `entities/` and `entity-defs/` define app state and schema.

The runtime stays generic. Roles define behavior through files, not code changes. Adding a new role:

1. Create `agents/<role-id>/role.md`
2. Add prompt catalog entries and prompt files
3. Add `AGENTS.md` plus any role-local prompts or skills
4. Update `entity-defs/entities.md` and add templates under `entity-defs/` when the role needs new entity types or explorer rendering
5. Run `bun cli doctor --role <role-id>` to validate

## Environment

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Required for agent sessions |
| `ROLE_AGENT_MODEL` | Model override (default: `openai/gpt-5.4`) |
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
