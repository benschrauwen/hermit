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
3. Run `query-graph.ts` when you need relationship traversal, broken-reference checks, or path finding.
4. Read only the returned `record.md` files.
5. Run `inventory-entities.ts` only if you need typical companion files.
6. Use `rg` on narrowed paths for exact text.

Commands:

```bash
node --import tsx skills/entity-query/scripts/summarize-entities.ts --top 10
node --import tsx skills/entity-query/scripts/query-entities.ts --type deal --status qualification --sort updated --desc --limit 20
node --import tsx skills/entity-query/scripts/query-graph.ts --role sales --query summary
node --import tsx skills/entity-query/scripts/query-graph.ts --role sales --query neighbors --entity deal-acme-enterprise --direction both
node --import tsx skills/entity-query/scripts/inventory-entities.ts --group-by type --top 8
```

Key flags:
- `query-entities.ts`: `--type`, `--status`, `--owner`, `--directory`, `--id`, `--name`, `--text`, `--sort`, `--desc`, `--limit`, `--format table|json|paths`
- `query-graph.ts`: `--role`, `--query summary|neighbors|subgraph|path|broken`, `--entity`, `--from`, `--to`, `--direction incoming|outgoing|both`, `--edge-type`, `--depth`, `--max-depth`, `--format text|json`
- `summarize-entities.ts`: `--type`, `--status`, `--owner`, `--directory`, `--top`, `--format text|json`
- `inventory-entities.ts`: `--type`, `--directory`, `--group-by type|directory|top-level`, `--top`, `--format text|json`

Notes:
- Run from the workspace root. In the default nested setup that is `workspace/`. Otherwise pass `--root /absolute/path/to/workspace`.
- These scripts scan the workspace `entities/` tree for `record.md`.
- Frontmatter fields like `id`, `type`, `name`, `status`, `owner`, and `updated_at` are used when present.
- `query-graph.ts` builds the relationship graph in memory on demand from the current markdown state; it does not persist an index.
