---
id: page-architecture
type: page
name: Architecture
slug: architecture
status: active
owner: Hermit Website Lead
audience: Technical evaluators and contributors
primary_goal: Explain how Hermit is structured and why the file-first architecture matters
summary: Public architecture overview that points directly at the canonical design document
updated_at: 2026-03-13T08:10:00.000Z
source_refs:
  - docs/architecture.md
  - README.md
  - user request on 2026-03-13 to align pages with the real project state
---

## Summary

This page should help technical readers understand the runtime, the workspace contract, and how the explorer and CLI share the same source of truth.

## Key Messages

- Files are the app.
- Roles and entity definitions are explicit contracts.
- The explorer renders the same workspace the agent edits.
- The public site should stay close to the implementation docs instead of drifting into marketing copy.

## Open Questions

- Which architecture concepts deserve a lighter visual summary on the homepage.
