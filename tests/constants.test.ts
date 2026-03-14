import { describe, it, expect } from "vitest";
import { ENTITY_SEQUENCE_WIDTH, DEFAULT_MODEL, DEFAULT_THINKING_LEVEL, SHARED_ROOT_DIRECTORIES } from "../src/constants.js";

describe("constants", () => {
  it("shared root directories contain the generic layout", () => {
    expect(SHARED_ROOT_DIRECTORIES).toContain("entities");
    expect(SHARED_ROOT_DIRECTORIES).toContain("agents");
    expect(SHARED_ROOT_DIRECTORIES).toContain("entity-defs");
    expect(SHARED_ROOT_DIRECTORIES).toContain("inbox");
  });

  it("ENTITY_SEQUENCE_WIDTH is 4", () => {
    expect(ENTITY_SEQUENCE_WIDTH).toBe(4);
  });

  it("default runtime settings stay generic", () => {
    expect(DEFAULT_MODEL).toBeUndefined();
    expect(DEFAULT_THINKING_LEVEL).toBe("medium");
  });
});
