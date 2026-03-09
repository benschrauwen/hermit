import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { PromptLibrary } from "../src/prompt-library.js";
import { loadRole } from "../src/roles.js";
import { seedRoleWorkspace } from "./test-helpers.js";

describe("PromptLibrary", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "prompt-library-"));
    seedRoleWorkspace(root, ["role-a"]);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  describe("load", () => {
    it("loads from the configured role", async () => {
      const lib = await PromptLibrary.load(await loadRole(root, "role-a"));
      expect(lib).toBeInstanceOf(PromptLibrary);
    });
  });

  describe("renderSystemPrompt", () => {
    it("includes shared prompts and AGENTS.md content", async () => {
      const role = await loadRole(root, "role-a");
      const lib = await PromptLibrary.load(role);
      const out = await lib.renderSystemPrompt({
        workspaceRoot: "/my/root",
        roleId: "role-a",
        roleRoot: "agents/role-a",
        entityId: "cs-1",
        entityPath: "/my/root/entities/cases/active/cs-1",
        transcriptPath: "/path/to/transcript.md",
      });
      expect(out).toContain("# File Rules");
      expect(out).toContain("Role A Role");
      expect(out).toContain("agents/role-a");
    });

    it("substitutes template variables", async () => {
      const role = await loadRole(root, "role-a");
      const lib = await PromptLibrary.load(role);
      const out = await lib.renderSystemPrompt({
        workspaceRoot: "/my/root",
        roleId: "role-a",
        roleRoot: "agents/role-a",
      });
      expect(out).toContain("`agents/role-a/AGENTS.md`");
      expect(out).not.toContain("{{roleRoot}}");
    });

    it("includes additional role prompts when provided", async () => {
      const role = await loadRole(root, "role-a");
      const lib = await PromptLibrary.load(role);
      const out = await lib.renderSystemPrompt(
        {
          workspaceRoot: "/my/root",
          roleId: "role-a",
          roleRoot: "agents/role-a",
          entityId: "cs-1",
          entityPath: "/my/root/entities/cases/active/cs-1",
          transcriptPath: "/tmp/call.md",
        },
        ["23-mode-transcript-ingest.md"],
      );
      expect(out).toContain("Preserve the transcript as raw evidence.");
    });
  });

  describe("renderRolePrompt", () => {
    it("substitutes context into single prompt", async () => {
      const lib = await PromptLibrary.load(await loadRole(root, "role-a"));
      const out = await lib.renderRolePrompt("40-command-transcript-run.md", {
        workspaceRoot: "/root",
        roleId: "role-a",
        roleRoot: "agents/role-a",
        transcriptPath: "/root/entities/cases/active/cs-1/transcripts/call.md",
      });
      expect(out).toContain("Transcript Processing Request");
      expect(out).toContain("/root/entities/cases/active/cs-1/transcripts/call.md");
    });

    it("uses not-selected for missing optional context", async () => {
      const lib = await PromptLibrary.load(await loadRole(root, "role-a"));
      const out = await lib.renderRolePrompt("40-command-transcript-run.md", {
        workspaceRoot: "/root",
        roleId: "role-a",
        roleRoot: "agents/role-a",
      });
      expect(out).toContain("not-selected");
    });
  });

  describe("extractLinkedFiles", () => {
    it("returns linked files from AGENTS.md", async () => {
      const lib = await PromptLibrary.load(await loadRole(root, "role-a"));
      const links = lib.extractLinkedFiles();
      expect(links.length).toBeGreaterThan(0);
      expect(links).toContain("prompts/23-mode-transcript-ingest.md");
    });
  });
});
