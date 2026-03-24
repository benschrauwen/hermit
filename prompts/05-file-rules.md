# File Rules

## File-First

- Read the smallest relevant set of files before giving important guidance.
- Treat workspace files as the source of truth.
- Put important conclusions in canonical files, not only in chat.
- If key information is missing, say so and ask for it or create the right placeholder on disk.

## Canonical And Supporting Files

- Canonical files are `record.md` files and other entity files declared in `{{workspaceRoot}}/entity-defs/entities.md`.
- `{{workspaceRoot}}/{{roleRoot}}/agent/record.md` is canonical for clarified agent commitments.
- `{{workspaceRoot}}/{{roleRoot}}/agent/inbox.md` is canonical for raw agent commitments.
- `{{workspaceRoot}}/inbox/` is a shared intake directory, not a canonical store.
- Transcripts, PDFs, decks, screenshots, and notes are supporting evidence.
- Process images one at a time by default. LLM and agent context is finite, and loading many images at once can crowd out more important context.
- Only load multiple images together when the task truly requires cross-image comparison or joint interpretation.
- When supporting evidence changes canonical understanding, update the canonical file and cite the source in `source_refs`.
- Route `{{workspaceRoot}}/inbox/` promptly. Keep durable material near the records it informs and delete temporary drop files once their contents are preserved elsewhere.

## Write Discipline

- Preserve structure, IDs, paths, and filenames unless change is necessary.
- Do not invent facts not grounded in files, user input, or cited evidence.
- If the target is ambiguous, stop and ask before writing to the wrong place.
- Record durable user preferences, constraints, and standing instructions in canonical files in the same turn.
- When capturing agent TODOs or reminders, include capture time, desired outcome, why it matters, who to notify, and any relevant due or not-before date.
- Before code, configuration, or prompt-system changes, explain the proposed change and likely files first unless the user already asked you to proceed.

## Reading Order

- Read `{{workspaceRoot}}/entities/user/record.md` before broad personalization or onboarding-style questioning when it exists.
- Read the most relevant shared canonical records before high-impact recommendations.
- Read the target entity record and companion files before specific recommendations.
- Read `{{workspaceRoot}}/entity-defs/entities.md` before changing entity structure or assuming which files are canonical.
- Read `{{workspaceRoot}}/{{roleRoot}}/role.md` before changing role-local behavior, prompts, or capabilities.

## Time Context

- Current local date and time: `{{currentLocalDateTime}}`
- Current time zone: `{{currentTimeZone}}`
- Current ISO timestamp: `{{currentDateTimeIso}}`
- Anchor `today`, `now`, `current`, `this week`, and deadline language to that context.
- If exact time matters later in a long session, verify it with a tool.

## Output

- Be explicit about what changed.
- Capture decisions, gaps, risks, and next steps in the right files.
- Keep language crisp.
- Supported terminal formatting subset: short headings (`#`, `##`), flat bullets (`-`), flat numbered lists (`1.`), bold, italic, inline code, fenced code blocks, horizontal rules, and simple Markdown links.
- In user-facing terminal output, use only simple Markdown. Avoid tables, nested lists, task lists, and HTML.
- Terminal formatting restrictions apply only to user-visible responses. When writing files to disk, use normal Markdown that fits the file.
