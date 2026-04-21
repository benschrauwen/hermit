import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

import { repoRoot } from "./test-helpers.js";

describe("workspace explorer renderers", () => {
  const workspaceRoot = path.join(repoRoot, "workspace");

  it("emits a syntactically valid Jira dashboard script", async () => {
    const module = await import("../workspace/entity-defs/explorer/jira-dashboard.js");
    const rendered = await module.renderExplorerPage({ root: workspaceRoot, pageKey: "jira-dashboard" });

    expect(rendered).toBeDefined();
    const html = rendered?.html ?? "";
    const match = html.match(/<script>([\s\S]*)<\/script>/);

    expect(match, "expected the Jira dashboard renderer to include an inline script").toBeTruthy();
    expect(() => new vm.Script(match?.[1] ?? "")).not.toThrow();
  });

  it("emits a syntactically valid continuous discovery script", async () => {
    const module = await import("../workspace/entity-defs/explorer/continuous-discovery.js");
    const rendered = await module.renderExplorerPage({ root: workspaceRoot, pageKey: "continuous-discovery" });

    expect(rendered).toBeDefined();
    const html = rendered?.html ?? "";
    const match = html.match(/<script>([\s\S]*)<\/script>/);

    expect(match, "expected the continuous discovery renderer to include an inline script").toBeTruthy();
    expect(() => new vm.Script(match?.[1] ?? "")).not.toThrow();
  });
});
