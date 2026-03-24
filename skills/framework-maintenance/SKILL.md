---
name: framework-maintenance
description: Maintain the Hermit framework repo separately from workspace data, including framework PR and update flows.
---

# Framework Maintenance

Use this skill when the task is about the Hermit framework repository itself rather than workspace state in the workspace repo's `entities/`, `agents/`, `entity-defs/`, `inbox/`, or workspace-local skills.

## Intent

- Keep framework changes reviewable and pushable as normal GitHub pull requests.
- Keep workspace data versioned separately and out of framework PRs.
- Prefer normal `git` and `gh` commands over custom wrapper commands.

## Preconditions

- The framework repo and workspace repo must be separate git repos.
- By default, the workspace repo lives at `./workspace` under the Hermit checkout.
- Run framework-maintenance commands from the framework repo, not from the workspace repo.
- Do not push the workspace repo automatically.

## Rules

- Treat the framework repo and workspace repo as separate histories.
- Before creating a PR, make sure the framework repo has no uncommitted changes and that the branch diff contains only framework files.
- When updating from upstream, prefer `ff-only` unless the user explicitly wants a merge commit or rebase.
- If the framework checkout and workspace are the same repo, stop and explain that Hermit requires a separate workspace repo.

## Inspect Status

Run:

```bash
git status --short --branch
git remote -v
git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}"
```

If the upstream ref exists, compare ahead/behind:

```bash
git rev-list --left-right --count "@{upstream}...HEAD"
```

## Create A Framework PR

1. Confirm you are in the framework repo and the tree is clean:

```bash
git status --short --branch
```

2. If needed, create a branch:

```bash
git switch -c hermit/<short-topic>
```

3. Review commits that will go into the PR:

```bash
git log --reverse --pretty=%s main...HEAD
```

4. Push the branch:

```bash
git push -u origin HEAD
```

5. Create the PR:

```bash
gh pr create --base main --head "$(git branch --show-current)"
```

When drafting the PR body, use:

```markdown
## Summary
- <bullet 1>
- <bullet 2>

## Test plan
- [ ] Run `npm test`
- [ ] Run `npm run check`
```

## Update From Upstream Main

Fetch first:

```bash
git fetch upstream --tags
```

Preferred fast-forward update:

```bash
git merge --ff-only upstream/main
```

If the user explicitly wants a rebase instead:

```bash
git rebase upstream/main
```

## Update To Latest Release Tag

Fetch tags, inspect the newest tags, then update:

```bash
git fetch upstream --tags
git tag --sort=-version:refname | head
git merge --ff-only <latest-tag>
```

If a fast-forward is not possible, stop and explain the situation before choosing merge or rebase.

## Good Uses

- Runtime code changes in `src/`
- Explorer or docs changes that belong to Hermit itself
- Built-in prompts, templates, and built-in framework skills
- Preparing or updating a framework PR
- Pulling a new framework release into the local framework checkout

## Not This Skill

- Routine entity updates
- Role backlog cleanup
- Workspace-local skill or prompt changes that belong to a user's workspace
- Pushing workspace data anywhere
