---
id: cap-files-are-the-app
type: capability
name: Files are the app
status: active
owner: Hermit Website Lead
headline: "Hermit keeps prompts, records, workflows, and UI in one repo instead of hiding state behind a separate backend"
audience: "Builders who want inspectable, local-first systems"
value_summary: "The repo is the application: data, behavior, UI, and operating state live together as files with git history."
proof_points:
  - The workspace stores roles, prompts, skills, entities, and agent state directly on disk.
  - Entity definitions and templates declare the schema in markdown under entity-defs/.
  - The Astro explorer renders the same workspace the CLI and agents use.
updated_at: 2026-03-13T07:53:43.386Z
source_refs:
  - README.md
  - docs/architecture.md
  - bootstrap conversation on 2026-03-13
---

## Summary

Hermit is built so the working system stays visible. Instead of splitting prompts, state, UI, and runtime logic across hidden services, it keeps the important pieces together in the repo.

## Why It Matters

That makes the system easier to inspect, version, shape, and extend. It also lets the agent improve the same machinery it operates.

## Demo Ideas

- Show the entity definitions beside the rendered explorer view.
- Show a role prompt change and the resulting behavior change.
