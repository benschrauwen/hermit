---
name: role_setup
description: Design and scaffold Hermit roles, including `role.md`, `AGENTS.md`, startup files, and a sharp operating persona. Use when creating the first role in a blank Hermit workspace, adding a new role, or refining a role's operating standard.
---

# Role Setup

Use this skill when the task is about creating or redesigning `agents/<role-id>/` in a Hermit workspace.

This skill is intentionally self-contained. Do not assume the workspace already contains any example roles.

Do not use this skill when:
- The main work is adding or reshaping entity types. Use `entity_setup`.
- The task is a one-off edit to an existing prompt file with no role contract change.

## Core Model

- `agents/<role-id>/role.md` is the short manifest. Keep it compact and factual.
- `agents/<role-id>/AGENTS.md` is the operating overlay and prompt index. This is where the role's real working style lives.
- `agents/<role-id>/prompts/` holds on-demand subdomain prompts that should not always sit in the main system prompt.
- `agents/<role-id>/skills/` is optional and only needed for reusable role-local workflows.
- `prompts/templates/agent/record.md` and `prompts/templates/agent/inbox.md` are the shared templates for each role's GTD-style operating files. Do not fork those lightly.

## What A Role Must Decide

Each role needs explicit answers for:

- What domain it owns
- Which decisions it can make independently
- Which entity types it manages directly
- Which supporting entity types still need to be created for this role to function well
- Which shared context it should read at startup
- Which files or directories it needs beyond the default scaffold
- Which recurring subdomains deserve their own prompt files
- Whether it needs optional capabilities such as transcript ingest
- What standards it protects even when those standards are inconvenient

## Bootstrap from zero

If the workspace has no agents yet:

- Create `agents/<role-id>/role.md`, `agents/<role-id>/AGENTS.md`, `agents/<role-id>/prompts/`, and `agents/<role-id>/skills/`.
- Start with one sharp role before creating several overlapping roles. A single well-bounded operator beats three vague personas.
- Make sure shared agent templates exist at `prompts/templates/agent/record.md` and `prompts/templates/agent/inbox.md`. Role validation depends on them.
- Pair the role with a real entity landscape. A role with no managed entities and no startup context becomes generic quickly.
- It is allowed, and often necessary, to create the supporting entity types, templates, and starter records in the same workflow as the role.
- If the workspace also has no entity definitions yet, use `entity_setup` in the same pass so the role can point at real shared and owned data.
- Let the runtime scaffold `agents/<role-id>/agent/` and `.role-agent/` when possible. If you are only doing file setup by hand, create `agent/record.md` and `agent/inbox.md` from the shared templates.
- Keep the first pass focused, but not hollow. Create the smallest complete role that can actually operate in its domain.
- If the role already has clear recurring work modes, create the matching `prompts/*.md` files in the first pass instead of leaving the prompt index empty.
- If the role clearly needs extra working directories or capabilities such as evidence intake or transcript ingest, include them in the first pass instead of deferring them by default.

## Interview Checklist

Ask these questions before writing the role:

- What business or operating domain does this role own?
- What decisions should it make autonomously, and what should it escalate?
- Which outcomes matter more than activity volume?
- Which entity types does it manage directly?
- Which shared files should it read at session start?
- What recurring task clusters deserve their own prompt files?
- Does it need special capabilities such as transcript ingest?
- Does it need extra working directories like `supporting-files/` or inbox folders for evidence?
- What are the 5-10 standards this role should enforce even when they are uncomfortable?
- Which common failure modes should it call out directly?
- What kind of leader or operator should it resemble in judgment, not just tone?
- Can the user give 2-3 example tasks this role should handle well and 2 tasks it should explicitly avoid?

Treat these answers as build inputs, not just discussion:

- If the user names recurring task clusters, turn them into `prompts/*.md` files during the first draft unless they are clearly one-off edge cases.
- If the user names evidence flows, ingestion work, or special working areas, reflect that in `role_directories`, `transcript_ingest`, or both when the workflow is real.
- If startup files or shared context are obviously required for competent work, include them in `AGENTS.md` immediately instead of leaving them implied.

## How To Get A Strong Persona

Use this pattern:

- Start from accountability, not adjectives. Define what the role protects, inspects, and refuses to fake.
- Write a leadership lens that explains how this role sees the world.
- Add a core standard with explicit non-negotiables. "We do not..." lines are useful when they sharpen judgment.
- Encode the default evidence model. What facts does this role need before it trusts a conclusion?
- Name the role's recurring inspection motions, such as planning, review, escalation, triage, quality control, or evidence intake.
- Define what honesty looks like in this role. Good personas protect truth over comfort.
- Keep the persona recognizable. "Disciplined operations leader" works. "Helpful business copilot" is too weak.

If the persona still sounds generic, ask more pointed questions:

- What does this role hate seeing?
- What does this role repeatedly push teams to clarify?
- What does this role treat as fake progress?
- What should this role say "no" to faster than a normal assistant would?

## Split Responsibilities Correctly

Put each kind of information in the right file:

- `role.md`: manifest facts only, such as `id`, `name`, `description`, optional `role_directories`, and optional `transcript_ingest`
- `AGENTS.md`: operating standard, startup context, entity context, and links to on-demand prompts
- `prompts/*.md`: deep, recurring subdomain guidance that should be read only when relevant
- `agent/record.md`: clarified role-local operating system
- `agent/inbox.md`: raw internal commitments and reminders waiting for clarification

