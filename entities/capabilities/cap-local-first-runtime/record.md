---
id: cap-local-first-runtime
type: capability
name: Local-first runtime
status: active
owner: Hermit Website Lead
headline: "Hermit runs against your local workspace so the files stay canonical and the tooling remains close to the work"
audience: "Developers who care about control, privacy, and inspectability"
value_summary: "The runtime treats the local repo as the source of truth and prefers file operations, local prompts, and local artifacts over opaque remote state."
proof_points:
  - The agent reads and writes workspace files directly.
  - The runtime is designed to run inside a sandboxed local environment by default.
  - Git history remains the durable change log for system evolution.
updated_at: 2026-03-13T07:53:43.386Z
source_refs:
  - README.md
  - docs/architecture.md
  - bootstrap conversation on 2026-03-13
---

## Summary

Hermit is designed around local control. It uses the repo as the operating environment, which keeps changes visible and keeps the application close to the user.

## Why It Matters

This reduces hidden state and makes it easier to understand what changed, why it changed, and how to evolve the system safely.

## Demo Ideas

- Show a git diff after a role updates canonical records.
- Show sandbox guidance and file-first validation in practice.
