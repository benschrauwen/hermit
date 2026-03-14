---
name: entity-setup
description: Define Hermit entity schema, templates, and starter records.
---

# Entity Setup

Use when:
- You are adding or redesigning entity types in `entity-defs/` and `entities/`.

Do not use when:
- You are editing one known record.
- The main problem is role design. Use `role-setup`.

Contract:
- `entity-defs/entities.md`: schema.
- `entity-defs/<type>/`: templates referenced by `files:`.
- `entities/`: canonical instance data.
- `inbox/`: temporary intake only. Durable evidence belongs with the entity.

Rules:
- Put schema in YAML frontmatter under `entities:`.
- Put explorer config, if any, under `explorer:`.
- Do not use bare YAML in the markdown body.
- Keep templates reusable. Keep records durable.

Decide for each entity:
- `key`, `label`, `type`
- `create_directory` and optional `scan_directories`
- `id_strategy`, and for non-`singleton` entities, `id_prefix` and `id_source_fields`
- `name_template`
- optional `status_field`, `owner_field`
- optional `include_in_initialization`
- optional `extra_directories`
- `fields`
- `files`
- Where should instances live — one flat directory, or lifecycle subdirectories like `active/`, `closed-won/`, `resolved/`?
- Which companion files deserve their own markdown files instead of living in `record.md`?
- Can the user provide 2–3 real example records to pressure-test the schema?

Entity archetypes:
- **Shared context** — low count, high importance, often singleton or stable-slug. Helps every role orient quickly.
- **Shared actor** — people, teams, vendors, stakeholders. Usually stable slug IDs. Often one record plus one longitudinal companion file.
- **Operating** — main units of execution for a role. Need explicit owner, status, and next-step fields. Often need lifecycle directories or companion files.
- **Evidence-heavy** — need `artifacts/`, `transcripts/`, or structured notes. Often benefit from activity logs or review files.

ID strategy:
- `singleton`: exactly one record.
- `prefixed-slug`: stable named records with deterministic IDs.
- `year-sequence-slug`: high-volume records where chronology matters.

Build order:
1. Update `entity-defs/entities.md`.
2. Create every template referenced in `files:` under `entity-defs/<type>/`.
3. Create shared or lifecycle directories only if the workflow needs them.
4. Create one sample record to verify pathing and template shape.
5. If a role manages the entity, update that role after the schema is real.
6. If user-dropped files are part of the workflow, define where they go after leaving `inbox/`.

Bootstrap rules:
- Start with the smallest useful set of entity types.
- Reuse existing naming and field patterns in non-empty workspaces.
- For a blank workspace, create `entities/`, `entity-defs/`, `agents/`, `skills/`, `prompts/`, and `inbox/`.
- During first-role bootstrap, write the schema, templates, and starter records directly. Role-scoped `create_<entity>_record` tools may not exist yet.

Schema skeleton:

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
explorer:
  renderers:
    detail:
      work-item: renderers/work-item-detail.mjs
---
```

Record template:

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
```

Template rules:
- Put durable metadata in frontmatter.
- Use body sections for narrative, checklists, or logs.
- Add companion files only when they have one clear purpose.
- Keep required fields minimal.
- Keep IDs stable; do not base them on volatile fields.

Anti-patterns:
- Creating too many required fields before the workflow is proven.
- Splitting information across many markdown files with no distinct purpose.
- Modeling temporary workflow steps as permanent entity types.
- Choosing an ID strategy that changes when the title or stage changes.
- Forgetting to create the template file for an entry listed in `files:`.

Reference example:
- `skills/entity-setup/example-sales/`

Validation:
- Create at least one sample record.
- If a role already exists, run `npm run cli -- doctor --role <role-id>`.
