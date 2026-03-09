import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createCustomTools, createEntityLookupTool } from "../src/agent-tools.js";
import { loadRole } from "../src/roles.js";
import { ensureWorkspaceScaffold } from "../src/workspace.js";
import { seedRoleWorkspace } from "./test-helpers.js";

const originalComputerUseEnv = process.env.ROLE_AGENT_ENABLE_COMPUTER_USE;

afterEach(() => {
  if (originalComputerUseEnv === undefined) {
    delete process.env.ROLE_AGENT_ENABLE_COMPUTER_USE;
    return;
  }

  process.env.ROLE_AGENT_ENABLE_COMPUTER_USE = originalComputerUseEnv;
});

describe("createEntityLookupTool", () => {
  let root: string;

  beforeEach(() => {
    delete process.env.ROLE_AGENT_ENABLE_COMPUTER_USE;
    root = mkdtempSync(path.join(tmpdir(), "agent-tools-lookup-"));
    seedRoleWorkspace(root, ["sales"]);
  });

  it("returns tool with expected name and description", () => {
    const role = {
      id: "sales",
    } as Awaited<ReturnType<typeof loadRole>>;
    const tool = createEntityLookupTool("/any/root", role);
    expect(tool.name).toBe("entity_lookup");
    expect(tool.label).toBe("Entity Lookup");
    expect(tool.description).toContain("shared people and role-specific entities");
    expect(tool.parameters).toBeDefined();
  });

  it("execute returns content and details (empty when no entities)", async () => {
    const role = await loadRole(root, "sales");
    const tool = createEntityLookupTool(root, role);
    const execute = tool.execute as (
      id: unknown,
      params: { query: string; type?: string; limit?: number },
    ) => Promise<unknown>;
    const result = (await execute("call-1", {
      query: "jane",
      limit: 10,
    })) as {
      content: Array<{ type: string; text: string }>;
      details: { count: number };
    };
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.details).toEqual({ count: 0 });
    expect(JSON.parse(result.content[0].text)).toEqual([]);
  });
});

describe("createCustomTools", () => {
  it("returns entity lookup and create-entity-record tools for shared and role entities", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "agent-tools-custom-"));
    seedRoleWorkspace(root, ["sales"]);
    const role = await loadRole(root, "sales");
    const tools = createCustomTools("/root", role);
    const names = tools.map((t) => t.name);
    expect(names).toContain("entity_lookup");
    expect(names).toContain("create_company_record");
    expect(names).toContain("create_person_record");
    expect(names).toContain("create_product_record");
    expect(names).toContain("create_deal_record");
    rmSync(root, { recursive: true, force: true });
  });
});

describe("createEntityRecordTool (company)", () => {
  it("creates canonical company starter files via generic entity tool", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "agent-tools-"));
    try {
      seedRoleWorkspace(root, ["sales"]);
      await ensureWorkspaceScaffold(root, await loadRole(root, "sales"));
      const role = await loadRole(root, "sales");
      const companyEntity = role.entities.find((e) => e.key === "company");
      expect(companyEntity).toBeDefined();
      const { createEntityRecordTool } = await import("../src/agent-tools.js");
      const tool = createEntityRecordTool(root, role, companyEntity!);
      const result = await (tool.execute as (id: unknown, params: unknown) => Promise<unknown>)("id", {
        companyName: "Acme",
        companySummary: "Summary",
        businessModel: "Subscription",
        operatingCadence: "Weekly",
        strategicPriorities: "Expansion",
        topCompetitors: ["Rival"],
      });
      const typed = result as { details: { path: string } };
      expect(typed.details.path).toContain("company");
      expect(readFileSync(path.join(typed.details.path, "record.md"), "utf8")).toContain("agent onboarding");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
