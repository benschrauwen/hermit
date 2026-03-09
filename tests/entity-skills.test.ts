import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { loadRole } from "../src/roles.js";
import { createRoleEntityRecord, ensureWorkspaceScaffold } from "../src/workspace.js";
import { repoRoot, seedRoleWorkspace, writeSharedEntityRecord } from "./test-helpers.js";

describe("entity_query skill scripts", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "entity-query-skill-"));
    seedRoleWorkspace(root, ["role-a"]);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("queries, summarizes, and inventories entity directories", async () => {
    const role = await loadRole(root, "role-a");
    await ensureWorkspaceScaffold(root, role);
    writeSharedEntityRecord(root);
    await createRoleEntityRecord(
      root,
      role,
      "item",
      {
        title: "Aura",
        summary: "Workspace",
        owner: "Taylor",
        status: "active",
        nextStep: "Review",
      },
      { sourceRefs: ["test"] },
    );

    const query = spawnSync(
      "bun",
      [path.join(repoRoot, "skills", "entity_query", "entities", "scripts", "query-entities.ts"), "--root", root, "--type", "item", "--format", "paths"],
      { encoding: "utf8" },
    );
    expect(query.status).toBe(0);
    expect(query.stdout).toContain("items/itm-aura");

    const summary = spawnSync(
      "bun",
      [path.join(repoRoot, "skills", "entity_query", "entities", "scripts", "summarize-entities.ts"), "--root", root, "--top", "3"],
      { encoding: "utf8" },
    );
    expect(summary.status).toBe(0);
    expect(summary.stdout).toContain("By type");
    expect(summary.stdout).toContain("item: 1");

    const inventory = spawnSync(
      "bun",
      [path.join(repoRoot, "skills", "entity_query", "entities", "scripts", "inventory-entities.ts"), "--root", root, "--group-by", "type", "--top", "3"],
      { encoding: "utf8" },
    );
    expect(inventory.status).toBe(0);
    expect(inventory.stdout).toContain("item (1)");
    expect(inventory.stdout).toContain("record.md: 1");
  });
});
