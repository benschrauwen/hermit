import { describe, it, expect } from "vitest";
import { DEAL_SEQUENCE_WIDTH, DEFAULT_MODEL, DEFAULT_THINKING_LEVEL, SHARED_COMPANY_FILES, SHARED_ROOT_DIRECTORIES } from "../src/constants.js";

describe("constants", () => {
  it("shared root directories contain the generic layout", () => {
    expect(SHARED_ROOT_DIRECTORIES).toContain("entities");
    expect(SHARED_ROOT_DIRECTORIES).toContain("agents");
    expect(SHARED_ROOT_DIRECTORIES).toContain("entity-defs");
  });

  it("shared company files stay explicit and deterministic", () => {
    expect(SHARED_COMPANY_FILES).toEqual(["record.md", "strategy.md", "gtm.md"]);
  });

  it("DEAL_SEQUENCE_WIDTH is 4", () => {
    expect(DEAL_SEQUENCE_WIDTH).toBe(4);
  });

  it("default runtime settings stay generic", () => {
    expect(DEFAULT_MODEL).toBeTruthy();
    expect(DEFAULT_THINKING_LEVEL).toBe("medium");
  });
});
