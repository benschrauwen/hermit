import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  createCheckpoint,
  getRepoState,
  isGitRepository,
  listChangedFiles,
  shouldCheckpointAfterTurn,
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
    rmSync(path.join(root, "agents", "role-a", "AGENTS.md"));

    const checkpoint = await createCheckpoint(root, {
      commandName: "heartbeat",
      roleId: "role-a",
      phase: "after",
      sessionId: "session-123",
      outcome: "success",
    });

    expect(checkpoint?.checkpointSha).toMatch(/^[a-f0-9]{40}$/);
    expect(checkpoint?.changedFiles).toEqual(["agents/role-a/AGENTS.md", "docs/architecture.md", "misc/extra.txt"]);

    const latestCommit = runGit(root, ["log", "-1", "--pretty=%s%n%b"]);
    expect(latestCommit).toContain("chore(checkpoint): after heartbeat role-a");
    expect(latestCommit).toContain("Hermit-Command: heartbeat");
    expect(latestCommit).toContain("Hermit-Role: role-a");
    expect(latestCommit).toContain("Hermit-Phase: after");
    expect(latestCommit).toContain("Hermit-Outcome: success");
    expect(latestCommit).toContain("Hermit-Session: session-123");

    const status = runGit(root, ["status", "--porcelain"]);
    expect(status).toBe("");
  });

  it("does not treat a nested folder inside another repo as its own repository", async () => {
    const root = createGitWorkspace();
    roots.push(root);
    const nestedWorkspace = path.join(root, "workspace");
    mkdirSync(nestedWorkspace, { recursive: true });

    expect(await isGitRepository(root)).toBe(true);
    expect(await isGitRepository(nestedWorkspace)).toBe(false);
    expect(await listChangedFiles(nestedWorkspace)).toEqual([]);
  });

  it("only checkpoints when enabled and the repository is dirty", () => {
    expect(shouldCheckpointAfterTurn(undefined, undefined, "success")).toBe(false);
    expect(shouldCheckpointAfterTurn({ dirty: false }, { dirty: false }, "success")).toBe(false);
    expect(shouldCheckpointAfterTurn({ dirty: false }, { dirty: true }, "success")).toBe(true);
    expect(shouldCheckpointAfterTurn({ dirty: false }, { dirty: true }, "failed")).toBe(true);
    expect(shouldCheckpointAfterTurn({ dirty: true }, { dirty: true }, "success")).toBe(false);
    expect(shouldCheckpointAfterTurn({ dirty: false }, { dirty: true }, "aborted")).toBe(false);
    expect(shouldCheckpointAfterTurn({ dirty: false }, { dirty: true }, "success", false)).toBe(false);
  });
});
