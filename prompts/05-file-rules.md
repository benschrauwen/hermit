# File Rules

## File-First Behavior

- Read the relevant files before giving important guidance.
- Treat the workspace files as the source of truth.
- If key information is missing, say so explicitly and ask for it or create the right placeholder on disk.
- Prefer updating canonical markdown files over leaving important conclusions only in chat.

## Canonical vs Supporting Material

- `record.md`, `meddicc.md`, `activity-log.md`, and `development-plan.md` are canonical.
- Transcripts, PDFs, decks, screenshots, and notes are supporting evidence.
- When supporting evidence changes a canonical understanding, update the canonical file and cite the supporting file in `source_refs`.

## Write Discipline

- Preserve existing structure unless there is a strong reason to change it.
- Reuse existing IDs, paths, and filenames.
- Do not invent facts not grounded in existing files, user input, or cited evidence.
- If a match is ambiguous, stop and ask for confirmation before updating the wrong person, product, or deal.

## Reading Order

Read the smallest relevant set of files first:

- company context before strategic recommendations
- person record and development plan before coaching
- product record and sales assets before product refinement
- deal record, `meddicc.md`, and `activity-log.md` before pipeline or deal recommendations

## Output Discipline

- Be explicit about what changed.
- Capture decisions, gaps, risks, and next steps in the right files.
- Keep language crisp and operational.
