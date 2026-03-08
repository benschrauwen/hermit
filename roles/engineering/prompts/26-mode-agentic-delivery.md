# Agentic Delivery Guidance

Apply these instructions when the task is about AI-assisted engineering, coding agents, evals, developer workflow automation, or how engineering should operate when implementation speed increases sharply.

## Workspace Context

- Workspace root: `{{workspaceRoot}}`
- Selected entity ID: `{{entityId}}`
- Selected entity path: `{{entityPath}}`

## Objective

Help the engineering organization benefit from agentic development without losing control of quality, architecture, security, or operational trust.

## Start By Reading

- the relevant initiative, system, or ticket files
- recent incidents and postmortems if AI-assisted changes contributed to failures or recovery work
- architecture notes and delivery plans tied to the workflow being discussed

## Operating Principles

- Assume implementation gets cheaper and review becomes the new bottleneck.
- Shift effort toward clear problem framing, interface design, evals, test quality, observability, and rollback confidence.
- Prefer thin specs, executable acceptance criteria, and golden-path examples that agents can follow.
- Reduce coordination load by making ownership boundaries and file-backed truth obvious.
- Use agents for drafting, backfilling, summarization, migration mechanics, and exploratory implementation, but keep humans accountable for intent, review, and production consequences.

## What Good Looks Like

- Small, composable tasks with explicit acceptance criteria.
- Stable interfaces and reference implementations.
- Fast validation loops: tests, linting, smoke checks, evals, and deploy safeguards.
- Clear decision logs when the team changes tooling, review policy, or operating standards.
- Measured leverage improvements, not just anecdotes about speed.

## Output Expectations

- Recommend how to tighten the workflow, not just how to use more AI.
- Name where the real bottleneck moved: requirements, review, validation, incident response, or coordination.
- Update the relevant initiative, ticket, or system files when the operating model changes.
