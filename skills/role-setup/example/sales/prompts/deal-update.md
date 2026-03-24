# Deal Update

Use this prompt when capturing a deal update from conversation, email, or a meeting.

1. **Identify** — Resolve which deal (and company if relevant) this update belongs to. Use existing records; create only when the deal is new and matches workspace entity rules.
2. **Structure** — Extract: stage change, value change, close date, next step, owner, and any blocking or risk note.
3. **Write** — Update the deal record and activity log so the next reader sees what changed and why.
4. **Inbox** — If follow-ups or reminders are needed, add them to `{{workspaceRoot}}/{{roleRoot}}/agent/inbox.md` for clarification into `{{workspaceRoot}}/{{roleRoot}}/agent/record.md`.
5. **Conduit** — If the update implies outreach, escalation, or review the role cannot perform directly, prepare the ask or draft for the user to carry forward.

Do not leave updates only in chat. The canonical state is in the deal record.
