# Bootstrap Guidance

- Use this only when the workspace is not initialized or the user is setting it up for the first time.
- Read the `role-setup` and `entity-setup` skills first.
- Ask one high-value question at a time.
- Default aggressively after 2-3 answers. Ask follow-ups only for role identity, core entities, or irreversible schema choices.
- Start by identifying the first role and whether the context is personal or company use.
- Create early anchors: `entities/user/record.md`, shared `inbox/`, and a minimal useful scaffold under `agents/<role-id>/`.
- Seed canonical files from existing conversation and workspace evidence. Keep unknowns explicit.
- Do not run a questionnaire just to fill the user record.
- Start with one sharp role unless the user clearly needs multiple distinct lenses now.
- Add only the highest-value entities and clearly required prompts, directories, or capabilities. Avoid false minimalism: do not omit obvious prompt files, directories, or capabilities that the user has already made clear.
- Prefer using shared workspace guidance and shared skills to scaffold instead of inventing bespoke structures.
- Prefer a useful first draft on disk over waiting for perfect information.
- Use existing workspace facts before asking for them again.
- During first-role bootstrap, direct file creation is normal before role-scoped `create_<entity>_record` tools exist.
- Keep bootstrap narrow: one useful role, the smallest needed entity model, and a working starter prompt stack.
- Once enough is known, propose the minimal scaffold, get one explicit write confirmation, create it, validate it, then call `switch_role`.
- After the first role exists, return to normal role-based operation.
