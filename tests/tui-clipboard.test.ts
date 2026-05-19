import { describe, expect, it } from "vitest";

import {
  isBracketedPasteInput,
  isPasteShortcut,
  wrapBracketedPaste,
} from "../src/tui-clipboard.js";

describe("tui-clipboard", () => {
  it("detects bracketed paste sequences", () => {
    expect(isBracketedPasteInput("\x1b[200~hello\x1b[201~")).toBe(true);
    expect(isBracketedPasteInput("plain text")).toBe(false);
  });

  it("detects common paste shortcuts", () => {
    expect(isPasteShortcut("\x16")).toBe(true);
    expect(isPasteShortcut("a")).toBe(false);
  });

  it("wraps clipboard text for the editor paste handler", () => {
    expect(wrapBracketedPaste("hi")).toBe("\x1b[200~hi\x1b[201~");
  });
});
