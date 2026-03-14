---
id: site
type: site
name: Hermit
status: live
owner: Hermit Website Lead
audience: People evaluating Hermit and trying to understand what it can do
primary_goal: Help visitors understand Hermit quickly, try it locally, and inspect how the system improves itself
value_proposition: An AI runtime that builds working apps inside your repo. You describe the job — it creates the roles, data, workflows, and UI. Everything lives in markdown files you can read, edit, and trust.
primary_cta_label: See the sales CRM demo
primary_cta_href: /demo/sales-crm
secondary_cta_label: Get started
secondary_cta_href: /getting-started
updated_at: 2026-03-14T08:38:19.995Z
source_refs:
  - README.md
  - docs/architecture.md
  - docs/beginner-onboarding.md
  - docs/getting-started-macos.md
  - user request on 2026-03-13 to make the homepage public-facing and expose internal state
  - live homepage review on 2026-03-13
  - live mobile review on 2026-03-13
  - .hermit/review/homepage-body-proof.txt
  - user confirmation on 2026-03-14 that the Vercel deployment is live at https://hermit-two.vercel.app/
---

## Site Strategy

The first page of the website should feel like Hermit's public front door.

It should explain the core promise in plain language, show concrete capabilities quickly, and make it easy for a motivated visitor to start exploring or trying the product.

At the same time, the site should visibly demonstrate Hermit's file-first model. Public pages and homepage sections should be pulled from markdown files in the workspace so the site itself acts like a small CMS powered by the repo.

## Current Priorities

- Keep the public pages clean while routing deeper process detail into `/inside` and the entity views.
- Stabilize the live Vercel deployment at https://hermit-two.vercel.app/ and watch for regressions.
- Turn the homepage proof section into a concrete walkthrough of this repo's website bootstrap, based on `.hermit/review/homepage-body-proof.txt`.
- Do post-launch polish and release QA on the live site.

## Evidence And Proof

- The repo already contains the runtime, prompts, docs, examples, and Astro explorer.
- Page and capability records can drive public content and navigation.
- Agent records expose next actions, waiting-for items, and strategic observations in inspectable files.
- The explorer already renders workspace entities and agent operating records from the same repo.
- The first hosted deployment is live on Vercel at https://hermit-two.vercel.app/.
- The first public proof section should walk through this repo's own website bootstrap: the website role under `agents/website/`, the canonical records under `entities/`, and the inspectable `/inside` route.

## Open Questions

- How much of the internal process should be highlighted on the homepage versus on the dedicated inside view.
