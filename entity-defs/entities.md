---
# Entity definitions: app state and schema. Same structure as former agents/<role>/role.md entities.
# Loaded once per workspace; all roles use this set. Agents directory is behavior and agent state.
explorer:
  renderers:
    detail:
      deal: renderers/deal-detail.mjs
entities:
  - key: company
    label: Company
    type: company
    create_directory: company
    id_strategy: singleton
    id_source_fields: []
    name_template: "{{companyName}}"
    fields:
      - key: companyName
        label: Company Name
        type: string
        description: Company name.
        required: true
      - key: companySummary
        label: Summary
        type: string
        description: Short company summary.
        required: true
      - key: businessModel
        label: Business Model
        type: string
        description: How the company makes money or delivers value.
        required: true
      - key: operatingCadence
        label: Operating Cadence
        type: string
        description: How the business reviews priorities and execution.
        required: true
      - key: strategicPriorities
        label: Strategic Priorities
        type: string
        description: Current strategic priorities.
        required: true
      - key: topCompetitors
        label: Top Competitors
        type: string-array
        description: Competitor names.
    files:
      - path: record.md
        template: company/record.md
      - path: strategy.md
        template: company/strategy.md
      - path: gtm.md
        template: company/gtm.md
  - key: person
    label: Person
    type: person
    create_directory: people
    id_strategy: prefixed-slug
    id_prefix: p
    id_source_fields:
      - name
    name_template: "{{name}}"
    extra_directories:
      - notes
      - artifacts
    fields:
      - key: name
        label: Name
        type: string
        description: Person name.
        required: true
      - key: role
        label: Role
        type: string
        description: Role or title.
        required: true
      - key: manager
        label: Manager
        type: string
        description: Manager name or owning leader.
        required: true
      - key: strengths
        label: Strengths
        type: string
        description: Current strengths.
        required: true
      - key: coachingFocus
        label: Coaching Focus
        type: string
        description: Current coaching focus.
        required: true
    files:
      - path: record.md
        template: person/record.md
      - path: development-plan.md
        template: person/development-plan.md
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
  - key: system
    label: System
    type: system
    create_directory: systems
    scan_directories:
      - systems
    id_strategy: prefixed-slug
    id_prefix: sys
    id_source_fields:
      - name
    name_template: "{{name}}"
    status_field: healthStatus
    owner_field: owner
    include_in_initialization: true
    extra_directories:
      - notes
      - artifacts
    fields:
      - key: name
        label: Name
        type: string
        description: System or service name.
        required: true
      - key: summary
        label: Summary
        type: string
        description: Short description of the system.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Directly accountable engineering owner.
        required: true
      - key: healthStatus
        label: Health Status
        type: string
        description: Current health status such as healthy, at-risk, or degraded.
        required: true
      - key: serviceTier
        label: Service Tier
        type: string
        description: Criticality tier for the system.
      - key: criticalUserJourney
        label: Critical User Journey
        type: string
        description: Most important user or business journey this system supports.
      - key: reliabilityTarget
        label: Reliability Target
        type: string
        description: Reliability target or SLO for the system.
    files:
      - path: record.md
        template: system/record.md
      - path: health.md
        template: system/health.md
  - key: initiative
    label: Initiative
    type: initiative
    create_directory: initiatives
    scan_directories:
      - initiatives
    id_strategy: prefixed-slug
    id_prefix: init
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
        description: Initiative title.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Directly accountable initiative owner.
        required: true
      - key: status
        label: Status
        type: string
        description: Current initiative status.
        required: true
      - key: priority
        label: Priority
        type: string
        description: Priority label.
      - key: targetDate
        label: Target Date
        type: string
        description: Target delivery or decision date.
      - key: linkedSystems
        label: Linked Systems
        type: string-array
        description: Systems materially affected by this initiative.
      - key: outcome
        label: Outcome
        type: string
        description: Intended business or engineering outcome.
    files:
      - path: record.md
        template: initiative/record.md
      - path: plan.md
        template: initiative/plan.md
      - path: review.md
        template: initiative/review.md
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
      - key: initiative
        label: Initiative
        type: string
        description: Parent initiative ID or name when relevant.
      - key: system
        label: System
        type: string
        description: Primary system affected.
      - key: acceptanceCriteria
        label: Acceptance Criteria
        type: string
        description: Concrete acceptance criteria.
      - key: nextStep
        label: Next Step
        type: string
        description: Next committed engineering action.
      - key: dueDate
        label: Due Date
        type: string
        description: Due date if one exists.
    files:
      - path: record.md
        template: ticket/record.md
      - path: plan.md
        template: ticket/plan.md
      - path: activity-log.md
        template: ticket/activity-log.md
  - key: incident
    label: Incident
    type: incident
    create_directory: incidents/open
    scan_directories:
      - incidents/open
      - incidents/resolved
    id_strategy: year-sequence-slug
    id_prefix: inc
    id_source_fields:
      - title
    name_template: "{{title}}"
    status_field: status
    owner_field: commander
    include_in_initialization: false
    extra_directories:
      - notes
      - artifacts
    fields:
      - key: title
        label: Title
        type: string
        description: Incident title.
        required: true
      - key: commander
        label: Commander
        type: string
        description: Incident commander or directly accountable owner.
        required: true
      - key: status
        label: Status
        type: string
        description: Current incident status.
        required: true
      - key: severity
        label: Severity
        type: string
        description: Severity level.
        required: true
      - key: startedAt
        label: Started At
        type: string
        description: Time the incident started or was detected.
      - key: impactedSystems
        label: Impacted Systems
        type: string-array
        description: Systems materially impacted by the incident.
      - key: customerImpact
        label: Customer Impact
        type: string
        description: Description of customer or business impact.
      - key: nextStep
        label: Next Step
        type: string
        description: Next operational step.
    files:
      - path: record.md
        template: incident/record.md
      - path: postmortem.md
        template: incident/postmortem.md
---

Entity definitions live here. Agents define behavior and agent state; entities and entity-defs define app state and schema.
