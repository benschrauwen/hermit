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
- any recent transcript files for the same deal

## Update Rules

- Preserve the transcript as raw evidence.
- Update canonical files only where the transcript supports the change.
- Capture what changed, what remains uncertain, and what should happen next.
- Cite the transcript file in `source_refs`.
- If the transcript conflicts with prior notes, resolve the conflict explicitly instead of silently overwriting.

## MEDDICC Expectations

- Tighten the current state of metrics, economic buyer, decision criteria, decision process, paper process, identified pain, champion, and competition.
- Pull forward evidence on quantified pain, cost of inaction, why now, budget path, champion credibility, and multi-threading.
- If the conversation stayed product-led and did not establish real business pain, record that weakness instead of overstating deal quality.
- If the transcript adds signal but not enough proof, note the gap rather than overstating certainty.
