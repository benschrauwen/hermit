# Sales entity example (company, deal, person, product)

This folder is a **reference example** for the entity-setup skill. It shows a full sales-oriented entity model:

- **Company** – shared account/context entity (prefixed-slug, `companies/`)
- **Person** – shared contact entity, optional link to company (prefixed-slug, `people/`)
- **Product** – shared catalog entity (prefixed-slug, `products/`)
- **Deal** – operating entity with owner, stage, value; lifecycle dirs and `include_in_initialization` (prefixed-slug, `deals/`)

Use it when designing entity defs for a sales workspace: copy or adapt `entities.md` into `workspace/entity-defs/entities.md` and the type folders under `workspace/entity-defs/<type>/` as needed. Do not treat this directory as live workspace data.
