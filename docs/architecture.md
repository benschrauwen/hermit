# Architecture Design

## Purpose

Hermit implements a local, file-first runtime for autonomous applications. In the current workspace, that runtime is applied to a multi-role leadership agent system. The workspace stays the system of record while the runtime remains a thin, deterministic orchestration layer around markdown files and a reusable agent session runtime.

## Core Idea

Separate the workspace into:

- shared root context in `company/` and `people/`
- role-local workspaces in `roles/<role-id>/`

Each role directory contains its own:

- `role.md` manifest
- `AGENTS.md` prompt index
- `agent/` operating system
- `prompts/` role-specific reusable instructions
- `templates/` markdown scaffold templates
- role-specific entity directories such as `deals/`, `tickets/`, or `campaigns/`

Shared prompts live at the workspace root in `prompts/`. Role-specific prompts live in `roles/<role-id>/prompts/`.

This keeps the shared organization context canonical while allowing each leadership role to define its own domain model and its own prompt overlays without changing the generic orchestration code.

## Design Principles

### 1. File-first system of record

Business state lives in markdown files and directories, not in a database. Shared truth and role-local truth are both inspectable, portable, and versionable.

### 2. File-defined role contracts

Roles are defined primarily by markdown and frontmatter:

- `role.md` defines the role contract
- shared prompts live under `prompts/`
- role-specific prompts live under `roles/<role-id>/prompts/`
- scaffold templates live under `roles/<role-id>/templates/`

This makes new roles mostly a file-creation exercise instead of a TypeScript refactor.

### 3. Deterministic orchestration stays in code

TypeScript still owns:

- CLI routing
- role resolution
- safe writes
- ID generation
- initialization checks
- validation
- transcript evidence placement
- tool wiring

Markdown defines structure and starter content. Code defines behavior that must stay predictable.

### 4. Shared core, role extension

The runtime should not know what a deal, ticket, or campaign is. It should know how to load a role manifest, render templates, scan entities, and run a session for the selected role.

### 5. Read-only explorer on top of the same workspace

The local explorer is a separate Astro app under `explorer/`, but it is intentionally not a second source of truth and not a second domain model. It is a read-only browser for the same file-first workspace.

The explorer should:

- read the shared root context from `company/` and `people/`
- read role manifests and scanned entities from the same root TypeScript runtime used by the CLI
- render markdown files directly instead of copying data into a database or API layer
- stay thin enough that adding a new role or entity type is still primarily a manifest-and-files exercise

## High-Level Flow

```mermaid
flowchart TD
  cli[CLI] --> roleResolver[RoleResolver]
  explorer[Explorer] --> explorerLoader[Explorer Loader]
  explorerLoader --> workspaceDist[dist roles_workspace]
  roleResolver --> roleManifest[role.md]
  roleManifest --> promptCatalog[prompt_catalog]
  promptCatalog --> promptLibrary[PromptLibrary]
  roleManifest --> promptBundles[prompt_bundles]
  roleManifest --> templateLibrary[TemplateLibrary]
  roleManifest --> workspaceRules[WorkspaceRules]
  workspaceRules --> sharedData[company_people]
  workspaceRules --> roleData[roles_roleId]
  promptLibrary --> sessionFactory[SessionFactory]
  promptBundles --> sessionFactory
  templateLibrary --> workspaceCore[WorkspaceCore]
  workspaceDist --> workspaceRules
  workspaceRules --> doctor[Doctor]
```

## Module Responsibilities

### `src/cli.ts`

Parses commands, resolves the workspace root, resolves or infers `--role`, and starts the right flow. The published CLI name is `hermit`.

Normal `chat` and `ask` sessions take the role and the user prompt. The user points the agent at the right deal, product, or person inside the conversation, and the agent resolves that target from the workspace files or `entity_lookup` when needed. `ingest transcript` accepts `--entity` because evidence placement benefits from an explicit deterministic target.

### `src/roles.ts`

Loads and validates `roles/<role-id>/role.md`, lists available roles, infers the current role from the working directory when possible, and resolves prompt IDs to either the shared prompt directory or the role-local prompt directory.

### `src/prompt-library.ts`

Loads the selected role's `AGENTS.md` and required prompts declared in `role.md`, then renders the small bootstrapping prompt bundle for the session with lightweight placeholders such as `{{workspaceRoot}}`, `{{roleRoot}}`, `{{entityId}}`, and `{{transcriptPath}}`.

