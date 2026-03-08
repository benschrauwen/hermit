import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PromptLibrary } from "../src/prompt-library.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(__dirname, "fixtures", "workspace");

describe("PromptLibrary", () => {
  describe("load", () => {
    it("loads from fixture workspace", async () => {
      const lib = await PromptLibrary.load(fixtureRoot);
      expect(lib).toBeInstanceOf(PromptLibrary);
    });
  });

  describe("getMissingAgentLinks", () => {
    it("returns empty when AGENTS.md links to all required prompts", async () => {
      const lib = await PromptLibrary.load(fixtureRoot);
      const missing = lib.getMissingAgentLinks();
      expect(missing).toEqual([]);
    });
  });

  describe("listPromptFiles", () => {
    it("returns sorted list of prompt file names", async () => {
      const lib = await PromptLibrary.load(fixtureRoot);
      const files = lib.listPromptFiles();
      expect(files).toContain("00-core-persona.md");
      expect(files).toContain("90-self-improvement.md");
      expect(files.length).toBe(10);
      const sorted = [...files].sort();
      expect(files).toEqual(sorted);
    });
  });

  describe("renderBundle", () => {
    it("concatenates bundle prompts with template substitution", async () => {
      const lib = await PromptLibrary.load(fixtureRoot);
      const out = lib.renderBundle("transcript-ingest", {
        workspaceRoot: "/my/root",
        entityId: "d-1",
        entityPath: "/my/root/deals/d-1",
        transcriptPath: "/path/to/transcript.md",
      });
      expect(out).toContain("Transcript ingest.");
      expect(out).toContain("/my/root");
      expect(out).toContain("d-1");
    });
  });

  describe("renderNamedPrompt", () => {
    it("substitutes context into single prompt", async () => {
      const lib = await PromptLibrary.load(fixtureRoot);
      const out = lib.renderNamedPrompt("40-command-transcript-run.md", {
        workspaceRoot: "/root",
        transcriptPath: "/root/deals/d-1/transcripts/call.md",
      });
      expect(out).toContain("Transcript run.");
      expect(out).toContain("/root/deals/d-1/transcripts/call.md");
    });

    it("uses not-selected for missing optional context", async () => {
      const lib = await PromptLibrary.load(fixtureRoot);
      const out = lib.renderNamedPrompt("40-command-transcript-run.md", {
        workspaceRoot: "/root",
      });
      expect(out).toContain("not-selected");
    });
  });
});
