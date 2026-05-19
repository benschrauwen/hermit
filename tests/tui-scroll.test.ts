import { describe, expect, it } from "vitest";

import {
  clampScrollFromBottom,
  parseMouseWheelEvent,
  scrollDeltaForWheel,
  sliceScrollableLines,
} from "../src/tui-scroll.js";

describe("tui-scroll", () => {
  it("slices lines from the bottom with a scroll offset", () => {
    const lines = ["a", "b", "c", "d", "e"];
    expect(sliceScrollableLines(lines, 2, 0)).toEqual(["d", "e"]);
    expect(sliceScrollableLines(lines, 2, 2)).toEqual(["b", "c"]);
  });

  it("clamps scroll offset to available history", () => {
    expect(clampScrollFromBottom(99, 5, 2)).toBe(3);
    expect(clampScrollFromBottom(-4, 5, 2)).toBe(0);
  });

  it("parses SGR mouse wheel events", () => {
    expect(parseMouseWheelEvent("\x1b[<64;12;8M")).toEqual({
      column: 12,
      row: 8,
      direction: "up",
    });
    expect(parseMouseWheelEvent("\x1b[<65;12;8M")).toEqual({
      column: 12,
      row: 8,
      direction: "down",
    });
    expect(parseMouseWheelEvent("\x1b[5~")).toBeUndefined();
  });

  it("maps wheel direction to line scroll deltas", () => {
    expect(scrollDeltaForWheel("up")).toBe(1);
    expect(scrollDeltaForWheel("down")).toBe(-1);
    expect(scrollDeltaForWheel("up", 3)).toBe(3);
  });
});
