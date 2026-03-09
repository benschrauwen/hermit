import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PromptLibrary } from "../src/prompt-library.js";
import { loadRole } from "../src/roles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(__dirname, "..");

describe("PromptLibrary", () => {
  describe("load", () => {
    it("loads from the sales role", async () => {
      const lib = await PromptLibrary.load(await loadRole(fixtureRoot, "sales"));
      expect(lib).toBeInstanceOf(PromptLibrary);
    });
  });

  describe("renderSystemPrompt", () => {
    it("includes shared prompts and AGENTS.md content", async () => {
      const role = await loadRole(fixtureRoot, "sales");
      const lib = await PromptLibrary.load(role);
      const out = await lib.renderSystemPrompt({
        workspaceRoot: "/my/root",
        roleId: "sales",
        roleRoot: "agents/sales",
        entityId: "d-1",
        entityPath: "/my/root/entities/deals/active/d-1",
        transcriptPath: "/path/to/transcript.md",
      });
      expect(out).toContain("file-first leadership agent");
      expect(out).toContain("Sales Leader Role");
      expect(out).toContain("Sales Leadership Lens");
    });

    it("substitutes template variables", async () => {
      const role = await loadRole(fixtureRoot, "sales");
      const lib = await PromptLibrary.load(role);
      const out = await lib.renderSystemPrompt({
        workspaceRoot: "/my/root",
        roleId: "sales",
        roleRoot: "agents/sales",
      });
      expect(out).toContain("`agents/sales/AGENTS.md`");
      expect(out).not.toContain("{{roleRoot}}");
    });

    it("includes additional role prompts when provided", async () => {
      const role = await loadRole(fixtureRoot, "sales");
      const lib = await PromptLibrary.load(role);
      const out = await lib.renderSystemPrompt(
        {
          workspaceRoot: "/my/root",
          roleId: "sales",
          roleRoot: "agents/sales",
          entityId: "d-1",
          entityPath: "/my/root/entities/deals/active/d-1",
          transcriptPath: "/tmp/call.md",
        },
        ["23-mode-transcript-ingest.md"],
      );
      expect(out).toContain("Preserve the transcript as raw evidence.");
      expect(out).toContain("/tmp/call.md");
    });
  });

  describe("renderRolePrompt", () => {
    it("substitutes context into single prompt", async () => {
      const lib = await PromptLibrary.load(await loadRole(fixtureRoot, "sales"));
      const out = await lib.renderRolePrompt("40-command-transcript-run.md", {
        workspaceRoot: "/root",
        roleId: "sales",
        roleRoot: "agents/sales",
        transcriptPath: "/root/entities/deals/active/d-1/transcripts/call.md",
      });
      expect(out).toContain("Transcript Processing Request");
      expect(out).toContain("/root/entities/deals/active/d-1/transcripts/call.md");
    });

    it("uses not-selected for missing optional context", async () => {
      const lib = await PromptLibrary.load(await loadRole(fixtureRoot, "sales"));
      const out = await lib.renderRolePrompt("40-command-transcript-run.md", {
        workspaceRoot: "/root",
        roleId: "sales",
        roleRoot: "agents/sales",
      });
      expect(out).toContain("not-selected");
    });
  });

  describe("extractLinkedFiles", () => {
    it("returns linked files from AGENTS.md", async () => {
      const lib = await PromptLibrary.load(await loadRole(fixtureRoot, "sales"));
      const links = lib.extractLinkedFiles();
      expect(links.length).toBeGreaterThan(0);
      expect(links).toContain("prompts/20-mode-product.md");
    });
  });
});
