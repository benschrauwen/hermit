# Sales Leader Agent

Local file-first sales leadership agent built on [`pi-mono`](https://github.com/badlogic/pi-mono).

## What It Does

- keeps company, people, product, and deal knowledge as files
- uses a simple CLI
- stores reusable AI instructions in `prompts/`
- uses `AGENTS.md` as the central workspace contract and prompt index
- supports product refinement, people development, pipeline review, deal strategy, and transcript ingest
- includes live web search and image input support when `OPENAI_API_KEY` is set

## Quick Start

```bash
npm install
npm run build
export OPENAI_API_KEY=your_key_here
node ./dist/cli.js bootstrap
```

## Commands

```bash
node ./dist/cli.js bootstrap
node ./dist/cli.js chat --mode pipeline
node ./dist/cli.js chat --mode people --entity p-jane-doe
node ./dist/cli.js ask --mode product "Create a tighter discovery guide"
node ./dist/cli.js ingest transcript ./notes/acme-call.md --deal d-2026-0001-acme-expansion
node ./dist/cli.js doctor
```

## Modes

- `product`
- `people`
- `pipeline`
- `deal`
- `prompt-maintenance`

## Prompt System

- `AGENTS.md` is the root contract.
- `prompts/` contains every reusable instruction file.
- TypeScript selects prompt bundles, but prompt content stays in markdown.

## Environment

- `OPENAI_API_KEY`: required for agent runs and web search.
- `SALES_AGENT_MODEL`: optional, defaults to `openai/gpt-5.4`.
- `SALES_AGENT_WEB_SEARCH_MODEL`: optional override for the web search tool.
- `SALES_AGENT_THINKING_LEVEL`: optional, defaults to `medium`.
- `SALES_AGENT_ENABLE_COMPUTER_USE=true`: exposes the computer-use boundary tool placeholder.
