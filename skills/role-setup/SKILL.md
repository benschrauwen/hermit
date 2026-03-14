---
name: role-setup
description: Define Hermit roles, including `role.md`, `AGENTS.md`, prompts, and startup files.
---

# Role Setup

Use when:
- You are creating or redesigning `agents/<role-id>/`.

Do not use when:
- The main work is entity design. Use `entity-setup`.
- You are making a small edit to an existing prompt with no role contract change.

Contract:
- `agents/<role-id>/role.md`: manifest only.
- `agents/<role-id>/AGENTS.md`: operating standard, startup context, entity context, prompt index.
- `agents/<role-id>/prompts/`: recurring dense subdomains.
- `agents/<role-id>/skills/`: optional reusable role-local workflows.
- `prompts/templates/agent/record.md` and `prompts/templates/agent/inbox.md`: shared templates.
- `inbox/`: shared file drop zone. Not the same as `agent/inbox.md`.

Decide for each role:
- owned domain and job
- what the user still manages directly
- what the role can decide alone
- managed entity types
- startup files and shared context
- recurring subdomains that need prompt files
- optional `role_directories` and `transcript_ingest`
- non-negotiable standards and evidence rules

Build order:
1. If the role needs new entities, create them in the same pass.
2. Write `role.md` with manifest facts only.
3. Write `AGENTS.md` with operating standard, startup context, entity context, and on-demand prompts.
4. Add `prompts/*.md` only for recurring dense work.
5. Ensure shared agent templates exist.
6. Let the runtime scaffold `agent/` when possible. If not, create `agent/record.md` and `agent/inbox.md` from the shared templates.
7. Add `transcript_ingest` only when the entity type, directories, and prompts already exist.
8. Run `npm run cli -- doctor --role <role-id>`.

Interview follow-through:
- If the user names recurring task clusters, create matching `prompts/*.md` files in the first draft.
- If the user names evidence flows or special working areas, reflect them in `role_directories` or `transcript_ingest`.
- If startup files or shared context are obviously required, include them in `AGENTS.md` immediately.
- Do not leave `On-Demand Prompts` empty when the role already has obvious recurring work modes.

Rules:
- Keep `role.md` short and factual.
- Put behavior in `AGENTS.md`, not `role.md`.
- Start from accountability, not adjectives.
- State what evidence the role needs before it trusts a conclusion.
- Define what the role escalates to the user.

When to create another role:
- A single role can own many responsibilities. Do not split just because there is a lot to do.
- Split when the work needs a genuinely different lens: different operating model, evidence standards, decision cadence, or definition of "good."
- If two work modes would disagree on what counts as progress or what deserves escalation, they probably want separate roles.
- Encode this awareness into `AGENTS.md` so the role can say when a request belongs elsewhere.

How to get a strong persona:
- Define what the role protects, inspects, and refuses to fake.
- Write a leadership lens that explains how the role sees the world and what it optimizes for.
- Add explicit non-negotiables. "We do not..." lines sharpen judgment.
- Encode the default evidence model: what facts does the role need before it trusts a conclusion?
- Name the recurring inspection motions: planning, review, escalation, triage, quality control, evidence intake.
- Name what the role does when it needs real-world action it cannot take: prepare a draft, recommendation, agenda, or escalation for the user.
- Define what honesty looks like. Good personas protect truth over comfort.
- If the persona still sounds generic, ask: What does this role hate seeing? What does it treat as fake progress? What should it say "no" to faster than a normal assistant would?

`role.md` skeleton:

```yaml
---
id: operations
name: Head of Operations
description: File-first operations leadership role for process quality, execution control, and follow-through.
---
```

Optional fields:

```yaml
role_directories:
  - supporting-files

transcript_ingest:
  entity_type: work-item
  command_prompt: command-transcript-run.md
  system_prompts:
    - mode-transcript-ingest.md
  evidence_directory: transcripts
  unmatched_directory: supporting-files/unmatched-transcripts
  activity_log_file: activity-log.md
```

`AGENTS.md` outline:

```markdown
# <Role Name>

## Operating Standard
- What the role owns and protects

### Leadership Lens
- How the role sees the work

### Core Standard
- Non-negotiables

### Operating Relationship
- What the role owns
- What the user approves or handles directly

### Operating Expectations
- Recurring motions
- Evidence rules
- Escalation rules

## Startup Context
- `agent/record.md`
- `agent/inbox.md`
- shared files this role always reads first

## Entity Context
- managed types and directories

## On-Demand Prompts
- recurring prompt files
```

Shared template starters:

Copy from `prompts/templates/agent/record.md` and `prompts/templates/agent/inbox.md` when the runtime has not scaffolded them. The canonical templates include GTD sections (Active Projects, Next Actions, Waiting For, Calendar, Someday Or Maybe, Strategic Experiments, Strategic Observations) and an inbox Purpose section. Do not omit those sections when creating files manually.

Anti-patterns:
- Packing domain detail into `role.md` instead of `AGENTS.md`.
- Writing an `AGENTS.md` that is all tone and no inspectable operating standard.
- Creating many prompt files before the core role behavior is clear.
- Leaving `On-Demand Prompts` empty when the role already has obvious recurring work modes.
- Inventing special agent files per role instead of using the shared `prompts/templates/agent/` templates.
- Giving the role broad authority without clarifying what evidence it needs.
- Cramming several distinct operating lenses into one role just because they touch the same domain.

Reference example:
- `skills/role-setup/example/sales/`

Validation:
- Check that startup paths are real.
- Check that entity context matches real directories.
- Read the first screenful of `AGENTS.md`; it should sound like a specific operator, not a generic assistant.
