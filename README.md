# Hermit

<p align="center">
  <img src="public/mascot.png" alt="Hermit" width="400" />
</p>

<p align="center">
  <strong>Local, file-first runtime for autonomous applications that build themselves through interaction.</strong>
</p>

**Hermit** starts as a small local repo and becomes a job-specific application through conversation. You tell the agent what it should own, and it incrementally creates the operating model, markdown-backed datastore, role prompts, automations, and local explorer UI in the same workspace. Code, data, UI, and agent state live in one directory and evolve together in git. The runtime then keeps the application moving: capturing work, clarifying it, advancing next actions, measuring results, and improving its own prompts, tools, and workflows from local telemetry. No database, no opaque memory layer, no SaaS dependency. Files are the app.

[Architecture](docs/architecture.md) · [Observability](docs/observability.md) · [License](LICENSE)

## Get Started

If you want a very beginner-friendly, Mac-only walkthrough, start with [`docs/getting-started-macos.md`](docs/getting-started-macos.md).

Short version on macOS:

Install the tools Hermit needs:

```bash
brew install node git
brew tap always-further/nono
brew install nono
```

Clone Hermit and install its packages:

```bash
gh repo fork benschrauwen/hermit --clone
cd hermit
npm install
```

<details>
<summary>Without GitHub CLI</summary>

