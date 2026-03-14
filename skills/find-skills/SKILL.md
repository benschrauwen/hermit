---
name: find-skills
description: Search `skills.sh` and ClawHub for reusable skills, then install only after user confirmation.
---

# Find Skills

Use when:
- The user wants an existing reusable skill.
- The user asks how to add a capability.

Do not use when:
- The user wants the task done directly.
- You already know the exact local skill file to use.

Steps:
1. Turn the request into a 2-4 keyword query.
2. Search `npx skills find "<query>"` and/or `clawhub search "<query>"`.
3. Show the best matches with reason, install command, and source link.
4. Install only after the user confirms.
5. Tell the user if a restart or new session is needed.

Commands:

```bash
npx skills find "react performance"
npx skills add <owner/repo@skill> -y
npx skills check
clawhub search "postgres backups"
clawhub info <slug>
clawhub install <slug>
```

Rules:
- Default to project-local install.
- Use global install only if the user asks for it and the environment allows it.
- `clawhub install <slug>` installs into `./skills` by default; use `--workdir <path>` if needed.
- Show unfamiliar public skills before installing them.

Present matches like this:

```text
1. <skill-name> - why it fits
Install: <command>
Source: <url>
```

If nothing fits:
- Say no strong match was found.
- Offer to do the task directly.
- Suggest creating a custom skill if the workflow is recurring.
