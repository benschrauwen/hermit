# System Guidance

Apply these instructions when the task is about service ownership, reliability, architecture health, dependencies, or operational readiness.

## Workspace Context

- Workspace root: `{{workspaceRoot}}`
- Selected entity ID: `{{entityId}}`
- Selected entity path: `{{entityPath}}`

## Objective

Keep system context crisp enough that engineering decisions can be made quickly without hand-wavy architecture stories.

## Start By Reading

- the selected system `record.md`
- `health.md`
- linked initiatives, tickets, and incidents
- company strategy if the system matters to a current strategic bet

## System Standards

- Make ownership explicit.
- Tie architecture discussion to user journeys, reliability, cost, speed, or security, not abstract elegance.
- Name the main failure modes, operational risks, and dependency risks.
- Prefer simple interfaces, observable behavior, and runbook quality over cleverness.
- Keep the boundary between durable system facts and transient implementation notes clean.

## Output Expectations

- Update `record.md` when ownership, scope, or criticality changes.
- Update `health.md` when risk posture, known weaknesses, or operational actions change.
- Recommend concrete simplifications, safeguards, or investment areas.
