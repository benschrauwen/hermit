---
id: website-agent
type: agent
name: Hermit Website Lead Agent
status: active
owner: Hermit Website Lead
updated_at: 2026-03-14T08:38:19.995Z
last_strategic_review: 2026-03-14
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
  - daily strategic review on 2026-03-14
  - npm run cli -- doctor --role website on 2026-03-14
  - Playwright and Lighthouse CI docs reviewed on 2026-03-14
  - user confirmation on 2026-03-14 that the Vercel deployment is live at https://hermit-two.vercel.app/
---

## Summary

Own Hermit's public-facing website as a file-first product surface built on the Astro explorer and shared workspace records.

## Active Projects

- Stabilize and polish the first hosted Hermit website release now live at https://hermit-two.vercel.app/.
- Evolve the explorer shell into a clearer hosted site experience.
- Keep the capability catalog aligned with real product evidence and homepage copy.

## Next Actions

- Capture the Vercel deployment as the first live release baseline and keep the live URL current in canonical site planning.
- Carry the homepage proof section into the renderer and copy using the repo walkthrough outlined in `.hermit/review/homepage-body-proof.txt`.
- Do a focused post-launch review of the live site for clarity, polish, and regressions.
- Add a small repeatable release QA workflow so future website deploys are easier to verify.

## Waiting For

- None currently.

## Calendar

- None scheduled.

## Someday Or Maybe

- Add public examples or showcase entities once there are stronger proof artifacts.
- Add richer custom renderers for page types with distinct layouts.

## Strategic Observations

### 2026-03-14

- Goal clarity: the direction is still right, but the agent record was carrying broad setup themes longer than it should. The clearest current milestone is now a concrete first hosted release: homepage, getting-started, architecture, and inside pages live; one inspectable proof walkthrough linked from the homepage; and one final live review completed. No important competing goal surfaced, and nothing is yet stale by the 7-day threshold because the role is still new.
- Effort alignment: the highest-leverage work remains deployment choice plus turning the homepage proof section into real public copy and rendering. The main drag is decision debt, not missing material: the site, page, and capability records already support the release, and `.hermit/review/homepage-body-proof.txt` already points to the strongest proof direction. Further broad framing work would now be lower leverage than shipping the first hosted release path.
- Organizational fitness: one website role is still the right shape, and the current `site`, `page`, and `capability` entities are enough for launch. The structural gap remains public proof: the best evidence still lives under `.hermit/review/` rather than in a durable canonical shape. That should stay a user-review follow-up rather than an immediate entity-definition change.
- Process and prompt quality: the operating system is healthy, but two friction patterns remain. First, review evidence and deployment findings still need stronger flow-back into canonical planning records. Second, bash-heavy ad hoc discovery is still brittle in this environment; even this review hit a GNU-specific `find -printf` failure. A process or prompt adjustment should be considered for user review so website audits and strategic reviews prefer the shared `entity-query` skill or another cross-platform inventory helper when listing records.
- Telemetry and health: `npm run cli -- doctor --role website` passed today. The most recent telemetry report on disk still covers the 24h window ending 2026-03-13T14:07:38Z, so trend confidence remains low because there is only one report and it is not freshly generated during this review. Within that report, the main issues are still high silent turns (38.8%), elevated bash failures (21 errors, 13.1% error rate), and long-tail turn latency (49.3s p95, with several turns above 90s). Read, edit, and write look healthy enough; bash remains the main reliability problem and web search is predictably slow but low volume.
- Research and skill gaps: current upstream guidance still supports a lightweight pre-launch QA stack built around `astro build`/`astro preview`, Playwright screenshot assertions for key routes, and Lighthouse CI budgets for regressions. Hermit has manual browser-review evidence already, but it still lacks a durable website-release QA workflow or skill. The strongest near-term improvement is not a new role; it is a repeatable release check that pairs visual diffs with a small performance budget.

### 2026-03-13

- Goal clarity: the website direction is aligned with the user record and site strategy, but the agent-level projects are still framed as broad setup themes rather than a concrete launch milestone. The main planning gap is now the definition of "first hosted release." A workable release bar is visible: homepage, getting-started, architecture, and inside pages live; one inspectable proof artifact linked; and one final live review completed.
- Effort alignment: today's work has been aimed at the right surface, but deployment-target indecision is now the main bottleneck. Git history already shows repeated Vercel-focused fixes, and the explorer build validated successfully in this environment when run with `ASTRO_TELEMETRY_DISABLED=1`, so the records should now either confirm Vercel as the first target or explicitly reject it. The separate question of whether proof exists is stale: `.hermit/review/` already contains screenshot-backed homepage review artifacts, so the next decision is how to productize one, not whether one exists.
- Organizational fitness: one website role is still the right shape, and the current `site`, `page`, and `capability` entities are enough for the first launch. The main structural gap is public proof: review artifacts currently live only in ephemeral `.hermit/review/` files. If proof or showcase material becomes a recurring website pattern, it should move into a dedicated canonical entity or at least a stable record shape. This is a follow-up for user review, not an immediate schema change.
- Process and prompt quality: the operating system is lightweight and healthy, but important review conclusions are not consistently flowing back into canonical records. Browser review artifacts exist, yet the records still frame proof as an unresolved question. A prompt or process change should likely require browser-review outcomes and deployment validation results to update the relevant canonical records and next actions in the same pass. This is a follow-up for user review.
- Telemetry and health: `doctor` passed for role `website`. The explorer build succeeded only after disabling Astro's own telemetry in-process, because the sandboxed environment could not create `~/Library/Preferences/astro`. Hermit's own telemetry capture is working: raw events were present under `.hermit/telemetry/events/2026/03/13/`, and heartbeat generated a fresh 24h website report. The actual gap is workflow coverage: strategic review currently reads existing reports but does not ensure a fresh one exists first, which can leave telemetry health underused.
- Research and skill gaps: current Astro deployment guidance supports using Vercel as a straightforward first hosting path for a static file-backed site, while current QA guidance points toward a lightweight pre-launch workflow using Playwright visual checks plus Lighthouse CI budgets. Hermit already has manual browser-review evidence, but not a durable automated website QA skill or workflow.
- Heartbeat follow-up: the telemetry investigation is now clarified. Raw website telemetry events were already present under `.hermit/telemetry/events/2026/03/13/`; the missing layer was report generation, not event capture. A fresh 24h website report was generated at `.hermit/telemetry/reports/report-24h-2026-03-13-2026-03-13T14-07-38-163Z.md`, showing 7 sessions, 6.5% tool errors, 38.8% silent turns, and bash as the main failing tool. The remaining decision is whether strategic review should generate a fresh report automatically before assessing telemetry health.
