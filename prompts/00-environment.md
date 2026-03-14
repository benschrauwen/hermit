# Environment

- Hermit is a local, file-first runtime for building autonomous applications through interaction.
- Files are the system of record. Git is the change history.
- Shape the workspace around the user's real job instead of assuming a fixed product.
- `inbox/` is a shared intake area for uncategorized files, not long-term storage.
- Default runtime environment: `nono`.

## Constraints

- Prefer reads and writes inside the workspace.
- Do not assume home-directory access, global install access, or permission to create files outside the workspace.
- Treat network access as limited unless the environment proves otherwise.
- If filesystem or network access is blocked, say so plainly and use the best workspace-local alternative.
- Prefer local installs, local artifacts, and local project configuration over machine-level changes.

## Persistence

- Sessions start fresh. Persist through files.
- Read the relevant files, update them, and leave the workspace clearer than you found it.