Those entity placeholders are optional context, not a requirement for normal chat. Most interactive sessions start unanchored, with `entityId` and `entityPath` left as `not-selected` until the agent resolves the target from the request and the files.

Important: prompt loading is intentionally a little more explicit than template loading because prompts come from two different scopes and must stay non-ambiguous.

- `prompt_catalog` in `role.md` maps a stable prompt ID to a `scope` (`shared` or `role`) and a file name.
- `required_prompts` defines the full set of prompt IDs the role is allowed to load and that doctor should validate.
- `prompt_bundles` defines the small set of base prompt groups the runtime injects automatically, typically `default`, `onboarding`, and `transcript-ingest`.
- `AGENTS.md` is the human-readable prompt index for the role and must link to every required prompt file, including shared prompts referenced via relative paths like `../../prompts/...`.

### `src/template-library.ts`

Loads markdown starter templates from disk and performs simple placeholder substitution. It intentionally avoids becoming a full templating engine.

### `src/workspace.ts`

Owns shared and role-local path resolution, scaffold creation, shared record creation, generic role-entity creation, entity scanning, transcript matching, and evidence placement.

### `explorer/`

A local Astro SSR app that provides a read-only browser for the workspace.

It is intentionally thin:

- routes live under `explorer/src/pages/`
- shared markdown parsing helpers live under `explorer/src/lib/entity-content.ts`
- root workspace and role loading adapters live under `explorer/src/lib/workspace.ts`

Instead of duplicating business logic, the explorer dynamically imports the built root modules from `dist/roles.js` and `dist/workspace.js`, then reuses:

- role listing
- role manifest loading
- generic entity scanning
- entity lookup by type

This means the CLI and explorer read the same role and entity model, while the explorer stays read-only.

Current route model:

- `/` shows the explorer home page with links to shared and role-local areas
- `/company` renders the shared company markdown files
- `/people` lists shared people records
- `/people/:personId` renders a person's markdown files such as `record.md` and `development-plan.md`
- `/roles/:roleId` shows a role overview
- `/roles/:roleId/agent` renders `agent/record.md` and `agent/inbox.md` for that role
- `/roles/:roleId/:entityType` renders a generic list view for that entity type using role manifest field metadata
- `/roles/:roleId/:entityType/:entityId` renders the entity detail view from the markdown files declared in the role manifest

The explorer has no write path. Any canonical update still happens through normal file edits or the CLI runtime.

### `src/session.ts`

Builds configured agent sessions for the selected role, chooses the base prompt set for startup, wires standard tools plus role-aware custom tools, and handles persisted sessions per role.

Session prompt assembly works like this:

1. Resolve the role and load its prompt catalog.
2. Load all prompt IDs listed in `required_prompts`.
3. Choose a base bundle from `prompt_bundles` based on session kind and initialization state.
4. Render only that base bundle into one concatenated prompt string using the current prompt context.
5. Append that rendered prompt string to the base system prompt for the agent runtime.

For normal `chat` and `ask`, prompt context usually includes the workspace and role but not a preselected entity. The startup prompt explicitly tells the agent to resolve the relevant deal, product, or person during the session before going deep, then read additional role prompt files on demand when they are relevant. Transcript ingest is the main path that still commonly starts with an explicit entity target.

The runtime does not inject all prompts all the time. `required_prompts` is the validated prompt universe for the role. `prompt_bundles` is only the small startup set that gets injected automatically for a given session kind.

### `src/agent-tools.ts`

Defines generic tools such as:

- `entity_lookup`
- `web_search`
- shared record creation tools
- role-derived entity creation tools from the manifest

### `src/ingest.ts`

Runs transcript ingest only for roles that declare a transcript-ingest capability in their manifest.

### `src/doctor.ts`

Validates the shared workspace plus the selected role contract, including prompt links, required files, duplicate IDs, and placeholder drift.

For prompts specifically, doctor verifies:

- every required prompt ID resolves through the role's `prompt_catalog`
- every required prompt file exists in the correct scope
- every configured startup bundle references known prompt IDs
- transcript-ingest prompt references stay inside the same prompt catalog
- `AGENTS.md` links match the resolved prompt file paths

## Workspace Contract

### Shared root

- `company/`
- `people/`
- `prompts/`
- `roles/`
- `templates/shared/`
- `explorer/`

### Per role

- `roles/<role-id>/role.md`
- `roles/<role-id>/AGENTS.md`
- `roles/<role-id>/agent/`
- `roles/<role-id>/prompts/` for role-only overlays
- `roles/<role-id>/templates/`
- role-specific entity directories from the manifest

