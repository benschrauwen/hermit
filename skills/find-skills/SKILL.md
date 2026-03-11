---
name: find-skills
description: Discover reusable agent skills from `skills.sh` and ClawHub, then install them when the user wants extra capabilities. Use when the user asks for a skill, wants to extend the agent, or describes a common workflow that may already exist as a packaged skill.
---

# Find Skills

Use this skill when the user is looking for an existing reusable skill rather than a one-off answer.

Good fits:
- "Find a skill for X."
- "Is there a skill that can do this?"
- "Can we add support for X?"
- "I wish the agent were better at X."
- "How do I install more skills?"

Do not use this skill when:
- The user just wants you to do the task directly and is not asking about reusable capabilities.
- You already know the exact local skill file to read or edit.

## Workflow

1. Clarify the domain and task in a short search query.
2. Search one or both registries:
   - `skills.sh` via `npx skills find`
   - ClawHub via `clawhub search`
3. Present the best matches with a one-line explanation, install command, and link.
4. Install only after the user confirms.
5. Tell the user to start a new session or restart the tool if needed so the new skill is picked up.

## Search Sources

### 1. `skills.sh` / Skills CLI

Use this source when the user wants skills from the open agent skills ecosystem.

Common commands:

```bash
npx skills find "react performance"
npx skills add vercel-labs/agent-skills@vercel-react-best-practices
npx skills check
npx skills update
```

Browse: https://skills.sh/

Result shape usually includes an install target like:

```text
Install with npx skills add <owner/repo@skill>
```

Install for the user only after confirmation.
Default to a project-local install in the current workspace.
Use global install only if the user explicitly asks for it and the environment allows home-directory writes.

```bash
npx skills add <owner/repo@skill> -y
```

### 2. ClawHub

Use this source when the user wants OpenClaw-compatible skills or asks about skills from https://clawhub.ai/.

Common commands:

```bash
clawhub search "postgres backups"
clawhub info my-skill
clawhub install my-skill
clawhub update --all
clawhub list
```

If the CLI is missing, install it first:

```bash
npm i -g clawhub
```

Important behavior:
- `clawhub install <slug>` installs into `./skills` under the current working directory by default.
- In sandboxed environments, prefer workspace-local installation and avoid assumptions about home-directory access.
- If you are not in the workspace root, use `--workdir <path>` so the skill lands in the intended workspace.
- ClawHub is public and open. Prefer showing the user the skill info or page before installing unfamiliar skills.

Browse: https://clawhub.ai/

## How To Search Well

- Start with 2-4 concrete keywords, not a full sentence.
- Combine domain + task, like `react testing`, `terraform deploy`, or `calendar sync`.
- Try one synonym pass if the first search is weak.
- Search both sources when the user did not name a registry and the task sounds common.

## How To Present Matches

Prefer a compact format:

```text
I found two likely fits.

1. <skill-name> - short reason it matches
   Install: <command>
   Source: <url>

2. <skill-name> - short reason it matches
   Install: <command>
   Source: <url>
```

Include:
- The skill name or slug
- Why it matches the user's task
- The exact install command
- A source link

If both registries have good options, say which ecosystem each result belongs to.

## Install Guidance

Only install after the user says yes.

Default to project-local install because many agent environments are sandboxed and only allow writes inside the workspace.

Use:

```bash
npx skills add <owner/repo@skill> -y
```

If the user explicitly wants a global install and the environment allows it:

```bash
npx skills add <owner/repo@skill> -g -y
```

Or for ClawHub in the workspace root:

```bash
clawhub install <slug>
```

If not already in the workspace root:

```bash
clawhub install <slug> --workdir <path>
```

After install:
- Tell the user where the skill was installed if that matters.
- Tell the user to start a new session or restart the app/tool if the runtime does not hot-reload skills.

## If Nothing Good Shows Up

If search results are weak or empty:
- Say that you did not find a strong existing skill match.
- Offer to do the task directly.
- If the need seems recurring, suggest creating a custom skill instead.

Example fallback:

```text
I did not find a strong packaged skill for that yet.
I can still help with the task directly.
If this is a recurring workflow, we can also create a project-local skill for it.
```
