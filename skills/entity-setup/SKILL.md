---
name: entity-setup
description: Design and scaffold Hermit entity types, starter templates, and first records. Use when defining entity schema for a blank Hermit workspace, adding a new entity type, or deciding how records, IDs, directories, and templates should work.
---

# Entity Setup

Use this skill when the task is about introducing or redesigning entity types in a Hermit workspace, especially `entity-defs/entities.md`, `entity-defs/<type>/`, or first-run `entities/` records.

This skill is intentionally self-contained. Do not assume the workspace already contains any example entities.

Do not use this skill when:
- You are editing one known record in an existing entity directory.
- The main problem is role identity or persona design. Use `role-setup` for that.

## Framework Contract

Hermit entity setup has three layers:

- `entity-defs/entities.md`: the schema contract for all entity types
- `entity-defs/<type>/`: markdown starter templates for that type
- `entities/`: canonical instance data created from those templates

Design around this rule:

- Schema lives in `entity-defs/`
- Instance data lives in `entities/`
- Templates should be generic and reusable
- Records should hold durable truth, not temporary scratch notes

## `entity-defs/entities.md` Format

`entity-defs/entities.md` must be a markdown file with YAML frontmatter.

- Put the entity schema under a top-level `entities:` key.
- Put optional explorer configuration under a top-level `explorer:` key.
- Do not write a bare YAML list in the file body. The runtime reads frontmatter, not raw body YAML.

Use this exact wrapper shape:

```markdown
---
entities:
  - key: work-item
    label: Work Item
    type: work-item
    create_directory: work-items
    id_strategy: prefixed-slug
    id_prefix: wi
    id_source_fields:
      - name
    name_template: "{{name}}"
    fields:
      - key: name
        label: Name
        type: string
        description: Clear human-readable name.
        required: true
    files:
      - path: record.md
        template: work-item/record.md
explorer:
  renderers:
    detail:
      work-item: renderers/work-item-detail.mjs
---
```

## What An Entity Definition Must Decide

Each entity type needs explicit answers for:

- What the entity is called: `key`, `label`, `type`
- Where instances are created: `create_directory`
- How IDs are generated: `id_strategy`, and for non-singleton entities, `id_prefix` and `id_source_fields`
- How the entity is displayed: `name_template`
- Which field represents status, if any: `status_field`
- Which field represents ownership, if any: `owner_field`
- Whether it counts toward first-run bootstrap: `include_in_initialization`
- Which extra folders belong under each instance: `extra_directories`
- Which files each instance must have: `files`
- Which directories should be scanned to discover existing records: `scan_directories`
- Which lifecycle or container folders should be skipped while scanning: `exclude_directory_names`

## Two Setup Modes

### Add to an existing workspace

- Fit the new type into the current workspace shape.
- Reuse naming and field patterns that already exist.
- Only add companion files that hold durable, role-relevant context.

### Bootstrap from zero

If the workspace is empty:

- Create the shared roots: `entities/`, `entity-defs/`, `agents/`, `skills/`, and `prompts/`.
- Start with the smallest useful set of entity types, usually:
  - one shared context entity
  - one shared human or stakeholder entity if people matter to the workflow
  - one or two operating entities owned by the first role
- Do not create many entity types up front. Start from the first real workflow.
- Choose at least one entity type with `include_in_initialization: true` if the runtime or onboarding flow expects bootstrap data.
- Coordinate with `role-setup` so the first role points at real entities instead of empty directories.
- During first-role bootstrap, role-scoped `create_<entity>_record` tools may not exist yet because they are derived from the role and entity schema. In that phase, create `entity-defs/entities.md`, the templates, and the starter files directly with normal file writes, then switch to the deterministic create tools once the role loads successfully.

## Interview Checklist

Ask these questions before writing the schema:

- What durable thing does this entity represent?
- Is it shared across all roles or primarily owned by one role?
- Where should instances live? One directory, or lifecycle subdirectories like `active`, `closed-won`, `resolved`, or `open`?
- Which ID strategy fits best: `singleton`, `prefixed-slug`, or `year-sequence-slug`?
- If not `singleton`, what should the prefix be, and which source fields should generate the ID?
- What should the human-readable `name_template` be?
- Which field should act as the primary `status_field`?
- Which field should act as the primary `owner_field`?
- Which 3-7 fields are truly required to create a useful first record?
- Which fields should be searchable in frontmatter versus explained in body sections?
- Which companion files deserve their own markdown files instead of living in `record.md`?
- Which extra directories are needed: `notes`, `artifacts`, `transcripts`, or something else?
- Should this entity count toward initialization? If yes, set `include_in_initialization: true`.
- Can the user provide 2-3 real example records? Pressure-test the schema against them before finalizing it.

