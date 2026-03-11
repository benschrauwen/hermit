import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  createCheckpoint,
  getRepoState,
  listChangedFiles,
  shouldCheckpoint,
} from "../src/git.js";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(testsDir, "..");

function runGit(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
  }).trim();
}

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function createGitWorkspace(): string {
  const tmpRoot = path.join(workspaceRoot, ".tmp-tests");
  mkdirSync(tmpRoot, { recursive: true });
  const root = mkdtempSync(path.join(tmpRoot, "hermit-git-"));
  runGit(root, ["init", "--initial-branch=main"]);
  runGit(root, ["config", "user.name", "Hermit Tests"]);
  runGit(root, ["config", "user.email", "hermit-tests@example.com"]);

  writeFile(root, "README.md", "# Workspace\n");
  writeFile(root, "docs/architecture.md", "# Architecture\n");
  writeFile(root, "agents/role-a/AGENTS.md", "# Role A\n");

  runGit(root, ["add", "README.md", "docs/architecture.md", "agents/role-a/AGENTS.md"]);
  runGit(root, ["commit", "-m", "chore: initial workspace"]);

  return root;
}

describe("git runtime helpers", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("lists all changed files in the repository", async () => {
    const root = createGitWorkspace();
    roots.push(root);

    writeFile(root, "docs/architecture.md", "# Architecture\n\nUpdated.\n");
    writeFile(root, "misc/notes.txt", "hello\n");

    expect(await listChangedFiles(root)).toEqual(["docs/architecture.md", "misc/notes.txt"]);
  });

  it("reports head summary and dirty state for relevant workspace changes", async () => {
    const root = createGitWorkspace();
    roots.push(root);

    writeFile(root, "agents/role-a/AGENTS.md", "# Role A\n\nUpdated guidance.\n");

    const state = await getRepoState(root);
    expect(state).toMatchObject({
      branch: "main",
      headSubject: "chore: initial workspace",
      dirty: true,
      changedFiles: ["agents/role-a/AGENTS.md"],
    });
    expect(state?.headSha).toMatch(/^[a-f0-9]{40}$/);
    expect(state?.headShortSha).toMatch(/^[a-f0-9]+$/);
  });

  it("creates a checkpoint commit for all changed files", async () => {
    const root = createGitWorkspace();
    roots.push(root);

    writeFile(root, "docs/architecture.md", "# Architecture\n\nCheckpoint me.\n");
    writeFile(root, "misc/extra.txt", "extra\n");

    const checkpoint = await createCheckpoint(root, {
      commandName: "heartbeat",
      roleId: "role-a",
      phase: "after",
      sessionId: "session-123",
    });

    expect(checkpoint?.checkpointSha).toMatch(/^[a-f0-9]{40}$/);
    expect(checkpoint?.changedFiles).toEqual(["docs/architecture.md", "misc/extra.txt"]);

    const latestCommit = runGit(root, ["log", "-1", "--pretty=%s%n%b"]);
    expect(latestCommit).toContain("chore(checkpoint): after heartbeat role-a");
    expect(latestCommit).toContain("Hermit-Command: heartbeat");
    expect(latestCommit).toContain("Hermit-Role: role-a");
    expect(latestCommit).toContain("Hermit-Phase: after");
    expect(latestCommit).toContain("Hermit-Session: session-123");

    const status = runGit(root, ["status", "--porcelain"]);
    expect(status).toBe("");
  });

  it("only checkpoints when the repository is dirty", () => {
    expect(shouldCheckpoint(undefined)).toBe(false);
    expect(shouldCheckpoint({ dirty: false })).toBe(false);
    expect(shouldCheckpoint({ dirty: true })).toBe(true);
  });
});
