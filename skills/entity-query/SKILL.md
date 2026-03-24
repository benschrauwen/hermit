---
name: entity-query
description: Query the workspace `entities/` tree with helper scripts before manually reading many records.
---

# Entity Query

Use when:
- You need to search, sort, count, or inventory many entities.

Do not use when:
- You already know the exact file.
- An exact text search on known paths is enough.
- The task is a single-record edit.

Steps:
1. Run `summarize-entities.ts` for counts and rollups.
2. Run `query-entities.ts` to narrow candidates.
3. Read only the returned `record.md` files.
4. Run `inventory-entities.ts` only if you need typical companion files.
5. Use `rg` on narrowed paths for exact text.

Commands:

```bash
node --import tsx skills/entity-query/scripts/summarize-entities.ts --top 10
node --import tsx skills/entity-query/scripts/query-entities.ts --type deal --status qualification --sort updated --desc --limit 20
node --import tsx skills/entity-query/scripts/inventory-entities.ts --group-by type --top 8
```

Key flags:
- `query-entities.ts`: `--type`, `--status`, `--owner`, `--directory`, `--id`, `--name`, `--text`, `--sort`, `--desc`, `--limit`, `--format table|json|paths`
- `summarize-entities.ts`: `--type`, `--status`, `--owner`, `--directory`, `--top`, `--format text|json`
- `inventory-entities.ts`: `--type`, `--directory`, `--group-by type|directory|top-level`, `--top`, `--format text|json`

Notes:
- Run from the workspace root. In the default nested setup that is `workspace/`. Otherwise pass `--root /absolute/path/to/workspace`.
- These scripts scan the workspace `entities/` tree for `record.md`.
- Frontmatter fields like `id`, `type`, `name`, `status`, `owner`, and `updated_at` are used when present.
