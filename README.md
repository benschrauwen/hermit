# Hermit

<p align="center">
  <img src="public/mascot.png" alt="Hermit" width="300" />
</p>

<p align="center">
  <strong>Local, file-first runtime for autonomous applications that build themselves through interaction.</strong>
</p>

**Hermit** starts as a small local repo and becomes a job-specific application through conversation. You tell the agent what it should own, and it incrementally creates the operating model, markdown-backed datastore, role prompts, automations, and local explorer UI in the same workspace. Code, data, UI, and agent state live in one directory and evolve together in git. The runtime then keeps the application moving: capturing work, clarifying it, advancing next actions, measuring results, and improving its own prompts, tools, and workflows from local telemetry. No database, no opaque memory layer, no SaaS dependency. Files are the app.

[Architecture](docs/architecture.md) · [Observability](docs/observability.md) · [License](LICENSE)

## Quick Start

```bash
bun install
export OPENAI_API_KEY=your_key_here
bun cli chat
```

Use `bun cli chat` to open the interactive chat. By default it resumes the last active chat role, and falls back to `Hermit` when there is no last role yet. In an empty workspace, that first `Hermit` session bootstraps the initial role and starts shaping the application around the responsibility you describe. From there, you can keep talking to the same role, run `bun cli chat --role <role-id>` from the workspace root, or run the command from inside `agents/<role-id>/` to infer the role from the current directory.

If you want Hermit isolated to this repository and its runtime paths, see `Optional: Sandbox Hermit with nono` below.

## How The App Gets Built

- **You define the job in conversation** — start with a role like sales manager, vineyard operator, or household manager, and Hermit begins shaping the application around that responsibility.
- **Hermit creates the operating model** — it establishes roles, prompts, workflows, and review loops for the work instead of assuming a fixed SaaS schema.
- **Hermit writes the data layer as files** — entities, records, and supporting evidence live as markdown under `entities/` and `entity-defs/`.
- **Hermit owns the app surface too** — the runtime, prompts, skills, and explorer UI all live in the same repo, so the agent can extend the system it operates.
- **Every turn updates versioned app state** — session commands create git checkpoints, so the full application remains inspectable, diffable, and reversible.

## Recommended Git Workflow

Because Hermit stores app state directly in files, it's best to start from a fresh branch off `main` before using it for a specific app or operating context. That keeps the evolving state in normal git history, separate from the runtime's own source changes.

Create a fresh branch from `main`:

```bash
git checkout main
git pull
git checkout -b my-app-state
```

You can keep multiple app states in parallel by using separate branches, for example `sales-state`, `ops-state`, or `customer-a-state`. Each branch becomes an isolated snapshot and timeline of that app's files, prompts, entities, and role state.

When `main` gets updates, switch to each app-state branch and rebase or merge the latest `main` into it:

```bash
git checkout main
git pull
git checkout my-app-state
git rebase main
```

If you prefer merge commits instead of rebasing:

```bash
git checkout main
git pull
git checkout my-app-state
git merge main
```

Repeat that for any other app-state branches you maintain. This keeps each tracked Hermit workspace state current with the latest runtime, prompts, and tooling changes from `main`.

## Commands

```bash
bun cli chat                                # open the last active role, or Hermit if none is stored yet
bun cli chat --role <role-id>              # interactive session
bun cli ask --role <role-id> "Review the top open deals"
bun cli heartbeat --role <role-id>         # one autonomous GTD upkeep turn
bun cli heartbeat-daemon                   # run heartbeats for all roles every hour until stopped
bun cli heartbeat --role <role-id> --strategic-review  # force a full strategic review
bun cli ingest transcript ./notes/acme-call.md --role <role-id> --entity d-2026-0001-acme-expansion
bun cli doctor --role <role-id>            # validate workspace integrity
bun cli telemetry report --window 7d   # aggregate local runtime telemetry
bun run explorer                       # launch the workspace UI
```

`heartbeat` runs a single background turn for a role. `heartbeat-daemon` is the built-in replacement for an external cron job: it discovers all configured roles, runs one heartbeat turn for each role immediately, then repeats on a fixed interval (default `1h`). Heartbeat runs use a separate persisted session history under each role so automated sessions stay distinct from normal interactive chat history. When `--strategic-review` is passed, or when the last strategic review is more than 24 hours old, the heartbeat runs a full strategic review instead of normal task advancement (see below).

## Why It Feels Different

