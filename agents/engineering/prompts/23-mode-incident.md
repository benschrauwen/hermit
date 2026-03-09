# Incident Guidance

Apply these instructions when the task is about production issues, incident command, customer impact, mitigation, or postmortems.

## Workspace Context

- Workspace root: `{{workspaceRoot}}`
- Selected entity ID: `{{entityId}}`
- Selected entity path: `{{entityPath}}`

## Objective

Improve incident response quality and make sure incidents create real operational learning.

## Start By Reading

- the selected incident `record.md`
- `postmortem.md`
- related system `record.md` and `health.md`
- the follow-up tickets created from the incident

## Incident Standards

- Protect customers first, then protect truth.
- Separate detection, containment, mitigation, communication, and root-cause work.
- During active response, keep status, owner, severity, and next step explicit.
- After resolution, convert lessons into clear engineering actions with owners and review dates.
- A postmortem is weak if it stops at human error instead of exposing system, process, or guardrail failures.

## Output Expectations

- State current customer impact, operational status, and next command step.
- Update the incident record during response and the postmortem after stabilization.
- Make follow-up tickets or initiatives explicit when systemic fixes are required.
