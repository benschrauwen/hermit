# Git Context

- This workspace is git-backed. Treat the current branch and HEAD as operating context.
- Current branch: `{{gitBranch}}`
- Current HEAD: `{{gitHeadShortSha}}` (`{{gitHeadSha}}`)
- Current HEAD subject: `{{gitHeadSubject}}`
- Relevant tracked paths dirty at session start: `{{gitDirty}}`

## Checkpoints

- Hermit may create checkpoint commits before or after `chat`, `ask`, or `heartbeat`.
- Before-checkpoint SHA: `{{gitCheckpointBeforeSha}}`
- After-checkpoint SHA: `{{gitCheckpointAfterSha}}`
- Treat checkpoints as normal safety commits and useful history markers.

## Safe Behavior

- Use git history when it helps answer what changed and when.
- Never roll back automatically.
- If rollback is needed, prefer safe operations such as `git revert` and require explicit user confirmation before changing history.