- **The application is built, not pre-modeled** — you start with a runtime and a goal; Hermit creates the roles, schema, files, and workflows that fit the job.
- **Single-directory architecture** — code, prompts, data, UI, and agent operating state live in one repo instead of being split across app code, a hidden memory layer, and an external database.
- **Autonomy with structure** — roles capture work, clarify it, and advance next actions through `heartbeat` and `heartbeat-daemon`, while strategic review regularly questions goals, structure, and process.
- **File-first system of record** — durable state lives in readable markdown, not behind an ORM or opaque store.
- **Git-native history** — session commands create checkpoint commits, so the entire application state sits in normal git history.
- **Self-improving runtime** — local telemetry, reports, prompts, and skills let Hermit tighten its own workflows based on evidence.
- **Extensible by files first** — new roles, skills, prompts, entity definitions, and explorer renderers are mostly file additions instead of framework surgery.
- **Local by default** — bring your own model key and keep the whole system on your machine.

## Workspace Structure

A Hermit app is a normal repository. These directories are the application:

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

Roles are how Hermit turns a broad job into an operator inside the app. Each role is defined by `agents/<role-id>/role.md`. The manifest declares:

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

A role can own many responsibilities. Create another role when the work needs a different operating lens: a different operating model, personality, approach, or broad responsibility set that should be judged by a distinct operator. Do not create a new role for every task cluster; split when a new lens would make decisions clearer.

Hermit also treats `entities/user/record.md` as the default shared user-context record. Bootstrap should create it early, and normal sessions should read it at startup so durable user preferences and constraints accumulate over time without relying on chat memory.

## Environment

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Required for agent sessions. If you use `nono`, prefer storing it in the system keychain and injecting it into the sandbox from there. |
| `ROLE_AGENT_MODEL` | Model override (default: `openai/gpt-5.4`) |
| `ROLE_AGENT_THINKING_LEVEL` | Thinking level (default: `medium`) |
| `ROLE_AGENT_ENABLE_COMPUTER_USE` | Set `true` to expose computer-use boundary tool |

## Optional: Sandbox Hermit with `nono`

Hermit runs local agents with read/write access to your workspace, so sandboxing it is optional but strongly advised. [`nono`](https://github.com/always-further/nono) adds kernel-enforced filesystem boundaries on macOS and Linux, can inject secrets from the system keychain, and lets you keep Hermit confined to this repo plus the runtime paths it needs.

Install `nono`:

```bash
brew tap always-further/nono
brew install nono
```

Store your OpenAI key in the system keychain once:

```bash
security add-generic-password -s "nono" -a "openai_api_key" -w "sk-..." -U
```

This repo includes an example profile at `examples/nono/hermit.json`. It grants:

- Read/write access to the current workspace
- Read access to Bun and common Git config paths
- OpenAI API access only (`api.openai.com`)
- `OPENAI_API_KEY` injection from the keychain into the sandboxed process

### Recommended on macOS

On macOS, `nono` uses Seatbelt sandboxing and current Bun releases can fail inside that sandbox with `CouldntReadCurrentDirectory`. The reliable flow is:

```bash
bun run build
nono run --profile ./examples/nono/hermit.json --allow-cwd -- node dist/cli.js chat --role <role-id>
```

Use the same pattern for other commands:

```bash
nono run --profile ./examples/nono/hermit.json --allow-cwd -- node dist/cli.js ask --role <role-id> "Review the top open deals"
nono run --profile ./examples/nono/hermit.json --allow-cwd -- node dist/cli.js heartbeat --role <role-id>
```

### Linux or environments where `bun` works inside `nono`

If `bun` runs correctly under `nono` on your machine, you can invoke the Bun entrypoint directly:

```bash
nono run --profile ./examples/nono/hermit.json --allow-cwd -- bun cli chat --role <role-id>
```

### Installing dependencies

For the initial dependency install, either run `bun install` outside the sandbox once or temporarily widen Bun's cache access and network policy:

```bash
nono run --profile ./examples/nono/hermit.json --network-profile developer --allow-cwd --allow ~/.bun -- bun install
```

If your Bun binary, Git config, or other tooling lives in non-standard locations, extend `examples/nono/hermit.json` or add extra `--read`, `--read-file`, or `--allow` flags for those paths.

For more detail, see the [`nono` installation docs](https://nono.sh/docs/cli/getting_started/installation.md), [profiles docs](https://nono.sh/docs/cli/features/profiles-groups.md), and [credential injection docs](https://nono.sh/docs/cli/features/credential-injection.md).

## Architecture

Hermit separates **deterministic orchestration** (TypeScript) from **operating context** (markdown):

- TypeScript owns CLI routing, role resolution, safe writes, ID generation, validation, tool wiring, and session management.
- Markdown owns business state, prompts, templates, and role contracts.

The explorer reuses the same role and entity model as the CLI — no separate domain layer, no data duplication.

For the full design document, see [`docs/architecture.md`](docs/architecture.md). For runtime telemetry, reporting, and storage conventions, see [`docs/observability.md`](docs/observability.md).

## License

MIT
