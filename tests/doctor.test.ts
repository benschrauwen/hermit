import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";

import { runDoctor } from "../src/doctor.js";
import { REQUIRED_PROMPT_FILES } from "../src/constants.js";
import { getWorkspacePaths } from "../src/workspace.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(__dirname, "fixtures", "workspace");

describe("runDoctor", () => {
  let consoleSpy: { log: ReturnType<typeof vi.spyOn> };

  beforeEach(() => {
    consoleSpy = { log: vi.spyOn(console, "log").mockImplementation(() => {}) };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
  });

  it("reports errors and returns false when required dirs are missing", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "doctor-missing-"));
    try {
      const paths = getWorkspacePaths(root);
      mkdirSync(paths.promptsDir, { recursive: true });
      writeFileSync(
        paths.agentsFile,
        `# Agent\n${REQUIRED_PROMPT_FILES.map((f) => `- [prompts/${f}](prompts/${f})`).join("\n")}\n`,
      );
      for (const file of REQUIRED_PROMPT_FILES) {
        writeFileSync(path.join(paths.promptsDir, file), "# Prompt\n");
      }
      const result = await runDoctor(root);
      expect(result).toBe(false);
      const calls = consoleSpy.log.mock.calls.map((c) => c[0] as string);
      const errors = calls.filter((m) => m.startsWith("error:"));
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((m) => m.includes("Missing required directory"))).toBe(
        true,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns true when workspace is valid (may log healthy or warnings only)", async () => {
    const { ensureWorkspaceScaffold } = await import("../src/workspace.js");
    await ensureWorkspaceScaffold(fixtureRoot);
    const result = await runDoctor(fixtureRoot);
    const logged = consoleSpy.log.mock.calls.map((c) => c[0] as string);
    const errors = logged.filter((m) => m.startsWith("error:"));
    expect(errors, `Expected no errors but got: ${errors.join("; ")}`).toHaveLength(0);
    expect(result).toBe(true);
    expect(
      logged.some((m) => m.includes("healthy") || m.startsWith("warning:")),
    ).toBe(true);
  });

  it("warns on placeholder text and missing canonical deal files without failing the workspace", async () => {
    const { ensureWorkspaceScaffold } = await import("../src/workspace.js");
    const root = mkdtempSync(path.join(tmpdir(), "doctor-quality-"));

    try {
      await ensureWorkspaceScaffold(root);
      cpSync(path.join(fixtureRoot, "prompts"), path.join(root, "prompts"), { recursive: true });
      cpSync(path.join(fixtureRoot, "AGENTS.md"), path.join(root, "AGENTS.md"));

      const dealDir = path.join(root, "deals", "d-2026-0001-acme");
      mkdirSync(dealDir, { recursive: true });
      writeFileSync(
        path.join(dealDir, "record.md"),
        `---
id: d-2026-0001-acme
type: deal
name: Acme - Expansion
updated_at: 2026-03-08T12:00:00.000Z
---

## Next Step

- Add next step.
`,
      );

      const result = await runDoctor(root);
      const logged = consoleSpy.log.mock.calls.map((c) => c[0] as string);
      expect(result).toBe(true);
      expect(logged.some((m) => m.includes("placeholder text"))).toBe(true);
      expect(logged.some((m) => m.includes("meddicc.md is missing or unreadable"))).toBe(true);
      expect(logged.some((m) => m.includes("activity-log.md is missing or unreadable"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
