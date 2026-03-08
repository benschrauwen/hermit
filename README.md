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
npm install
npm run build
export OPENAI_API_KEY=your_key_here
node ./dist/cli.js chat --role sales
```

## Commands

```bash
node ./dist/cli.js chat --role sales
node ./dist/cli.js chat --role engineering
node ./dist/cli.js ask --role sales "Review the top open deals"
node ./dist/cli.js ingest transcript ./notes/acme-call.md --role sales --entity d-2026-0001-acme-expansion
node ./dist/cli.js doctor --role sales
```

If you run the CLI from inside `roles/<role-id>/`, the role is inferred automatically. If multiple roles exist and none can be inferred, pass `--role`.

## Role Contract

Each role is defined by `roles/<role-id>/role.md`.

The manifest declares:

- prompt files and prompt bundles
- role-local directories
- entity types, fields, ID strategy, and templates
- optional transcript-ingest capability

Static starter content lives in markdown files under the role's `prompts/` and `templates/` directories. TypeScript keeps path resolution, validation, ID generation, and safe writes deterministic.

## Environment

- `OPENAI_API_KEY`: required for agent runs and web search
- `ROLE_AGENT_MODEL`: optional, defaults to `openai/gpt-5.4`
- `ROLE_AGENT_WEB_SEARCH_MODEL`: optional override for the web search tool
- `ROLE_AGENT_THINKING_LEVEL`: optional, defaults to `medium`
- `ROLE_AGENT_ENABLE_COMPUTER_USE=true`: exposes the computer-use boundary tool placeholder
