import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createEntityLookupTool,
  createComputerUseBoundaryTool,
  createCustomTools,
} from "../src/agent-tools.js";

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
  it("returns at least entity_lookup and web_search", () => {
    const tools = createCustomTools("/root");
    const names = tools.map((t) => t.name);
    expect(names).toContain("entity_lookup");
    expect(names).toContain("web_search");
  });

  it("includes computer_use when SALES_AGENT_ENABLE_COMPUTER_USE is true", () => {
    vi.stubEnv("SALES_AGENT_ENABLE_COMPUTER_USE", "true");
    const tools = createCustomTools("/root");
    const names = tools.map((t) => t.name);
    expect(names).toContain("computer_use");
  });
});
