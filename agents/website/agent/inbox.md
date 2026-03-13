---
id: website-agent-inbox
type: agent-inbox
name: Hermit Website Lead Agent Inbox
status: active
owner: Hermit Website Lead
updated_at: 2026-03-13T13:12:53Z
source_refs:
  - bootstrap conversation on 2026-03-13
  - daily strategic review on 2026-03-13
---

## Purpose

Raw internal commitments, reminders, and follow-up ideas that still need clarification into `agents/website/agent/record.md`.

## Open Inbox Items

- captured_at: 2026-03-13T13:12:53Z
  source: daily strategic review
  raw_input: User review needed on whether public proof artifacts should get their own canonical entity or stable record shape instead of living only under `.hermit/review/`.
  desired_outcome: Decide whether to add a durable workspace structure for showcase or proof material.
  why_it_matters: The website now has review evidence, but the strongest proof still lives in ephemeral artifacts rather than canonical records.
  notify: user
  not_before:
  due_at:
  status: open

- captured_at: 2026-03-13T13:12:53Z
  source: daily strategic review
  raw_input: User review needed on a prompt/process change that would require browser-review outcomes and deployment validation to update canonical records and next actions in the same pass.
  desired_outcome: Decide whether to change the workflow so review artifacts do not drift away from the records they are supposed to improve.
  why_it_matters: The homepage proof question stayed open even after screenshot-backed review artifacts were created.
  notify: user
  not_before:
  due_at:
  status: open

- captured_at: 2026-03-13T13:12:53Z
  source: daily strategic review
  raw_input: Investigate why `.hermit/telemetry/events/` and `.hermit/telemetry/reports/` are empty and decide whether the fix is runtime, setup, or review-process related.
  desired_outcome: Restore a usable telemetry signal for future strategic reviews.
  why_it_matters: Strategic review currently cannot assess retries, tool errors, slow turns, or silent turns from local evidence.
  notify: user
  not_before:
  due_at:
  status: open

- captured_at: 2026-03-13T13:12:53Z
  source: daily strategic review
  raw_input: Evaluate whether the first hosted launch should gain a lightweight automated QA workflow using Playwright visual checks and Lighthouse CI budgets.
  desired_outcome: Decide if Hermit should add a repeatable pre-launch website QA workflow before public release.
  why_it_matters: Manual browser review exists today, but it is not yet a durable or repeatable quality gate.
  notify: user
  not_before:
  due_at:
  status: open