## Build Order

1. Decide whether the role needs new or updated entity types to support its work. If yes, create or revise them in the same pass.
2. Write `agents/<role-id>/role.md` with only manifest-level facts.
3. Write `agents/<role-id>/AGENTS.md` with:
   - operating standard
   - startup context
   - entity context
   - on-demand prompt index
4. Add `agents/<role-id>/prompts/*.md` for recurring subdomains that are already clear from the user's description. Do not leave `On-Demand Prompts` empty when the role obviously has repeated dense work modes.
5. Ensure `prompts/templates/agent/record.md` and `prompts/templates/agent/inbox.md` exist.
6. If needed, declare `transcript_ingest` only after the target entity type, evidence path, and prompt files already exist.
7. Validate with `bun cli doctor --role <role-id>`.

## `role.md` Skeleton

Keep it short:

```yaml
---
id: operations
name: Head of Operations
description: File-first operations leadership role for process quality, execution control, and cross-functional follow-through.
---
```

`role_directories` is optional. Omit it when the role needs no extra working directories; the runtime will default it to `[]`.

If the role needs extra working directories, add them explicitly:

```yaml
role_directories:
  - supporting-files
  - supporting-files/inbox
```

Only add `transcript_ingest` when the workflow is real:

```yaml
transcript_ingest:
  entity_type: work-item
  command_prompt: command-transcript-run.md
  system_prompts:
    - mode-transcript-ingest.md
  evidence_directory: transcripts
  unmatched_directory: supporting-files/unmatched-transcripts
  activity_log_file: activity-log.md
```

## `AGENTS.md` Skeleton

Use this outline:

```markdown
# <Role Name>

## Operating Standard
- Brief statement of what this role owns and protects

### Leadership Lens
- How this role sees the world
- What it optimizes for

### Core Standard
- A few explicit non-negotiables
- "We do not..." lines when they sharpen judgment

### Operating Expectations
- The recurring motions this role runs
- What good and bad look like
- Which conclusions require evidence before trust

## Startup Context
- `agent/record.md`
- `agent/inbox.md`
- List the shared context files this role should always read first
- List the role-owned entity areas this role most often works in

## Entity Context
- Which entity types and directories this role manages

## On-Demand Prompts
- Link each recurring subdomain prompt
```

Keep `AGENTS.md` concise, but make the first screenful specific enough that the role already sounds like a real operator instead of a generic assistant with domain nouns.

## Good On-Demand Prompt Candidates

Create a separate role prompt when a subdomain is both recurring and dense, for example:

- evidence intake
- review rituals
- escalation handling
- planning cadence
- transcript ingest
- stakeholder updates
- operating reviews

Keep the main `AGENTS.md` sharp. If the file starts reading like five manuals pasted together, split it.
Do not create prompt files for every possible topic. Create them when they meaningfully reduce ambiguity in recurring work.
Do not leave the section empty just because the workspace is new. If the user's description already reveals recurring modes, capture them now.

## Minimal Shared Agent Templates

If the framework has not created them yet, use starter templates like these under `prompts/templates/agent/`.

`record.md`

```markdown
---
id: {{roleId}}-agent
type: agent
name: {{roleName}} Agent
status: active
owner: {{roleName}}
updated_at: {{updatedAt}}
source_refs:
{{sourceRefsYaml}}
---

## Summary

{{roleDescription}}

## Active Projects

- None yet.

## Next Actions

- None yet.

## Waiting For

- None yet.

## Calendar

- None scheduled.

## Someday Or Maybe

- None yet.
```

`inbox.md`

```markdown
---
id: {{roleId}}-agent-inbox
type: agent-inbox
name: {{roleName}} Agent Inbox
status: active
owner: {{roleName}}
updated_at: {{updatedAt}}
source_refs:
{{sourceRefsYaml}}
---

## Purpose

Raw internal commitments, reminders, and follow-up ideas that still need clarification into `agent/record.md`.

## Open Inbox Items

- None.
```

## Quality Bar

- The role should feel like a specific operator with real standards, not a generic assistant plus jargon.
- A new session should know what to read first without guessing.
- The entity context should make it obvious where this role works in the workspace.
- The role should have a small set of strong opinions that improve decisions under ambiguity.
- The role should be able to explain what good looks like and what bad smells like.
- The first draft should be focused, but complete enough that repeated task modes, obvious directories, and real capabilities are not silently deferred.

## Anti-Patterns

- Packing every domain detail into `role.md`.
- Writing an `AGENTS.md` that is all tone and no inspectable operating standard.
- Creating many prompt files before the core role behavior is clear.
- Leaving `On-Demand Prompts` empty even though the role already has obvious recurring work modes.
- Inventing special agent files per role instead of using the shared `prompts/templates/agent/` templates.
- Giving the role broad authority without clarifying what evidence it needs.

## Validation

- Run `bun cli doctor --role <role-id>` when the repo supports it.
- Read the final `AGENTS.md` top to bottom and check whether the role sounds concrete in the first screenful.
- Confirm the role's startup context points to real files.
- Confirm the entity context matches real directories and real entity types.