## Good Entity Shapes

Most good Hermit entities fall into one of these buckets:

- Shared context entities:
  - Low count
  - High importance
  - Often singleton or stable-slug
  - Help every role orient quickly

- Shared actor entities:
  - Represent people, teams, vendors, or stakeholders
  - Usually stable slug IDs
  - Often deserve one main record plus one longitudinal companion file

- Operating entities:
  - The main units of execution for a role
  - Usually need explicit owner, status, and next-step fields
  - Often need lifecycle directories or companion files

- Evidence-heavy entities:
  - Need `artifacts`, `transcripts`, or structured notes
  - Often benefit from activity logs or review files

- Prefer a small number of required fields with high inspection value.
- Use `string-array` only when multiple values are genuinely first-class.
- Use companion files for repeated operating motions, not for decorative structure.
- Use `scan_directories` plus `exclude_directory_names` when instances live inside lifecycle folders.
- Keep IDs stable and predictable. Avoid IDs based on volatile fields.

## ID Strategy Guide

Use `singleton` when there should only ever be one record of that type.

- `id_source_fields` may be omitted for `singleton` entities.

Use `prefixed-slug` when:

- The entity has a stable human-readable name
- You want deterministic IDs
- A renamed record does not need a brand new identity
- `id_source_fields` is required

Use `year-sequence-slug` when:

- The entity is high-volume
- Human names collide often
- Chronology matters
- `id_source_fields` is required

## Build Order

1. Add or update the entity block in `entity-defs/entities.md`.
2. Create templates under `entity-defs/<type>/` for every file declared in `files:`.
3. Create any needed shared directories or lifecycle directories when bootstrapping a blank workspace.
4. If a role will manage this entity, update that role's `AGENTS.md` entity context after the schema is real.
5. Create one sample record to verify pathing, ID generation, file usefulness, and naming.

## Entity Definition Skeleton

Use this as a starting point and trim anything you do not need:

```yaml
---
entities:
  - key: work-item
    label: Work Item
    type: work-item
    create_directory: work-items
    scan_directories:
      - work-items
    id_strategy: prefixed-slug
    id_prefix: wi
    id_source_fields:
      - name
    name_template: "{{name}}"
    status_field: status
    owner_field: owner
    include_in_initialization: true
    extra_directories:
      - notes
      - artifacts
    fields:
      - key: name
        label: Name
        type: string
        description: Clear human-readable name.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Directly accountable owner.
        required: true
      - key: status
        label: Status
        type: string
        description: Current state.
        required: true
      - key: summary
        label: Summary
        type: string
        description: Short description of what this entity represents.
    files:
      - path: record.md
        template: work-item/record.md
      - path: notes.md
        template: work-item/notes.md
---
```

## Minimal Record Template

For most types, start with a `record.md` shaped like this:

```markdown
---
id: {{id}}
type: work-item
name: {{name}}
status: {{status}}
owner: {{owner}}
updated_at: {{updatedAt}}
source_refs:
{{sourceRefsYaml}}
---

## Summary

{{summary}}

## Current State

- Add the most important current facts.

## Next Questions

- Add open questions discovered during setup.
```

## Template Rules

- Keep placeholders explicit and simple.
- Put durable metadata in frontmatter, then use body sections for narrative, checklists, or structured notes.
- `record.md` should usually contain the entity's stable summary and current inspectable state.
- Companion files should each have one clear purpose, like activity logging, qualification, planning, or review.
- Do not make every field a separate section if that adds noise without better decision-making.

## Quality Bar

- The entity should be easy to create from incomplete but real evidence.
- The frontmatter should make scanning and lookup useful without reading the full file.
- The body should give the operator a place to think, not restate the frontmatter mechanically.
- The directory layout should match how the entity evolves over time.
- Another role should be able to understand what the entity is for by reading one example record.

## Anti-Patterns

- Creating too many required fields before the workflow is proven.
- Splitting information across many markdown files with no distinct purpose.
- Modeling temporary workflow steps as permanent entity types.
- Choosing an ID strategy that changes when the title or stage changes.
- Forgetting to create the template file for an entry listed in `files:`.

## Validation

- If this is a real repo change, create at least one sample record and inspect the generated path and markdown shape.
- If the role contract already exists, run `npm run cli -- doctor --role <role-id>`.
- If the entity is part of first-run bootstrapping, make sure at least one created record proves the schema is usable in practice.
