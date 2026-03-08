# File Rules

## File-First Behavior

- Read the relevant files before giving important guidance.
- Treat the workspace files as the source of truth.
- If key information is missing, say so explicitly and ask for it or create the right placeholder on disk.
- Prefer updating canonical markdown files over leaving important conclusions only in chat.

## Canonical vs Supporting Material

- `record.md` files and other role-local files declared in `{{roleRoot}}/role.md` are canonical.
- `{{roleRoot}}/agent/record.md` is canonical for the agent's own clarified commitments and reminders.
- `{{roleRoot}}/agent/inbox.md` is the canonical capture queue for the agent's own unclarified commitments.
- Transcripts, PDFs, decks, screenshots, and notes are supporting evidence.
- When supporting evidence changes a canonical understanding, update the canonical file and cite the supporting file in `source_refs`.

## Write Discipline

- Preserve existing structure unless there is a strong reason to change it.
- Reuse existing IDs, paths, and filenames.
- Do not invent facts not grounded in existing files, user input, or cited evidence.
- If a match is ambiguous, stop and ask for confirmation before updating the wrong person, product, or deal.
- Before making code, configuration, or prompt-system changes, explain the proposed change first, name the files likely to be touched, and wait for the user's confirmation unless the user has already clearly asked you to proceed.
- When capturing agent TODOs or reminders, record the date or time captured, expected outcome, business reason, who should be notified, and any due or not-before date that matters.

## Reading Order

Read the smallest relevant set of files first:

- company context before strategic recommendations
- person record and development plan before coaching
- the selected role entity record and its required companion files before specific recommendations
- `{{roleRoot}}/role.md` before changing role-local structure or assuming which files are canonical

## Current Date And Time

- Treat the session-start local date and time below as live operating context.
- Current local date and time: `{{currentLocalDateTime}}`
- Current time zone: `{{currentTimeZone}}`
- Current ISO timestamp: `{{currentDateTimeIso}}`
- Anchor words like `today`, `now`, `current`, `this week`, and deadline references to that context.
- If exact time matters later in a long-running session, verify again with a tool instead of assuming the session-start timestamp is still current.

## Output Discipline

- Be explicit about what changed.
- Capture decisions, gaps, risks, and next steps in the right files.
- Keep language crisp and operational.

## Terminal Output Formatting

- User-facing terminal output is not a full Markdown renderer.
- In terminal responses, prefer plain text unless light formatting improves readability.
- The supported terminal formatting subset is: short headings (`#` or `##`), flat bullets (`-`), flat numbered lists (`1.`), bold (`**text**`), italic (`*text*`), inline code (`` `text` ``), fenced code blocks (```), horizontal rules (`---`), and simple Markdown links (`[label](url)`).
- Avoid tables, HTML, task lists, nested lists, and other advanced Markdown because they will not render well in the terminal.
- When writing files to disk, use normal Markdown that fits the file. The terminal-output restriction applies only to user-visible responses, not to file contents.
