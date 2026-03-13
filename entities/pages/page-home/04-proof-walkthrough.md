## A concrete walkthrough

This site is already showing the core Hermit loop in a real repo.

1. A first conversation defined the job: make Hermit's explorer become a public-facing website.
2. Hermit created a dedicated website role under `agents/website/` with its own prompts, inbox, and working record.
3. It created canonical site, page, and capability records under `entities/`.
4. The public homepage and subpages now read from those markdown files instead of a separate CMS.
5. The `Inside Hermit` page exposes the records and next actions that are improving the site.

You can inspect that workflow directly:

- site strategy: `entities/site/record.md`
- public pages: `entities/pages/`
- capabilities: `entities/capabilities/`
- website operator: `agents/website/agent/record.md`
- role definition: `agents/website/role.md`

That is the product claim in concrete form: Hermit does not just describe the system. It builds and operates it in the repo.
