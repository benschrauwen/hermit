---
entities:
  - key: site
    label: Site
    type: site
    create_directory: site
    scan_directories:
      - site
    id_strategy: singleton
    name_template: "{{name}}"
    status_field: status
    owner_field: owner
    include_in_initialization: true
    fields:
      - key: name
        label: Name
        type: string
        description: Public name of the site.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Accountable role for the site.
        required: true
      - key: status
        label: Status
        type: string
        description: Current site status.
        required: true
      - key: audience
        label: Audience
        type: string
        description: Primary audience for the current version of the site.
        required: true
      - key: primary_goal
        label: Primary Goal
        type: string
        description: Main outcome the site should drive.
        required: true
      - key: value_proposition
        label: Value Proposition
        type: string
        description: Main promise the homepage should communicate.
        required: true
      - key: primary_cta_label
        label: Primary CTA Label
        type: string
        description: Label for the main homepage call to action.
        required: true
      - key: primary_cta_href
        label: Primary CTA Link
        type: string
        description: Destination for the main homepage call to action.
        required: true
      - key: secondary_cta_label
        label: Secondary CTA Label
        type: string
        description: Label for the secondary homepage call to action.
      - key: secondary_cta_href
        label: Secondary CTA Link
        type: string
        description: Destination for the secondary homepage call to action.
    files:
      - path: record.md
        template: site/record.md

  - key: page
    label: Pages
    type: page
    create_directory: pages
    scan_directories:
      - pages
    id_strategy: prefixed-slug
    id_prefix: page
    id_source_fields:
      - slug
    name_template: "{{name}}"
    status_field: status
    owner_field: owner
    include_in_initialization: true
    fields:
      - key: name
        label: Name
        type: string
        description: Human-readable page name.
        required: true
      - key: slug
        label: Slug
        type: string
        description: Stable page slug.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Accountable role for the page.
        required: true
      - key: status
        label: Status
        type: string
        description: Current publishing status.
        required: true
      - key: audience
        label: Audience
        type: string
        description: Intended audience for the page.
        required: true
      - key: primary_goal
        label: Primary Goal
        type: string
        description: Main job this page should do.
        required: true
      - key: summary
        label: Summary
        type: string
        description: One-line summary of the page.
        required: true
      - key: presentation_mode
        label: Presentation Mode
        type: string
        description: Optional page presentation mode for route-level enhancements such as internal workspace views.
        defaultValue: standard
    files:
      - path: record.md
        template: page/record.md

  - key: capability
    label: Capabilities
    type: capability
    create_directory: capabilities
    scan_directories:
      - capabilities
    id_strategy: prefixed-slug
    id_prefix: cap
    id_source_fields:
      - name
    name_template: "{{name}}"
    status_field: status
    owner_field: owner
    include_in_initialization: true
    fields:
      - key: name
        label: Name
        type: string
        description: Public capability name.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Accountable role for keeping this capability current.
        required: true
      - key: status
        label: Status
        type: string
        description: Current maturity or publishing status.
        required: true
      - key: headline
        label: Headline
        type: string
        description: Short message used in cards and summaries.
        required: true
      - key: audience
        label: Audience
        type: string
        description: Audience that benefits most from this capability.
        required: true
      - key: value_summary
        label: Value Summary
        type: string
        description: Practical value of the capability.
        required: true
      - key: proof_points
        label: Proof Points
        type: string-array
        description: Inspectable proof or concrete examples.
        required: true
    files:
      - path: record.md
        template: capability/record.md
  - key: account
    label: Account
    type: account
    create_directory: accounts
    scan_directories:
      - accounts
    id_strategy: prefixed-slug
    id_prefix: acct
    id_source_fields:
      - name
    name_template: "{{name}}"
    status_field: status
    owner_field: owner
    fields:
      - key: name
        label: Account Name
        type: string
        description: Company or organization name.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Sales owner for this account.
        required: true
      - key: status
        label: Status
        type: string
        description: Account status (prospect, active, churned).
        required: true
      - key: industry
        label: Industry
        type: string
        description: Industry vertical.
      - key: size
        label: Company Size
        type: string
        description: Employee count range or revenue tier.
      - key: tier
        label: Tier
        type: string
        description: Account tier (enterprise, mid-market, growth).
      - key: arr
        label: ARR
        type: string
        description: Current annual recurring revenue, if customer.
    files:
      - path: record.md
        template: account/record.md

  - key: deal
    label: Deal
    type: deal
    create_directory: deals
    scan_directories:
      - deals
    exclude_directory_names:
      - notes
    id_strategy: prefixed-slug
    id_prefix: deal
    id_source_fields:
      - name
    name_template: "{{name}}"
    status_field: stage
    owner_field: owner
    include_in_initialization: true
    fields:
      - key: name
        label: Deal Name
        type: string
        description: Short deal identifier.
        required: true
      - key: account_id
        label: Account
        type: string
        description: ID of the linked account.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Sales owner.
        required: true
      - key: stage
        label: Stage
        type: string
        description: Pipeline stage (discovery, qualification, proposal, negotiation, closed-won, closed-lost).
        required: true
      - key: value
        label: Value
        type: string
        description: Deal value.
      - key: close_date
        label: Close Date
        type: string
        description: Expected or actual close date.
      - key: probability
        label: Probability
        type: string
        description: Win probability percentage.
      - key: summary
        label: Summary
        type: string
        description: Short deal summary.
    files:
      - path: record.md
        template: deal/record.md

explorer:
  renderers:
    detail:
      site: renderers/site-detail.mjs
      capability: renderers/capability-detail.mjs
      deal: renderers/deal-detail.mjs
      account: renderers/account-detail.mjs
---
