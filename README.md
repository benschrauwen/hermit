# Leadership Role Agent

Local file-first leadership agent built on [`pi-mono`](https://github.com/badlogic/pi-mono).

## What It Does

- keeps shared company and people knowledge at the workspace root
- runs role-specific leadership agents from `roles/<role-id>/`
- stores role prompts and templates as markdown files inside each role directory
- keeps orchestration generic in TypeScript
- supports conversational onboarding, deterministic record creation, and role-aware validation
- supports evidence-first transcript ingest for roles that declare it

## Workspace Shape

```text
company/
people/
roles/
  sales/
    role.md
    AGENTS.md
    agent/
    prompts/
    templates/
    deals/
    product/
  engineering/
    role.md
    AGENTS.md
    agent/
    prompts/
    templates/
    tickets/
templates/shared/
```

## Quick Start

```bash
bun install
export OPENAI_API_KEY=your_key_here
bun cli chat --role sales
```

## Commands

```bash
bun cli chat --role sales
bun cli chat --role engineering
bun cli ask --role sales "Review the top open deals"
bun cli ingest transcript ./notes/acme-call.md --role sales --entity d-2026-0001-acme-expansion
bun cli doctor --role sales
```

If you run the CLI from inside `roles/<role-id>/`, the role is inferred automatically. If multiple roles exist and none can be inferred, pass `--role`.

For the explorer, use `bun run explorer`; it builds the workspace first automatically.

## Role Contract

Each role is defined by `roles/<role-id>/role.md`.

The manifest declares:

- prompt files, prompt IDs, and a small set of base session bundles
- role-local directories
- entity types, fields, ID strategy, and templates
- optional transcript-ingest capability

Static starter content lives in markdown files under the role's `prompts/` and `templates/` directories. The runtime injects only a small base prompt set at session start, and the agent reads additional prompt files on demand when the task calls for them. TypeScript keeps path resolution, validation, ID generation, and safe writes deterministic.

## Environment

- `OPENAI_API_KEY`: required for agent runs and web search
- `ROLE_AGENT_MODEL`: optional, defaults to `openai/gpt-5.4`
- `ROLE_AGENT_WEB_SEARCH_MODEL`: optional override for the web search tool
- `ROLE_AGENT_THINKING_LEVEL`: optional, defaults to `medium`
- `ROLE_AGENT_ENABLE_COMPUTER_USE=true`: exposes the computer-use boundary tool placeholder