1. Fork [benschrauwen/hermit](https://github.com/benschrauwen/hermit) on GitHub
2. `git clone https://github.com/<your-username>/hermit.git`
3. `cd hermit`

</details>

Save your OpenAI key into macOS Keychain so the sandbox can inject it:

```bash
printf 'Paste your OpenAI key, then press Return: '; read -s OPENAI_KEY; echo; security add-generic-password -s "nono" -a "openai_api_key" -w "$OPENAI_KEY" -U; unset OPENAI_KEY
```

Start Hermit in a safe, sandboxed environment:

```bash
npm start
```

In separate Terminal tabs, you will usually also want:

```bash
npm run heartbeat-daemon
npm run explorer
```

By default `npm start` and `npm run heartbeat-daemon` run inside the included `nono` sandbox profile. In an empty workspace, that first session bootstraps the initial role and starts shaping the application around the responsibility you describe.

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

## Commands

### Safe Defaults

```bash
npm start                                         # open the last active role in the sandbox
npm run heartbeat-daemon                          # run heartbeats for all roles every hour in the sandbox
npm run explorer                                  # launch the workspace UI as a normal local server
```

`heartbeat` runs a single background turn for a role. `heartbeat-daemon` is the built-in replacement for an external cron job: it discovers all configured roles, runs one heartbeat turn for each role immediately, then repeats on a fixed interval (default `1h`). Heartbeat runs use a separate persisted session history under each role so automated sessions stay distinct from normal interactive chat history. When `--strategic-review` is passed, or when the last strategic review is more than 24 hours old, the heartbeat runs a full strategic review instead of normal task advancement.

### Advanced Raw Commands

Use these when you explicitly want to bypass the sandbox or call the raw CLI directly.

```bash
npm run start:unsafe                              # open the last active role without the sandbox
npm run heartbeat-daemon:unsafe                   # run the daemon without the sandbox
npm run cli -- chat --role <role-id>              # raw interactive CLI
npm run cli -- ask --role <role-id> "Review the top open deals"
npm run cli -- heartbeat --role <role-id>         # one autonomous GTD upkeep turn
npm run cli -- heartbeat --role <role-id> --strategic-review  # force a full strategic review
npm run cli -- ingest transcript ./notes/acme-call.md --role <role-id> --entity d-2026-0001-acme-expansion
npm run cli -- doctor --role <role-id>            # validate workspace integrity
npm run cli -- telemetry report --window 7d       # aggregate local runtime telemetry
```

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

- **Identity** — `id`, `name`, `description`
- **Extra directories** — optional `role_directories` for role-specific workspace paths
- **Capabilities** — optional features like `transcript_ingest`
- **Skills** — shared `skills/` and role-local `agents/<role-id>/skills/` are discovered by pi on demand

Prompts are loaded from directories, not declared in the manifest. The runtime loads shared prompts from `prompts/`, appends the role's `AGENTS.md`, and appends any session-specific role prompt files (e.g. transcript ingest prompts). Role-local prompts live under `agents/<role-id>/prompts/` and are loaded on demand.

Entity schema lives in `entity-defs/entities.md`, and entity starter templates and explorer renderers live under `entity-defs/`. The `agents/` directory is for behavior and agent state, while `entities/` and `entity-defs/` define app state and schema.

The runtime stays generic. Roles define behavior through files, not code changes. Adding a new role:

1. Create `agents/<role-id>/role.md`
2. Add prompt catalog entries and prompt files
3. Add `AGENTS.md` plus any role-local prompts or skills
4. Update `entity-defs/entities.md` and add templates under `entity-defs/` when the role needs new entity types or explorer rendering
5. Run `npm run cli -- doctor --role <role-id>` to validate

A role can own many responsibilities. Create another role when the work needs a different operating lens: a different operating model, personality, approach, or broad responsibility set that should be judged by a distinct operator. Do not create a new role for every task cluster; split when a new lens would make decisions clearer.

The bootstrap prompt establishes `entities/user/record.md` as the shared user-context record. Sessions read it at startup so durable user preferences and constraints accumulate over time without relying on chat memory.

## Environment

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Used for raw unsandboxed CLI sessions. On macOS, the `:unsafe` commands also fall back to the same Keychain entry that `nono` uses before failing. |
| `ROLE_AGENT_MODEL` | Model override (default: `openai/gpt-5.4`) |
| `ROLE_AGENT_THINKING_LEVEL` | Thinking level (default: `medium`) |

## Sandboxing With `nono`

Hermit runs local agents with read/write access to your workspace, so sandboxing is the default and recommended mode for the agent processes. [`nono`](https://github.com/always-further/nono) adds kernel-enforced filesystem boundaries on macOS and Linux, can inject secrets from the system keychain, and lets you keep Hermit confined to this repo plus the runtime paths it needs. The explorer intentionally runs outside `nono` as a normal local web server.

This repo includes an example profile at `examples/nono/hermit.json`. It grants:

- Read/write access to the current workspace
- Read access to common Git config paths
- OpenAI API access only (`api.openai.com`) - allows websearch through OpenAI API
- `OPENAI_API_KEY` injection from the keychain into the sandboxed process

The default short commands already use this profile:

```bash
npm start
npm run heartbeat-daemon
```

If you want to bypass the sandbox entirely, use the `:unsafe` commands instead:

```bash
npm run start:unsafe
npm run heartbeat-daemon:unsafe
```

Those unsandboxed commands still accept `OPENAI_API_KEY` from your environment, but on macOS they also fall back to the same Keychain item used by `nono` (`service: nono`, `account: openai_api_key`).

### Opening up network access

The default profile only allows traffic to `api.openai.com`. To permit additional hosts, add them to the `proxy_allow` list in `examples/nono/hermit.json`:

```json
"network": {
  "proxy_allow": ["api.openai.com", "api.anthropic.com", "example.com"]
}
```

To go unhinged and allow all outbound traffic for a single run without editing the profile, pass `--network-profile open`:

```bash
nono run --profile ./examples/nono/hermit.json --network-profile open --allow-cwd -- npm run start:unsafe
```

Use `--network-profile developer` as a middle ground that permits package-registry and common dev-tool traffic while still blocking arbitrary hosts. Replace `npm run start:unsafe` with another `:unsafe` command when needed.

For more detail, see the [`nono` installation docs](https://nono.sh/docs/cli/getting_started/installation.md), [profiles docs](https://nono.sh/docs/cli/features/profiles-groups.md), and [credential injection docs](https://nono.sh/docs/cli/features/credential-injection.md).

## Acknowledgements

Hermit builds on top of [pi-mono](https://github.com/always-further/pi-mono) for skill loading and tool orchestration, and [nono](https://github.com/always-further/nono) for kernel-enforced sandboxing. Thanks to both projects for making our lives easy.

## License

MIT
