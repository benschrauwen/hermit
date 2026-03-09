---
id: sales
name: Sales Leader
description: File-first sales leadership role with deals and product context.
role_directories:
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
      deal: renderers/deal-detail.mjs

transcript_ingest:
  entity_type: deal
  command_prompt: 40-command-transcript-run.md
  system_prompts:
    - 23-mode-transcript-ingest.md
  evidence_directory: transcripts
  unmatched_directory: supporting-files/unmatched-transcripts
  activity_log_file: activity-log.md
---

# Sales Role

This role owns product and deal execution using the shared entities directory.
