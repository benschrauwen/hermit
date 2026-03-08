import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCompanyRecordTool,
  createEntityLookupTool,
  createComputerUseBoundaryTool,
  createCustomTools,
} from "../src/agent-tools.js";
import { ensureWorkspaceScaffold } from "../src/workspace.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(__dirname, "fixtures", "workspace");

describe("createEntityLookupTool", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns tool with expected name and description", () => {
    const tool = createEntityLookupTool("/any/root");
    expect(tool.name).toBe("entity_lookup");
    expect(tool.label).toBe("Entity Lookup");
    expect(tool.description).toContain("people, products, and deals");
    expect(tool.parameters).toBeDefined();
  });

  it("execute returns content and details (empty when no entities)", async () => {
    const tool = createEntityLookupTool(fixtureRoot);
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

describe("createComputerUseBoundaryTool", () => {
  it("returns tool that reports not enabled", async () => {
    const tool = createComputerUseBoundaryTool();
    expect(tool.name).toBe("computer_use");
    const result = await (tool.execute as (id: unknown, params: unknown) => Promise<unknown>)("id", {
      objective: "open browser",
    });
    const r = result as { content: Array<{ text: string }>; details: { available: boolean } };
    expect(r.content[0].text).toContain("not enabled");
    expect(r.details.available).toBe(false);
  });
});

describe("createCustomTools", () => {
  it("returns the core lookup, web, and onboarding creation tools", () => {
    const tools = createCustomTools("/root");
    const names = tools.map((t) => t.name);
    expect(names).toContain("entity_lookup");
    expect(names).toContain("web_search");
    expect(names).toContain("create_company_record");
    expect(names).toContain("create_person_record");
    expect(names).toContain("create_product_record");
    expect(names).toContain("create_deal_record");
  });

  it("includes computer_use when SALES_AGENT_ENABLE_COMPUTER_USE is true", () => {
    vi.stubEnv("SALES_AGENT_ENABLE_COMPUTER_USE", "true");
    const tools = createCustomTools("/root");
    const names = tools.map((t) => t.name);
    expect(names).toContain("computer_use");
  });
});

describe("createCompanyRecordTool", () => {
  it("creates canonical company starter files", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "agent-tools-"));
    try {
      await ensureWorkspaceScaffold(root);
      const tool = createCompanyRecordTool(root);
      const result = await (tool.execute as (id: unknown, params: unknown) => Promise<unknown>)("id", {
        companyName: "Acme",
        companySummary: "Summary",
        salesTeamName: "Sales",
        salesMethodology: "MEDDICC",
        idealCustomerProfile: "ICP",
        reviewCadence: "Weekly",
        topCompetitors: ["Rival"],
      });
      const typed = result as { details: { path: string } };
      expect(typed.details.path).toContain(path.join("company", "record.md"));
      expect(readFileSync(typed.details.path, "utf8")).toContain("agent onboarding");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
