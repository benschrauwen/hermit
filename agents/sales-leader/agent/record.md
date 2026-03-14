---
id: sales-leader-agent
type: agent
name: Sales Leader Agent
status: active
owner: Sales Leader
updated_at: 2026-03-14T10:17:33.000Z
last_strategic_review: 2026-03-14
source_refs:
  - role bootstrap on 2026-03-14
---

## Summary

File-first enterprise sales leadership role for pipeline discipline, deal progression, and revenue accountability.

## Active Projects

### P1: Pipeline demo data quality and realism
- **Goal**: Keep the 5 demo accounts and 8 demo deals realistic enough to showcase Hermit's CRM capabilities on the public website.
- **Next action**: Next date refresh due around April 1 when the new dates start going stale.

## Next Actions

- [x] Update demo deal dates and next steps so the CRM showcase stays fresh (P1). Done: 2026-03-14.
- [ ] Next demo date refresh (P1). Due: 2026-04-01.
- [ ] Add a pipeline review summary or snapshot note to demonstrate what a real sales leader cadence produces (Someday/Maybe candidate).

## Waiting For

- None yet.

## Calendar

- None scheduled.

## Someday Or Maybe

- Generate a sample weekly pipeline review artifact to show what the sales leader role produces in practice.
- Add a second demo scenario (e.g., churned account re-engagement) to broaden the CRM showcase.
- Explore whether deal activity logs or timeline entries would strengthen the demo.

## Strategic Experiments

### EXP-001: Establish baseline role clarity (started 2026-03-14)
- **Evidence**: The sales leader role was bootstrapped on 2026-03-14 alongside demo CRM data (5 accounts, 8 deals). The role's agent record and inbox were empty — no projects, no next actions, no prior review. The role exists primarily to power the `/demo/sales-crm` page on the public Hermit website.
- **Hypothesis**: The sales leader role's main job right now is demo data stewardship, not real pipeline management. If the role treats demo data freshness as its primary responsibility, it will stay useful without inventing fictional sales activity.
- **Test**: Define one active project (demo data quality) and one next action (update stale dates). At the next review, check whether this framing led to concrete, useful updates or felt like busywork.
- **Expected signal**: The next review finds the demo data updated and the CRM page still looking realistic to a visitor.
- **Relevant files**: `entities/accounts/*/record.md`, `entities/deals/*/record.md`, `explorer/src/pages/demo/sales-crm.astro`
- **Result**: Pending — first experiment, no prior result to evaluate.
- **Next decision**: Evaluate at next daily review (2026-03-15).

## Strategic Observations

### 2026-03-14 — First strategic review

**Goal clarity**
- The sales leader role has one clear purpose: serve as a realistic CRM demo for the Hermit website. This is well-aligned with the user's primary goal of showcasing Hermit's capabilities.
- No real pipeline management is happening. The 5 accounts and 8 deals are demo data (all `source_refs` say "demo data").
- Risk: if demo dates go stale, the public CRM page will look abandoned. Several deal next-step dates are March 15-20, which is imminent.

**Effort alignment**
- All meaningful recent work (12+ commits since March 13) has been on the website role: homepage rewrites, FAQ page, CRM demo page, renderers for accounts and deals.
- The sales leader role has had zero autonomous activity since bootstrap. This is expected — it was just created — but the heartbeat should now pick up demo data freshness as unblocked work.
- One closed-lost deal (Atlas Compliance Pilot) and one closed-won deal (Meridian Analytics Add-on) provide good variety in the demo.

**Organizational fitness**
- Two roles exist: `website` (owns the site) and `sales-leader` (owns pipeline/CRM). The split makes sense — the website role handles content and design, the sales leader role owns data quality for the CRM demo.
- Entity definitions for accounts and deals are clean. Custom renderers (`account-detail.mjs`, `deal-detail.mjs`) exist and were recently fixed for formatting.
- No gaps found in the entity model for the current demo scope.

**Process and prompt quality**
- The role's on-demand prompts (`prompts/pipeline-review.md`, `prompts/deal-update.md`) exist but have not been tested in practice. First real use will be the upcoming demo data refresh.
- The inbox/record operating system is functional but untested. This review is the first real exercise.

**Telemetry health**
- Latest telemetry (2026-03-13, website role): 38.8% silent turn rate is high. 13.1% bash error rate is notable. These are from the website role's heavy development sessions, not sales-leader.
- No sales-leader-specific telemetry yet — too new.
- `web_search` p95 at 133s is very slow but was only called 5 times; not a systemic concern.

**Research and skill gaps**
- No skill gaps identified for the current demo data stewardship job.
- If the role ever needs to generate realistic pipeline metrics or forecasts, a calculation or charting skill could help — but this is premature to pursue now.
