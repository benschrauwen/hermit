---
entities:
  - key: company
    label: Company
    type: company
    create_directory: companies
    scan_directories:
      - companies
    id_strategy: prefixed-slug
    id_prefix: co
    id_source_fields:
      - name
    name_template: "{{name}}"
    fields:
      - key: name
        label: Company Name
        type: string
        description: Legal or trading name.
        required: true
      - key: industry
        label: Industry
        type: string
        description: Sector or vertical.
      - key: summary
        label: Summary
        type: string
        description: Short account overview.
    files:
      - path: record.md
        template: company/record.md

  - key: person
    label: Person
    type: person
    create_directory: people
    scan_directories:
      - people
    id_strategy: prefixed-slug
    id_prefix: person
    id_source_fields:
      - name
    name_template: "{{name}}"
    fields:
      - key: name
        label: Name
        type: string
        description: Full name or how they are referred to.
        required: true
      - key: company_id
        label: Company
        type: string
        description: ID of linked company, if any.
      - key: role
        label: Role / Title
        type: string
        description: Job title or role at company.
      - key: email
        label: Email
        type: string
        description: Primary email.
    files:
      - path: record.md
        template: person/record.md

  - key: product
    label: Product
    type: product
    create_directory: products
    scan_directories:
      - products
    id_strategy: prefixed-slug
    id_prefix: prod
    id_source_fields:
      - name
    name_template: "{{name}}"
    fields:
      - key: name
        label: Product Name
        type: string
        description: Clear product name.
        required: true
      - key: category
        label: Category
        type: string
        description: Product line or category.
      - key: summary
        label: Summary
        type: string
        description: Short product description.
    files:
      - path: record.md
        template: product/record.md

  - key: deal
    label: Deal
    type: deal
    create_directory: deals
    scan_directories:
      - deals
    exclude_directory_names:
      - notes
      - artifacts
    id_strategy: prefixed-slug
    id_prefix: deal
    id_source_fields:
      - name
    name_template: "{{name}}"
    status_field: stage
    owner_field: owner
    include_in_initialization: true
    extra_directories:
      - notes
      - artifacts
    fields:
      - key: name
        label: Deal Name
        type: string
        description: Short deal identifier (e.g. "Acme - Enterprise").
        required: true
      - key: company_id
        label: Company
        type: string
        description: ID of the account.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Sales owner.
        required: true
      - key: stage
        label: Stage
        type: string
        description: Pipeline stage (e.g. qualification, proposal, negotiation, closed-won, closed-lost).
        required: true
      - key: value
        label: Value
        type: string
        description: Deal value or range.
      - key: summary
        label: Summary
        type: string
        description: Short deal summary.
    files:
      - path: record.md
        template: deal/record.md
---
