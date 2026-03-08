---
id: sales
name: Sales Leader
description: File-first sales leadership role with deals and product context.
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
  sales-product:
    scope: role
    file: 20-mode-product.md
  sales-people:
    scope: role
    file: 21-mode-people.md
  sales-pipeline:
    scope: role
    file: 22-mode-pipeline.md
  sales-transcript-workflow:
    scope: role
    file: 23-mode-transcript-ingest.md
  sales-deal:
    scope: role
    file: 24-mode-deal.md
  sales-standard:
    scope: role
    file: 25-role-sales.md
  sales-transcript-command:
    scope: role
    file: 40-command-transcript-run.md
required_prompts:
  - core-soul
  - file-rules
  - bootstrap
  - routing
  - agent-ops
  - self-improvement
  - sales-product
  - sales-people
  - sales-pipeline
  - sales-transcript-workflow
  - sales-deal
  - sales-standard
  - sales-transcript-command
prompt_bundles:
  default:
    - core-soul
    - file-rules
    - routing
    - sales-standard
    - agent-ops
  onboarding:
    - core-soul
    - file-rules
    - bootstrap
    - routing
    - sales-standard
    - agent-ops
  transcript-ingest:
    - core-soul
    - file-rules
    - sales-transcript-workflow
    - sales-standard
role_directories:
  - deals
  - deals/active
  - deals/closed-won
  - deals/closed-lost
  - product
  - supporting-files
  - supporting-files/inbox
  - supporting-files/unmatched-transcripts
  - supporting-files/reference
entities:
  - key: product
    label: Product
    type: product
    create_directory: product
    scan_directories:
      - product
    id_strategy: prefixed-slug
    id_prefix: prd
    id_source_fields:
      - name
    name_template: "{{name}}"
    include_in_initialization: true
    extra_directories:
      - notes
      - artifacts
    fields:
      - key: name
        label: Name
        type: string
        description: Product name.
        required: true
      - key: summary
        label: Summary
        type: string
        description: Short product summary.
        required: true
      - key: valueHypothesis
        label: Value Hypothesis
        type: string
        description: Why customers buy this product.
        required: true
      - key: competitors
        label: Competitors
        type: string-array
        description: Competitor names.
    files:
      - path: record.md
        template: product/record.md
      - path: playbook.md
        template: product/playbook.md
      - path: competitive-analysis.md
        template: product/competitive-analysis.md
  - key: deal
    label: Deal
    type: deal
    create_directory: deals/active
    scan_directories:
      - deals
      - deals/active
      - deals/closed-won
      - deals/closed-lost
    exclude_directory_names:
      - active
      - closed-won
      - closed-lost
    id_strategy: year-sequence-slug
    id_prefix: d
    id_source_fields:
      - accountName
      - opportunityName
    name_template: "{{accountName}} - {{opportunityName}}"
    status_field: stage
    owner_field: owner
    include_in_initialization: true
    extra_directories:
      - notes
      - artifacts
      - transcripts
    fields:
      - key: accountName
        label: Account Name
        type: string
        description: Account or customer name.
        required: true
      - key: opportunityName
        label: Opportunity Name
        type: string
        description: Opportunity name.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Deal owner.
        required: true
      - key: stage
        label: Stage
        type: string
        description: Current stage.
        required: true
      - key: amount
        label: Amount
        type: string
        description: Expected amount.
      - key: closeDate
        label: Close Date
        type: string
        description: Expected close date.
      - key: nextStep
        label: Next Step
        type: string
        description: Next committed step.
    files:
      - path: record.md
        template: deal/record.md
      - path: meddicc.md
        template: deal/meddicc.md
      - path: activity-log.md
        template: deal/activity-log.md
explorer:
  renderers:
    detail:
      deal: explorer/renderers/deal-detail.mjs
transcript_ingest:
  entity_type: deal
  prompt_file: sales-transcript-command
  evidence_directory: transcripts
  unmatched_directory: supporting-files/unmatched-transcripts
  activity_log_file: activity-log.md
---

# Sales Role

This role owns product and deal execution inside its own role workspace.
