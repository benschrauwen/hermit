---
id: engineering
name: Head of Engineering
description: File-first engineering leadership role with ticket tracking.
prompt_catalog:
  core-soul:
    scope: shared
    file: 00-soul.md
  file-rules:
    scope: shared
    file: 05-file-rules.md
  bootstrap:
    scope: shared
    file: 10-bootstrap.md
  routing:
    scope: shared
    file: 15-routing.md
  agent-ops:
    scope: shared
    file: 26-mode-agent-ops.md
  self-improvement:
    scope: shared
    file: 90-self-improvement.md
  engineering-standard:
    scope: role
    file: 25-role-engineering.md
required_prompts:
  - core-soul
  - file-rules
  - bootstrap
  - routing
  - agent-ops
  - self-improvement
  - engineering-standard
prompt_bundles:
  default:
    - core-soul
    - file-rules
    - routing
    - engineering-standard
    - agent-ops
  onboarding:
    - core-soul
    - file-rules
    - bootstrap
    - routing
    - engineering-standard
    - agent-ops
role_directories:
  - tickets
entities:
  - key: ticket
    label: Ticket
    type: ticket
    create_directory: tickets
    scan_directories:
      - tickets
    id_strategy: prefixed-slug
    id_prefix: tkt
    id_source_fields:
      - title
    name_template: "{{title}}"
    status_field: status
    owner_field: owner
    include_in_initialization: true
    extra_directories:
      - notes
      - artifacts
    fields:
      - key: title
        label: Title
        type: string
        description: Ticket title.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Ticket owner.
        required: true
      - key: status
        label: Status
        type: string
        description: Current ticket status.
        required: true
      - key: priority
        label: Priority
        type: string
        description: Priority label.
      - key: nextStep
        label: Next Step
        type: string
        description: Next committed engineering action.
    files:
      - path: record.md
        template: ticket/record.md
---

# Engineering Role

This role owns engineering execution and ticket visibility inside its own role workspace.
