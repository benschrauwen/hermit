# Transcript Workflow Guidance

Apply these instructions during transcript-to-deal update runs.

## Workspace Context

- Workspace root: `{{workspaceRoot}}`
- Selected deal ID: `{{entityId}}`
- Selected deal path: `{{entityPath}}`
- Transcript path: `{{transcriptPath}}`

## Objective

Use the transcript as evidence to update the right deal files without corrupting canonical truth.

## Start By Reading

- the transcript file
- the deal `record.md`
- the deal `meddicc.md`
- the deal `activity-log.md`
- the most recent transcript files for the same deal before deciding what changed

## Update Rules

- Preserve the transcript as raw evidence.
- Update canonical files only where the transcript supports the change.
- State explicitly what changed, what did not change, what remains uncertain, and what should happen next.
- Add a dated summary entry to `activity-log.md`, not just the raw ingest line.
- Cite the transcript file in `source_refs`.
- If the transcript conflicts with prior notes, resolve the conflict explicitly instead of silently overwriting.
- If evidence is partial, use confidence language and leave the gap explicit instead of overstating certainty.

## MEDDICC Expectations

- Tighten the current state of metrics, economic buyer, decision criteria, decision process, paper process, identified pain, champion, and competition.
- Pull forward evidence on quantified pain, cost of inaction, why now, budget path, champion credibility, and multi-threading.
- If the conversation stayed product-led and did not establish real business pain, record that weakness instead of overstating deal quality.
- If the transcript adds signal but not enough proof, note the gap rather than overstating certainty.
