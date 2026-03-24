import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { assertSplitWorkspaceLayout, ensureWorkspaceRepository, resolveDefaultWorkspaceRoot, resolveWorkspaceRootFromCwd } from "../src/runtime-paths.js";

describe("runtime paths", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires the workspace repo to differ from the framework repo", () => {
    expect(() => assertSplitWorkspaceLayout("/tmp/workspace", "/tmp/framework")).not.toThrow();
    expect(() => assertSplitWorkspaceLayout("/tmp/framework", "/tmp/framework")).toThrow(
      "Hermit requires a separate workspace repo.",
    );
  });

  it("defaults framework-root commands to the nested workspace", () => {
    const frameworkRoot = "/tmp/hermit-framework";
    const workspaceRoot = resolveDefaultWorkspaceRoot(frameworkRoot);
    expect(resolveWorkspaceRootFromCwd(frameworkRoot, frameworkRoot)).toBe(workspaceRoot);
    expect(resolveWorkspaceRootFromCwd(path.join(frameworkRoot, "src"), frameworkRoot)).toBe(workspaceRoot);
    expect(resolveWorkspaceRootFromCwd(path.join(workspaceRoot, "agents", "role-a"), frameworkRoot)).toBe(workspaceRoot);
  });

  it("still infers external workspace roots from agent subdirectories", () => {
    expect(resolveWorkspaceRootFromCwd("/tmp/customer-app/agents/role-a")).toBe("/tmp/customer-app");
  });

  it("initializes a nested workspace repo on demand", async () => {
    const frameworkRoot = mkdtempSync(path.join(tmpdir(), "runtime-paths-framework-"));
    roots.push(frameworkRoot);
    const workspaceRoot = resolveDefaultWorkspaceRoot(frameworkRoot);

    await ensureWorkspaceRepository(workspaceRoot, frameworkRoot);

    expect(existsSync(path.join(workspaceRoot, ".git"))).toBe(true);
    expect(readFileSync(path.join(workspaceRoot, ".gitignore"), "utf8")).toContain(".hermit/sessions/");
  });

  it("migrates legacy root workspace directories into the nested workspace", async () => {
    const frameworkRoot = mkdtempSync(path.join(tmpdir(), "runtime-paths-migrate-"));
    roots.push(frameworkRoot);
    mkdirSync(path.join(frameworkRoot, "entities", "user"), { recursive: true });
    writeFileSync(path.join(frameworkRoot, "entities", "user", "record.md"), "hello\n");
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: frameworkRoot, stdio: "ignore" });
    execFileSync("git", ["add", "entities"], { cwd: frameworkRoot, stdio: "ignore" });

    const workspaceRoot = resolveDefaultWorkspaceRoot(frameworkRoot);
    await ensureWorkspaceRepository(workspaceRoot, frameworkRoot);

    expect(existsSync(path.join(frameworkRoot, "entities"))).toBe(false);
    expect(existsSync(path.join(workspaceRoot, "entities", "user", "record.md"))).toBe(true);
  });
});
