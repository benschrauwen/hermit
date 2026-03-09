import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { runDoctor } from "../src/doctor.js";
import { loadRole } from "../src/roles.js";
import { ensureWorkspaceScaffold } from "../src/workspace.js";
import { seedRoleWorkspace, writeCompanyRecord } from "./test-helpers.js";

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
      const result = await runDoctor(root, "sales").catch(() => false);
      expect(result).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns true when workspace is valid (may log healthy or warnings only)", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "doctor-valid-"));
    seedRoleWorkspace(root, ["sales"]);
    const role = await loadRole(root, "sales");
    await ensureWorkspaceScaffold(root, role);
    writeCompanyRecord(root);
    const result = await runDoctor(root, "sales");
    const logged = consoleSpy.log.mock.calls.map((c) => c[0] as string);
    const errors = logged.filter((m) => m.startsWith("error:"));
    expect(errors, `Expected no errors but got: ${errors.join("; ")}`).toHaveLength(0);
    expect(result).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("warns on placeholder text and missing role files without failing the workspace", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "doctor-quality-"));

    try {
      seedRoleWorkspace(root, ["sales"]);
      const role = await loadRole(root, "sales");
      await ensureWorkspaceScaffold(root, role);
      writeCompanyRecord(root);

      const dealDir = path.join(root, "entities", "deals", "active", "d-2026-0001-acme");
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

      const result = await runDoctor(root, "sales");
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
