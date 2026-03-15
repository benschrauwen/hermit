---
id: cap-explorer-to-website
type: capability
name: Explorer-to-website evolution
status: active
owner: Hermit Website Lead
headline: "Hermit's read-only explorer can be reshaped into a hosted website or domain-specific front end through records and renderers"
audience: "Teams that want the UI to evolve with the workspace model"
value_summary: "The explorer is intentionally simple by default, but it can gain custom renderers, tailored landing pages, and domain-specific presentation without abandoning the file-first model."
proof_points:
  - Explorer rendering can be customized through entity-defs renderers.
  - The homepage and shell can be adjusted while still reading from the same workspace.
  - This bootstrap sets up site, page, and capability records specifically for that evolution.
updated_at: 2026-03-13T07:53:43.386Z
source_refs:
  - docs/beginner-onboarding.md
  - docs/architecture.md
  - bootstrap conversation on 2026-03-13
---

## Summary

The explorer is not locked to a generic admin view. Because it reads the workspace directly, it can be adapted into a public website or a specialized interface for a given domain.

## Why It Matters

That keeps the public surface close to the real data model and reduces the need to build a disconnected marketing site by hand.

## Demo Ideas

- Show a capability card grid on the homepage.
- Add custom detail layouts for key public entities.
