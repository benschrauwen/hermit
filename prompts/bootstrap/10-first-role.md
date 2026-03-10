# Bootstrap Guidance

Apply these instructions when the workspace is not initialized yet or the user is clearly trying to set up the system for the first time.

## Objective

Help the user bootstrap the first role with a focused, file-first setup that is complete enough to be genuinely useful instead of forcing them through a giant form.

## Behavior

- Read the `role_setup` and `entity_setup` skills first.
- Ask one high-value question at a time.
- For common first-role setups, default aggressively after 2-3 answers and only ask follow-up questions that change role identity, core entity types, or irreversible schema choices.
- Start by identifying the first role the user wants and whether this is primarily for personal use or company use.
- Create a shared singleton user record at `entities/user/record.md` early in bootstrap as the default human-context anchor for future sessions.
- Assume there is only one user talking to the system unless the workspace files say otherwise.
- Seed the user record from what is already evident in the conversation and workspace, and keep unknowns explicit.
- Do not ask a bootstrap questionnaire just to fill out the user record.
- Create the smallest complete role scaffold under `agents/<role-id>/` instead of a hollow minimum shell.
- Prefer using shared workspace guidance and shared skills to scaffold the first role instead of inventing bespoke structures.
- Start with the role's highest-value entities and any shared context the user wants before collecting every possible detail.
- Use what already exists in the workspace before asking for it again.
- Use the workspace files first; if key onboarding facts are still missing, ask the user directly instead of inventing them.
- During first-role bootstrap, it is normal for role-scoped `create_<entity>_record` tools to not exist yet. Create `entity-defs/entities.md`, templates, and starter files directly when needed, then use deterministic create tools after the role and entity schema load successfully.
- Make unknowns explicit in canonical files instead of guessing.
- Keep the bootstrap narrow: one useful role, the smallest needed entity model, and a working starter prompt stack.
- When recurring work modes are already obvious from the user's description, create the matching role-local prompt files in the first pass instead of leaving the prompt index empty.
- When extra working directories or optional capabilities are clearly required for the role to function well, include them in the first pass instead of deferring them automatically.
- Once enough is known, propose the minimal scaffold, ask for one explicit write confirmation, then create it.
- Once a role exists, shift back to the normal role-based operating model.

## Priorities

- Create the smallest useful set of canonical records early so later work has anchors on disk.
- Make `entities/user/record.md` one of those early anchors so user preferences and context can accumulate over time.
- Add shared and role-managed entities incrementally as the user provides enough detail.
- Prefer a useful first draft on disk over waiting for perfect information.
- Preserve open questions in the relevant canonical files so future sessions can close the gaps.
- Avoid false minimalism. A first draft should stay focused, but should not omit obvious prompt files, directories, or capabilities that the user has already made clear.
