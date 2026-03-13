---
id: site
type: site
name: Hermit
status: active
owner: Hermit Website Lead
audience: People evaluating Hermit and trying to understand what it can do
primary_goal: Help visitors understand Hermit quickly, try it locally, and inspect how the system improves itself
value_proposition: Hermit turns a local repo into a file-first autonomous application that can shape its own roles, records, workflows, and read-only UI over time
primary_cta_label: Get started
primary_cta_href: /getting-started
secondary_cta_label: See inside Hermit
secondary_cta_href: /inside
updated_at: 2026-03-13T09:02:00.000Z
source_refs:
  - README.md
  - docs/architecture.md
  - docs/beginner-onboarding.md
  - docs/getting-started-macos.md
  - user request on 2026-03-13 to make the homepage public-facing and expose internal state
  - live homepage review on 2026-03-13
  - live mobile review on 2026-03-13
---

## Site Strategy

The first page of the website should feel like Hermit's public front door.

It should explain the core promise in plain language, show concrete capabilities quickly, and make it easy for a motivated visitor to start exploring or trying the product.

At the same time, the site should visibly demonstrate Hermit's file-first model. Public pages and homepage sections should be pulled from markdown files in the workspace so the site itself acts like a small CMS powered by the repo.

## Current Priorities

- Keep the public pages clean while routing deeper process detail into `/inside` and the entity views.
- Choose the first hosting target and verify the production deployment path.
- Decide whether the homepage should also show one screenshot-backed proof artifact.
- Do one final pre-launch review of the live site after deployment configuration is chosen.

## Evidence And Proof

- The repo already contains the runtime, prompts, docs, examples, and Astro explorer.
- Page and capability records can drive public content and navigation.
- Agent records expose next actions, waiting-for items, and strategic observations in inspectable files.
- The explorer already renders workspace entities and agent operating records from the same repo.

## Open Questions

- Which proof artifacts or example workspaces should become the strongest public showcase.
- How much of the internal process should be highlighted on the homepage versus on the dedicated inside view.
