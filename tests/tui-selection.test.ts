import { describe, expect, it } from "vitest";

import {
  extractSelectedText,
  highlightSelectionLine,
  normalizeSelectionRange,
  selectionIsEmpty,
  stripAnsi,
} from "../src/tui-selection.js";

describe("tui-selection", () => {
  it("strips ANSI codes for clipboard text", () => {
    expect(stripAnsi("\x1b[1mbold\x1b[0m text")).toBe("bold text");
  });

  it("extracts multi-line selection text", () => {
    const lines = ["alpha", "beta", "gamma"];
    const range = normalizeSelectionRange(
      { pane: "transcript", line: 0, col: 2 },
      { pane: "transcript", line: 2, col: 1 },
    );
    expect(range).toBeDefined();
    expect(extractSelectedText(lines, range!)).toBe("pha\nbeta\nga");
  });

  it("highlights the selected columns on a line", () => {
    const range = normalizeSelectionRange(
      { pane: "heartbeat", line: 0, col: 1 },
      { pane: "heartbeat", line: 0, col: 3 },
    );
    expect(highlightSelectionLine("hello", 0, range)).toBe("h\x1b[7mell\x1b[27mo");
  });

  it("treats same-line zero-width selection as empty", () => {
    const range = normalizeSelectionRange(
      { pane: "transcript", line: 1, col: 4 },
      { pane: "transcript", line: 1, col: 4 },
    );
    expect(range).toBeDefined();
    expect(selectionIsEmpty(range!)).toBe(true);
  });
});
