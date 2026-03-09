import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { loadRole } from "../src/roles.js";
import { createCompanyRecords, createRoleEntityRecord, ensureWorkspaceScaffold } from "../src/workspace.js";
import { repoRoot, seedRoleWorkspace } from "./test-helpers.js";

describe("entities skill scripts", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "entities-skill-"));
    seedRoleWorkspace(root, ["sales"]);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("queries, summarizes, and inventories entity directories", async () => {
    const role = await loadRole(root, "sales");
    await ensureWorkspaceScaffold(root, role);
    await createCompanyRecords(
      root,
      {
        companyName: "Acme",
        companySummary: "Summary",
        businessModel: "Subscription",
        operatingCadence: "Weekly",
        strategicPriorities: "Expansion",
        topCompetitors: ["Rival"],
      },
      { sourceRefs: ["test"] },
    );
    await createRoleEntityRecord(
      root,
      role,
      "product",
      {
        name: "Aura",
        summary: "AI workspace",
        valueHypothesis: "Faster execution",
        competitors: ["Rival"],
      },
      { sourceRefs: ["test"] },
    );

    const query = spawnSync(
      "bun",
      [path.join(repoRoot, "skills", "entities", "scripts", "query-entities.ts"), "--root", root, "--type", "product", "--format", "paths"],
      { encoding: "utf8" },
    );
    expect(query.status).toBe(0);
    expect(query.stdout).toContain("product/prd-aura");

    const summary = spawnSync(
      "bun",
      [path.join(repoRoot, "skills", "entities", "scripts", "summarize-entities.ts"), "--root", root, "--top", "3"],
      { encoding: "utf8" },
    );
    expect(summary.status).toBe(0);
    expect(summary.stdout).toContain("By type");
    expect(summary.stdout).toContain("product: 1");

    const inventory = spawnSync(
      "bun",
      [path.join(repoRoot, "skills", "entities", "scripts", "inventory-entities.ts"), "--root", root, "--group-by", "type", "--top", "3"],
      { encoding: "utf8" },
    );
    expect(inventory.status).toBe(0);
    expect(inventory.stdout).toContain("product (1)");
    expect(inventory.stdout).toContain("record.md: 1");
  });
});
