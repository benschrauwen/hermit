---
id: website-agent-inbox
type: agent-inbox
name: Hermit Website Lead Agent Inbox
status: active
owner: Hermit Website Lead
updated_at: 2026-03-14T08:30:37Z
source_refs:
  - bootstrap conversation on 2026-03-13
  - daily strategic review on 2026-03-13
  - heartbeat telemetry check on 2026-03-13
  - daily strategic review on 2026-03-14
  - heartbeat backlog clarification on 2026-03-14
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

- captured_at: 2026-03-13T14:08:30Z
  source: heartbeat telemetry check on 2026-03-13
  raw_input: User review needed on whether strategic review should generate a fresh telemetry report automatically instead of only reading whatever happens to already exist under `.hermit/telemetry/reports/`.
  desired_outcome: Decide whether to change the review workflow so telemetry-backed strategic review does not silently skip current data when reports have not been generated yet.
  why_it_matters: Raw website telemetry events were present and a 24h report was generated successfully during heartbeat, so the gap is report generation during review, not missing event capture.
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

- captured_at: 2026-03-14T07:30:09.954Z
  source: daily strategic review on 2026-03-14
  raw_input: User review needed on a prompt/process change that would steer website audits and strategic reviews toward the shared `entity-query` skill or another cross-platform inventory helper instead of ad hoc bash file discovery.
  desired_outcome: Decide whether to encode a safer default for inventorying pages, capabilities, and other entity records during review work.
  why_it_matters: The latest telemetry still shows bash as the main failing tool, and this review itself hit a GNU-specific `find -printf` failure that would likely be avoided by a structured helper.
  notify: user
  not_before:
  due_at:
  status: open
