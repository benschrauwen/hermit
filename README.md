# Hermit

<p align="center">
  <img src="public/mascot.png" alt="Hermit" width="400" />
</p>

<p align="center">
  <strong>Local, file-first runtime for autonomous applications that improve themselves through interaction.</strong>
</p>

**Hermit** starts as a small local repo and becomes a job-specific application through conversation. You tell the agent what it should own, and it incrementally creates the operating model, markdown-backed datastore, role prompts, automations, and local explorer UI in the same workspace. Code, data, UI, and agent state live in one directory and evolve together in git. The runtime then keeps the application moving: capturing work, clarifying it, advancing next actions, measuring results, and improving its own prompts, tools, and workflows from local telemetry. No database, no opaque memory layer, no SaaS dependency. Files are the app.

Hermit's home page at https://hermit-ai.com/ is built and maintained by the hermit that lives in the "website" branch.

Share your own usecase in https://github.com/benschrauwen/hermit/discussions/categories/show-and-tell

[Architecture](docs/architecture.md) · [Observability](docs/observability.md) · [Telegram Setup](docs/telegram-setup.md) · [License](LICENSE)

## Get Started

If you want a very beginner-friendly, Mac-only walkthrough, start with [`docs/getting-started-macos.md`](docs/getting-started-macos.md).

If you want a simple Telegram bridge after setup, read [`docs/telegram-setup.md`](docs/telegram-setup.md).

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

Save one supported provider key into macOS Keychain so Hermit can load it before entering the sandbox.

Examples:

```bash
security add-generic-password -s "nono" -a "openai_api_key" -w "OPENAI_KEY" -U
```

```bash
security add-generic-password -s "nono" -a "anthropic_api_key" -w "ANTHROPIC_KEY" -U
```

```bash
security add-generic-password -s "nono" -a "google_api_key" -w "GOOGLE_KEY" -U
```

Start Hermit in a safe, sandboxed workspace console:

```bash
npm start
```

This single command starts the explorer, launches the heartbeat daemon in the top pane, and opens the interactive chat UI below it.

### Optional: Open The Explorer On Another Device

