import { describe, it, expect } from "vitest";

import { renderBulletList, renderYamlList, TemplateLibrary } from "../src/template-library.js";

describe("TemplateLibrary", () => {
  it("renders placeholders from simple context values", () => {
    const out = TemplateLibrary.renderString("Hello {{name}} from {{role}}.", {
      name: "Jane",
      role: "primary",
    });
    expect(out).toBe("Hello Jane from primary.");
  });

  it("replaces missing placeholders with empty strings", () => {
    const out = TemplateLibrary.renderString("Value: {{missing}}.", {});
    expect(out).toBe("Value: .");
  });
});

describe("renderYamlList", () => {
  it("renders a YAML list block", () => {
    expect(renderYamlList(["a", "b"])).toBe("  - a\n  - b");
  });

  it("renders a fallback when empty", () => {
    expect(renderYamlList([])).toBe("  - none");
  });
});

describe("renderBulletList", () => {
  it("renders markdown bullet items", () => {
    expect(renderBulletList(["x", "y"], "- none")).toBe("- x\n- y");
  });

  it("renders the provided fallback when empty", () => {
    expect(renderBulletList([], "- Add something.")).toBe("- Add something.");
  });
});
