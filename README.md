# Sales Leader Agent

Local file-first sales leadership agent built on [`pi-mono`](https://github.com/badlogic/pi-mono).

## What It Does

- keeps company, people, product, and deal knowledge as files
- uses a simple CLI
- stores reusable AI instructions in `prompts/`
- uses `AGENTS.md` as the central workspace contract and prompt index
- lets one normal agent session route itself across product, people, pipeline, deal, and prompt-maintenance work
- uses conversational onboarding when the workspace is still missing core records
- keeps transcript ingest as a dedicated evidence-first workflow
- includes live web search and image input support when `OPENAI_API_KEY` is set

## Quick Start

```bash
npm install
npm run build
export OPENAI_API_KEY=your_key_here
node ./dist/cli.js chat
```

## Commands

```bash
node ./dist/cli.js chat
node ./dist/cli.js chat --entity p-jane-doe
node ./dist/cli.js ask "Create a tighter discovery guide"
node ./dist/cli.js ingest transcript ./notes/acme-call.md --deal d-2026-0001-acme-expansion
node ./dist/cli.js doctor
```

## Onboarding

- If `company/record.md` and the core entity records do not exist yet, `chat` starts an onboarding conversation automatically.
- The agent asks follow-up questions instead of forcing a large bootstrap form.
- During onboarding, the agent can use `web_search` to help with public company or product context when the user provides enough identifying detail.

## Operating Instructions

- `AGENTS.md` is the root contract.
- `prompts/` contains every reusable instruction file.
- Normal `chat` and `ask` runs start from a default prompt bundle and then read additional prompt files from `prompts/` based on the task.
- Transcript ingest keeps its own dedicated prompt flow because it requires deterministic evidence handling.

## Environment

- `OPENAI_API_KEY`: required for agent runs and web search.
- `SALES_AGENT_MODEL`: optional, defaults to `openai/gpt-5.4`.
- `SALES_AGENT_WEB_SEARCH_MODEL`: optional override for the web search tool.
- `SALES_AGENT_THINKING_LEVEL`: optional, defaults to `medium`.
- `SALES_AGENT_ENABLE_COMPUTER_USE=true`: exposes the computer-use boundary tool placeholder.