If you want to open the explorer from another device, install the free [Tailscale](https://tailscale.com/) mesh VPN on both devices and sign in. When Tailscale is available, `npm start` will automatically publish the explorer into your tailnet and show the Tailscale URL in the console.

On first run, Hermit automatically creates `./workspace`, initializes it as its own git repo, writes a workspace `.gitignore`, and scaffolds the directories it needs there.


## How The App Gets Built

- **You define the job in conversation** — start with a role like sales manager, vineyard operator, or household manager, and Hermit begins shaping the application around that responsibility.
- **The role owns the function, you manage the role** — Hermit should run the job proactively inside its authority, while you set direction, review important decisions, and provide approval or real-world follow-through when needed.
- **Hermit creates the operating model** — it establishes roles, prompts, workflows, and review loops for the work instead of assuming a fixed SaaS schema.
- **Hermit writes the data layer as files** — entities, records, and supporting evidence live as markdown under `workspace/entities/` and `workspace/entity-defs/`.
- **Hermit owns the app surface too** — the runtime repo and workspace repo stay close enough that the agent can extend the system it operates without hiding state in a separate service.
- **Every turn updates versioned app state** — session commands create git checkpoints, so the full application remains inspectable, diffable, and reversible.

## Recommended Git Workflow

Hermit uses two repos by default:

- the **framework repo** is the Hermit checkout itself
- the **workspace repo** is `./workspace`, created automatically on first start

That keeps `workspace/entities/`, `workspace/agents/`, `workspace/entity-defs/`, local `workspace/skills/`, and `workspace/.hermit/` state versioned without mixing them into framework pull requests. The framework repo ignores `./workspace/`, so user data does not get swept into framework changes.

Hermit includes a built-in `framework-maintenance` skill with the full git and `gh` workflow for reviewing framework status, opening PRs, and pulling upstream changes. For app-state snapshots, branch inside `./workspace`.

## Commands

### Safe Defaults

```bash
npm start                                         # start explorer, heartbeat daemon, and chat in one sandboxed TUI
npm run explorer                                  # launch only the workspace UI server
```

Background heartbeats now run only inside `npm start`. Hermit keeps separate persisted heartbeat histories so those autonomous turns stay distinct from interactive chat history, and each delegated heartbeat still checkpoints git independently. When a strategic review is due, the background loop runs that review instead of a normal upkeep turn. Hermit keeps its own strategic-review state under `.hermit/agent/record.md`.

### Advanced Raw Commands

Use these when you explicitly want to bypass the sandbox or call the raw CLI directly.

```bash
npm run start:unsafe                              # start explorer, heartbeat daemon, and chat without the sandbox
npm run cli -- start --role <role-id>             # raw combined CLI
npm run cli -- ask --role <role-id> "Review the top open deals"
npm run cli -- doctor --role <role-id>            # validate workspace integrity
npm run cli -- doctor --role <role-id> --context  # print rendered prompt source breakdown
npm run cli -- telemetry report --window 7d       # aggregate local runtime telemetry
```

## Why It Feels Different

- **The application is built, not pre-modeled** — you start with a runtime and a goal; Hermit creates the roles, schema, files, and workflows that fit the job.
- **Single checkout startup** — one `npm start` command from the Hermit checkout creates the nested workspace repo automatically and gets the system running.
- **Autonomy with structure** — roles capture work, clarify it, and advance next actions through the background heartbeat loop inside `npm start`, while strategic review regularly questions goals, structure, and process.
- **File-first system of record** — durable state lives in readable markdown, not behind an ORM or opaque store.
- **Git-native history** — session commands create checkpoint commits, so the entire application state sits in normal git history.
- **Self-improving runtime** — local telemetry, reports, prompts, and skills let Hermit tighten its own workflows based on evidence.
- **Extensible by files first** — new roles, skills, prompts, entity definitions, and explorer renderers are mostly file additions instead of framework surgery.
- **Local by default** — bring your own model key and keep the whole system on your machine.

## Workspace Structure

Hermit starts from the framework checkout and creates a nested workspace repo at `./workspace`. The workspace contains the application state:

```text
workspace/
  inbox/             # shared drop zone for uncategorized incoming user files
  entities/
    <entity-id>/     # entity data
  entity-defs/
    entities.md      # entity schema and explorer config
    <entity-id>/     # entity scaffold templates
    renderers/       # custom explorer renderers
  skills/            # shared workspace skills available to all roles
  agents/
    <role-id>/
      role.md        # role contract (manifest)
      AGENTS.md      # prompt index
      agent/         # operating state (record.md, inbox.md)
      prompts/       # role-specific prompts
      skills/        # role-specific pi skills
  prompts/           # shared workspace prompt overrides
```

## How Roles Work

Roles are how Hermit turns a broad job into an operator inside the app. Each role is defined by `agents/<role-id>/role.md`. The manifest declares:

- **Identity** — `id`, `name`, `description`
- **Extra directories** — optional `role_directories` for role-specific workspace paths
- **Skills** — shared `skills/` and role-local `agents/<role-id>/skills/` are discovered by pi on demand

Prompts are loaded from directories, not declared in the manifest. The runtime loads shared prompts from `prompts/`, appends the role's `AGENTS.md`, and uses role-local prompts under `agents/<role-id>/prompts/` on demand.

Entity schema lives in `workspace/entity-defs/entities.md`, and entity starter templates and explorer renderers live under `workspace/entity-defs/`. The `workspace/agents/` directory is for behavior and agent state, while `workspace/entities/` and `workspace/entity-defs/` define app state and schema.

The shared `workspace/inbox/` directory is the default intake area for uncategorized incoming files. Agents should process files dropped there, route durable material into the right role or entity directories, and remove temporary drop files once their contents are preserved elsewhere.

The runtime stays generic. Roles define behavior through files, not code changes. Adding a new role:

1. Create `agents/<role-id>/role.md`
2. Add prompt catalog entries and prompt files
3. Add `AGENTS.md` plus any role-local prompts or skills
4. Update `workspace/entity-defs/entities.md` and add templates under `workspace/entity-defs/` when the role needs new entity types or explorer rendering
5. Run `npm run cli -- doctor --role <role-id>` to validate

A role can own many responsibilities. Create another role when the work needs a different operating lens: a different operating model, personality, approach, or broad responsibility set that should be judged by a distinct operator. Do not create a new role for every task cluster; split when a new lens would make decisions clearer.

The bootstrap prompt establishes `entities/user/record.md` as the shared user-context record. Sessions read it at startup so durable user preferences and constraints accumulate over time without relying on chat memory.

## Environment

| Variable | Description |
|---|---|
| `ROLE_AGENT_MODEL` | Optional model override. If unset, Hermit auto-selects the best available configured model. |
| `ROLE_AGENT_FALLBACK_MODELS` | Optional comma-separated fallback models in preference order when `ROLE_AGENT_MODEL` is pinned. |
| `ROLE_AGENT_THINKING_LEVEL` | Thinking level (default: `medium`) |

Common provider API key env vars and matching macOS Keychain accounts:

- `OPENAI_API_KEY` / `openai_api_key`
- `ANTHROPIC_API_KEY` / `anthropic_api_key`
- `GEMINI_API_KEY` / `gemini_api_key` for Google Gemini
- `GOOGLE_API_KEY` / `google_api_key` as a compatible alias for Google Gemini
- `OPENROUTER_API_KEY` / `openrouter_api_key`
- `GROQ_API_KEY` / `groq_api_key`
- `XAI_API_KEY` / `xai_api_key`
- `MISTRAL_API_KEY` / `mistral_api_key`
- `CEREBRAS_API_KEY` / `cerebras_api_key`

You only need one supported provider key to get started. Hermit will auto-pick the best model it can use from the keys it finds. `web_search` currently supports OpenAI and Anthropic credentials.

Optional Telegram bridge env vars:

- `HERMIT_TELEGRAM_BOT_TOKEN` or `TELEGRAM_BOT_TOKEN`
- `HERMIT_TELEGRAM_CHAT_ID`

When both Telegram settings are present, the combined `npm start` flow long-polls that one Telegram chat, queues inbound Telegram messages into the main chat thread, and exposes a `send_telegram_message` tool so the agent can reply back into Telegram. See [`docs/telegram-setup.md`](docs/telegram-setup.md) for the novice setup walkthrough.

## Sandboxing With `nono`

Hermit runs local agents with read/write access to your workspace, so sandboxing is the default and recommended mode for the agent processes. [`nono`](https://github.com/always-further/nono) adds kernel-enforced filesystem boundaries on macOS and Linux, can inject secrets from the system keychain, and lets you keep Hermit confined to this repo plus the runtime paths it needs. The default `npm start` flow keeps the explorer, heartbeat daemon, and chat together inside the same sandboxed session.

This repo includes its default `nono` profile at `nono/hermit.json`. It grants:

- Read/write access to the current workspace
- Read access to common Git config paths
- Network access to a small built-in set of common model providers plus the existing skill hosts
- Telegram Bot API access at `api.telegram.org`
- No required secret list. The startup wrapper loads whichever supported provider keys it finds in your environment or macOS Keychain before entering the sandbox.

The default short commands already use this profile:

```bash
npm start
npm run explorer
```

If you want to bypass the sandbox entirely, use the `:unsafe` commands instead:

```bash
npm run start:unsafe
```

Those commands accept supported provider API key env vars from your environment. On macOS they also look in the same `nono` Keychain service for the common provider account names listed above.

### Opening up network access

The default profile already includes a small set of common provider hosts. To permit additional hosts, add them to the `proxy_allow` list in `nono/hermit.json`:

```json
"network": {
  "proxy_allow": ["api.openai.com", "api.anthropic.com", "example.com"]
}
```

To go unhinged and allow all outbound traffic for a single run without editing the profile, pass `--network-profile open`:

```bash
nono run --profile ./nono/hermit.json --network-profile open --allow-cwd -- npm run start:unsafe
```

Use `--network-profile developer` as a middle ground that permits package-registry and common dev-tool traffic while still blocking arbitrary hosts. Replace `npm run start:unsafe` with another `:unsafe` command when needed.

For more detail, see the [`nono` installation docs](https://nono.sh/docs/cli/getting_started/installation.md), [profiles docs](https://nono.sh/docs/cli/features/profiles-groups.md), and [credential injection docs](https://nono.sh/docs/cli/features/credential-injection.md).

## FAQ

### Isn't this dangerous? I hear horror stories from OpenClaw.

By default, Hermit runs in a tightly locked-down sandbox. The agent gets very limited network access, can only read and write inside its own workspace directory, and only receives the credentials you explicitly choose to expose through the sandbox profile. Out of the box, the default setup is intentionally narrow: enough freedom to work on the repo, not enough freedom to roam around your machine or call arbitrary services.

That means the starting posture is not "trust the agent with your laptop." It is closer to "let the agent operate inside a small box." If you want Hermit to do more, such as reach additional APIs, use advanced skills, or integrate with external systems, you open that up deliberately. You can expand network policy, switch to the unsafe commands, or add integrations, but those are conscious choices under your control rather than ambient default power.

The model is progressive capability. Start with a bolted-down local runtime, then selectively open things up as the use case justifies it. So yes, autonomous software always deserves respect, but Hermit is designed so there is very little to worry about at the beginning and a clear boundary around what the agent can touch.

### Why is this not just built on OpenClaw?

OpenClaw is amazing, but Hermit is aiming at a narrower and more opinionated shape: a minimal, self-contained repo where the agent can improve the whole system from inside the system. The runtime, prompts, skills, datastore, explorer UI, and agent operating state all live together in one workspace so the agent is not merely using the app, it can also inspect and evolve the machinery that runs it.

That constraint is intentional. Hermit is trying to stay small enough that you can understand the whole stack, fork it, and let it co-evolve with a specific job. The point is not to out-feature a larger agent platform; it is to make a compact, hackable substrate where self-modification is a first-class property instead of an integration story.

### Why not call an external coding-agent framework like Cursor or Claude Code?

Because the thesis here is stronger than "an agent can invoke coding tools." Hermit is an attempt to show that one local agent runtime can own the full loop itself: conversation, durable state, workflow execution, telemetry, review cadence, and code or prompt changes when needed.

External coding agents can absolutely be useful, but once the core intelligence of the system lives outside the repo, the application stops being fully self-describing. Hermit is trying to prove the opposite model: the same framework that runs the operator should also be able to inspect its evidence, judge its performance, and improve its own harness without handing that responsibility off to a second, more privileged system.

### What do you mean by "self-improve"?

In Hermit, "self-improve" means the runtime has built-in feedback loops for making the harness itself better over time. It records local telemetry for llm/tool calls, can aggregate that telemetry into reports, and runs recurring heartbeat turns that do more than advance tasks: they also perform strategic review on a roughly daily cadence to question whether the prompts, workflows, role setup, and operating structure are still serving the work well.

So self-improvement here is practical and observable. Hermit can notice friction, review the evidence from its own runs, and then tighten prompts, skills, role definitions, or process structure in the framework repo while keeping user state in the workspace repo. The goal is a system that gets better at operating by editing its own harness based on local evidence, not a black-box agent that claims to learn without leaving artifacts behind.

### If it edits files in the background, how do I stay in control?

It would be dangerous if those edits were opaque or hard to unwind. Hermit's answer is to keep the whole system inside normal Git workflows. The app state lives in the workspace repo, the runtime lives in the framework repo, and session activity is checkpointed into versioned history instead of disappearing into a hidden store.

That means you can treat the agent like a very active collaborator rather than an untouchable automaton. You can ask what changed, inspect diffs, review the latest commits, ask it to explain why a file was edited, or tell it to revert something you do not like. Because the artifacts are just files in Git, recovery is not a special feature bolted onto the side; it is the default operating model.

This does not remove all risk, but it makes the risk legible. Hermit is intentionally designed so that autonomous behavior stays inspectable, diffable, and reversible by the user.

## Acknowledgements

Hermit builds on top of [pi-mono](https://github.com/always-further/pi-mono) for skill loading and tool orchestration, and [nono](https://github.com/always-further/nono) for kernel-enforced sandboxing. Thanks to both projects for making our lives easy, and to [karpathy/autoresearch](https://github.com/karpathy/autoresearch) and [openclaw](https://github.com/openclaw/openclaw) for showing the way.

## License

MIT
