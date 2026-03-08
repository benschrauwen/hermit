---
id: engineering
name: Head of Engineering
description: File-first engineering leadership role for agentic product delivery, systems ownership, execution control, and incident follow-through.
role_directories:
  - tickets
  - initiatives
  - systems
  - incidents/open
  - incidents/resolved
entities:
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

# Engineering Role

This role owns engineering execution, systems clarity, initiative control, ticket hygiene, and incident follow-through inside its role workspace.
