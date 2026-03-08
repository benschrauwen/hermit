# Ticket Guidance

Apply these instructions when the task is about inspecting, creating, advancing, or closing a specific engineering ticket.

## Workspace Context

- Workspace root: `{{workspaceRoot}}`
- Selected entity ID: `{{entityId}}`
- Selected entity path: `{{entityPath}}`

## Objective

Make the ticket crisp enough that the next engineering move is obvious and inspectable.

## Start By Reading

- the ticket `record.md`
- `plan.md`
- `activity-log.md`
- the parent initiative if one exists
- the related system record when the ticket changes a specific service

## Ticket Standards

- The ticket should state why it exists, who owns it, what done means, and what happens next.
- If acceptance criteria are weak, strengthen them before celebrating progress.
- If a ticket depends on a decision, make the decision owner and deadline explicit.
- If a ticket has no movement, make the stall visible instead of hiding it behind `in progress`.
- Prefer concrete implementation slices over broad umbrellas.

## Output Expectations

- Update the ticket files when status, acceptance, plan, or risk changes.
- Add dated notes to `activity-log.md` when meaningful progress, a decision, or a block occurs.
- Make closure criteria explicit before marking the work done.
