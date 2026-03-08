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

  describe("getMissingAgentLinks", () => {
    it("returns empty when AGENTS.md links to all required prompts", async () => {
      const lib = await PromptLibrary.load(await loadRole(fixtureRoot, "sales"));
      const missing = lib.getMissingAgentLinks();
      expect(missing).toEqual([]);
    });
  });

  describe("listPromptIds", () => {
    it("returns sorted list of prompt ids", async () => {
      const lib = await PromptLibrary.load(await loadRole(fixtureRoot, "sales"));
      const promptIds = lib.listPromptIds();
      expect(promptIds).toContain("core-soul");
      expect(promptIds).toContain("routing");
      expect(promptIds).toContain("sales-standard");
      expect(promptIds).toContain("agent-ops");
      expect(promptIds).toContain("self-improvement");
      expect(promptIds.length).toBe(13);
      const sorted = [...promptIds].sort();
      expect(promptIds).toEqual(sorted);
    });
  });

  describe("renderBundle", () => {
    it("concatenates the default bundle prompts", async () => {
      const role = await loadRole(fixtureRoot, "sales");
      const lib = await PromptLibrary.load(role);
      const out = lib.renderBundle(role.promptBundles.default, {
        workspaceRoot: "/my/root",
        roleId: "sales",
        roleRoot: "roles/sales",
        entityId: "d-1",
        entityPath: "/my/root/roles/sales/deals/active/d-1",
        transcriptPath: "/path/to/transcript.md",
      });
      expect(out).toContain("file-first leadership agent");
      expect(out).toContain("Shared prompts live in `prompts/`");
      expect(out).toContain("Sales Leadership Standard");
    });

    it("supports onboarding bundle rendering", async () => {
      const role = await loadRole(fixtureRoot, "sales");
      const lib = await PromptLibrary.load(role);
      const out = lib.renderBundle(role.promptBundles.onboarding, {
        workspaceRoot: "/my/root",
        roleId: "sales",
        roleRoot: "roles/sales",
      });
      expect(out).toContain("usable leadership workspace");
      expect(out).toContain("`roles/sales/AGENTS.md`");
    });

    it("supports transcript workflow bundle rendering", async () => {
      const role = await loadRole(fixtureRoot, "sales");
      const lib = await PromptLibrary.load(role);
      const out = lib.renderBundle(role.promptBundles["transcript-ingest"], {
        workspaceRoot: "/my/root",
        roleId: "sales",
        roleRoot: "roles/sales",
        entityId: "d-1",
        entityPath: "/my/root/roles/sales/deals/active/d-1",
        transcriptPath: "/tmp/call.md",
      });
      expect(out).toContain("Preserve the transcript as raw evidence.");
      expect(out).toContain("/tmp/call.md");
    });
  });

  describe("renderNamedPrompt", () => {
    it("substitutes context into single prompt", async () => {
      const lib = await PromptLibrary.load(await loadRole(fixtureRoot, "sales"));
      const out = lib.renderNamedPrompt("sales-transcript-command", {
        workspaceRoot: "/root",
        roleId: "sales",
        roleRoot: "roles/sales",
        transcriptPath: "/root/roles/sales/deals/active/d-1/transcripts/call.md",
      });
      expect(out).toContain("Transcript Processing Request");
      expect(out).toContain("/root/roles/sales/deals/active/d-1/transcripts/call.md");
    });

    it("uses not-selected for missing optional context", async () => {
      const lib = await PromptLibrary.load(await loadRole(fixtureRoot, "sales"));
      const out = lib.renderNamedPrompt("sales-transcript-command", {
        workspaceRoot: "/root",
        roleId: "sales",
        roleRoot: "roles/sales",
      });
      expect(out).toContain("not-selected");
    });
  });
});
