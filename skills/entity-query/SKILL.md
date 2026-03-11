---
name: entity-query
description: Use structured entity workspace helpers before manually reading many records. This skill is for searching, sorting, counting, and inventorying Hermit entity directories and record files.
---

# Entity Query Skill

Use this skill when the task is about understanding or operating on the workspace's `entities/` tree as a collection instead of a single file.

Good fits:
- Find entities by type, status, owner, directory, or free-text hints.
- Sort or list candidate entities before deciding which records to open.
- Summarize the current workspace shape by type, owner, or status.
- Inspect which files and subdirectories commonly exist for each entity type.

Do not use this skill when:
- You already know the exact file to read.
- You only need an exact text match and `rg` is simpler.
- The task is a single-record edit that does not need workspace-wide scanning.

## Approach

1. Start with the helper scripts below to narrow the entity set quickly.
2. Read only the most relevant records after the scripts point you to them.
3. Fall back to `rg` for exact text matches across already-known paths.

## Scripts

All commands assume the current working directory is the Hermit workspace root. If not, pass `--root /absolute/path/to/workspace`.

### 1. Query and sort entities

Use when you need a candidate list.

```bash
node --import tsx skills/entity-query/scripts/query-entities.ts --type deal --status qualification --sort updated --desc --limit 20
```

Useful flags:
- `--type <type>`
- `--status <status>`
- `--owner <owner>`
- `--directory <directory-fragment>`
- `--id <id-fragment>`
- `--name <name-fragment>`
- `--text <free-text>`
- `--sort name|type|status|owner|updated|path|directory`
- `--desc`
- `--limit <n>`
- `--format table|json|paths`

### 2. Summarize the workspace

Use when you need counts and rollups before going deeper.

```bash
node --import tsx skills/entity-query/scripts/summarize-entities.ts --top 10
```

Useful flags:
- `--type <type>`
- `--status <status>`
- `--owner <owner>`
- `--directory <directory-fragment>`
- `--top <n>`
- `--format text|json`

### 3. Inventory entity file layouts

Use when you need to know what usually exists beside `record.md` for a given entity type or directory.

```bash
node --import tsx skills/entity-query/scripts/inventory-entities.ts --group-by type --top 8
```

Useful flags:
- `--type <type>`
- `--directory <directory-fragment>`
- `--group-by type|directory|top-level`
- `--top <n>`
- `--format text|json`

## Recommended Patterns

- Broad discovery: run `summarize-entities.ts` first, then `query-entities.ts`.
- Candidate narrowing: use `query-entities.ts --format paths` and then read the selected `record.md` files.
- File-shape analysis: use `inventory-entities.ts` before assuming a companion file exists for every entity.
- Exact evidence lookup inside a narrowed set: use `rg` on the returned paths instead of the whole repo.

## Notes

- These scripts scan entity directories by locating `record.md` files recursively under `entities/`.
- Results use frontmatter fields like `id`, `type`, `name`, `status`, `owner`, and `updated_at` when present.
- Shared records such as `entities/company/record.md` and `entities/people/*/record.md` are included too.
