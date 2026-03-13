---
id: website-agent
type: agent
name: Hermit Website Lead Agent
status: active
owner: Hermit Website Lead
updated_at: 2026-03-13T14:08:30Z
last_strategic_review: 2026-03-13
source_refs:
  - bootstrap conversation on 2026-03-13
  - live homepage review on 2026-03-13
  - live mobile review on 2026-03-13
  - .hermit/review/homepage-body-proof.txt
  - docs/observability.md
  - npm run cli -- doctor --role website on 2026-03-13
  - explorer build validation on 2026-03-13
  - Astro deploy docs and Playwright/Lighthouse guidance reviewed on 2026-03-13
  - .hermit/telemetry/reports/report-24h-2026-03-13-2026-03-13T14-07-38-163Z.md
---

## Summary

Own Hermit's public-facing website as a file-first product surface built on the Astro explorer and shared workspace records.

## Active Projects

- Bootstrap the first public website structure for Hermit.
- Evolve the explorer shell into a clearer hosted site experience.
- Build a reusable capability catalog that can support homepage and future marketing pages.

## Next Actions

- Recommend Vercel as the first hosting target and capture the decision on disk after user confirmation.
- Turn one existing homepage review artifact into the first public proof section instead of treating proof as an open question.
- Do one final pre-launch review of the live site after the hosting target and proof section are locked.

## Waiting For

- User confirmation of the first hosting target for the hosted version.

## Calendar

- None scheduled.

## Someday Or Maybe

- Add public examples or showcase entities once there are stronger proof artifacts.
- Add richer custom renderers for page types with distinct layouts.

## Strategic Observations

### 2026-03-13

- Goal clarity: the website direction is aligned with the user record and site strategy, but the agent-level projects are still framed as broad setup themes rather than a concrete launch milestone. The main planning gap is now the definition of "first hosted release." A workable release bar is visible: homepage, getting-started, architecture, and inside pages live; one inspectable proof artifact linked; and one final live review completed.
- Effort alignment: today's work has been aimed at the right surface, but deployment-target indecision is now the main bottleneck. Git history already shows repeated Vercel-focused fixes, and the explorer build validated successfully in this environment when run with `ASTRO_TELEMETRY_DISABLED=1`, so the records should now either confirm Vercel as the first target or explicitly reject it. The separate question of whether proof exists is stale: `.hermit/review/` already contains screenshot-backed homepage review artifacts, so the next decision is how to productize one, not whether one exists.
- Organizational fitness: one website role is still the right shape, and the current `site`, `page`, and `capability` entities are enough for the first launch. The main structural gap is public proof: review artifacts currently live only in ephemeral `.hermit/review/` files. If proof or showcase material becomes a recurring website pattern, it should move into a dedicated canonical entity or at least a stable record shape. This is a follow-up for user review, not an immediate schema change.
- Process and prompt quality: the operating system is lightweight and healthy, but important review conclusions are not consistently flowing back into canonical records. Browser review artifacts exist, yet the records still frame proof as an unresolved question. A prompt or process change should likely require browser-review outcomes and deployment validation results to update the relevant canonical records and next actions in the same pass. This is a follow-up for user review.
- Telemetry and health: `doctor` passed for role `website`. The explorer build succeeded only after disabling Astro's own telemetry in-process, because the sandboxed environment could not create `~/Library/Preferences/astro`. Hermit's own telemetry capture is working: raw events were present under `.hermit/telemetry/events/2026/03/13/`, and heartbeat generated a fresh 24h website report. The actual gap is workflow coverage: strategic review currently reads existing reports but does not ensure a fresh one exists first, which can leave telemetry health underused.
- Research and skill gaps: current Astro deployment guidance supports using Vercel as a straightforward first hosting path for a static file-backed site, while current QA guidance points toward a lightweight pre-launch workflow using Playwright visual checks plus Lighthouse CI budgets. Hermit already has manual browser-review evidence, but not a durable automated website QA skill or workflow.
- Heartbeat follow-up: the telemetry investigation is now clarified. Raw website telemetry events were already present under `.hermit/telemetry/events/2026/03/13/`; the missing layer was report generation, not event capture. A fresh 24h website report was generated at `.hermit/telemetry/reports/report-24h-2026-03-13-2026-03-13T14-07-38-163Z.md`, showing 7 sessions, 6.5% tool errors, 38.8% silent turns, and bash as the main failing tool. The remaining decision is whether strategic review should generate a fresh report automatically before assessing telemetry health.