## Prompt Contract

The prompt system uses four separate concepts on purpose, but only a small subset is injected automatically at session start:

### 1. `prompt_catalog`

This is the authoritative map from prompt ID to file location.

Each entry declares:

- the stable prompt ID used by code and startup bundles
- the `scope`: `shared` or `role`
- the backing file name inside that scope

Example:

```yaml
prompt_catalog:
  core-soul:
    scope: shared
    file: 00-soul.md
  sales-standard:
    scope: role
    file: 25-role-sales.md
```

Why this exists:

- avoids filename collisions between shared and role-local prompts
- lets startup bundles stay stable even if file names change later
- keeps scope explicit instead of inferring it from path conventions

### 2. `required_prompts`

This is the validated prompt universe for the role.

It means:

- these prompt IDs must exist
- these prompt files must be loadable
- these prompt files must be indexed in `AGENTS.md`

It does not mean every prompt is injected into every session.

### 3. `prompt_bundles`

This maps a session kind to the exact ordered list of prompt IDs that should be injected at startup.

In practice, keep this small: it is mainly for `default`, `onboarding`, and `transcript-ingest`, not for every task-specific prompt the agent might later read on demand.

Example:

```yaml
prompt_bundles:
  default:
    - core-soul
    - file-rules
    - routing
    - sales-standard
    - agent-ops
```

This is how the runtime combines a small shared-and-role startup prompt safely in one session without overlap-by-accident.

### 4. `AGENTS.md`

This is the human prompt index for the role.

It is not the source of truth for prompt resolution, but it must stay aligned with the manifest because it gives both humans and the runtime a readable map of the available prompt files.

For a role with shared and role-local prompts, `AGENTS.md` will usually link to both:

- shared prompts via `../../prompts/...`
- role prompts via `prompts/...`

It should also be semantically readable by the agent and the operator. Prefer light grouping and short labels such as "base startup prompts", "deal", "pipeline", "incident", or "people" so the right prompt can be found quickly during a session.

## Why Prompt Loading Is More Explicit Than It Looks

The extra prompt-loading structure is deliberate, not accidental complexity.

The runtime needs to support all of the following at once:

- one shared prompt library reused by multiple roles
- role-local prompt overlays
- a small set of startup bundles for normal chat, onboarding, and transcript ingest
- on-demand prompt discovery during the session
- optional entity context instead of mandatory session preselection
- deterministic validation with helpful doctor errors
- no accidental shadowing where two prompts with the same filename mean different things

Using prompt IDs plus explicit scope in `role.md` solves that cleanly while keeping the runtime generic.

## Why The Template Mechanism Is Generic

Templates are defined generically rather than hardcoded in TypeScript for each business object. Instead:

- role manifests declare which files each entity needs
- markdown templates provide starter content
- TypeScript computes dynamic values such as IDs, timestamps, ownership, and source references

That keeps the mechanism generic while keeping behavior deterministic.

## Extension Model

To add a new role:

1. Create `roles/<role-id>/role.md`
2. Add prompt catalog entries for shared and role-local prompts
3. Add `AGENTS.md`, role prompts, and templates
4. Define entity types, fields, and any startup bundles in frontmatter
5. Optionally declare transcript ingest if that role needs it

No orchestration changes should be required for a standard role.

## Explorer Design Notes

The explorer deliberately sits one level above the canonical files rather than in front of a custom API.

Why:

- the workspace is already the system of record
- the root runtime already knows how to load roles and scan entities generically
- markdown files are the display payload, so adding a persistence or serialization layer would add complexity without changing the source of truth

In practice, this means:

- shared pages such as `company` and `people` read markdown from disk directly
- role pages reuse the root `dist/` modules for manifest-aware scanning
- role entity lists are driven by manifest metadata, not hardcoded per entity type
- role detail pages render the markdown files declared by each entity definition
- role manifests may optionally declare explorer renderers for entity detail pages or specific entity files, with fallback to the default markdown renderer

Optional role-local explorer renderers live under the role directory and are referenced from `role.md`, for example:

```yaml
explorer:
  renderers:
    detail:
      deal: explorer/renderers/deal-detail.mjs
    files:
      deal:
        meddicc.md: explorer/renderers/deal-meddicc.mjs
```

Each renderer module is loaded dynamically by the explorer at runtime. Detail renderers can replace the full entity detail body for a given entity type. File renderers can replace the default rendering for a specific file like `meddicc.md`. If no matching renderer is declared, the explorer uses the built-in generic markdown view.
