import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

import { runDoctor } from "../src/doctor.js";
import { loadRole } from "../src/roles.js";
import { ensureWorkspaceScaffold } from "../src/workspace.js";
import { seedRoleWorkspace, writeSharedEntityRecord } from "./test-helpers.js";

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
      const result = await runDoctor(root, "role-a").catch(() => false);
      expect(result).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("returns true when workspace is valid (may log healthy or warnings only)", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "doctor-valid-"));
    seedRoleWorkspace(root, ["role-a"]);
    const role = await loadRole(root, "role-a");
    await ensureWorkspaceScaffold(root, role);
    writeSharedEntityRecord(root);
    const result = await runDoctor(root, "role-a");
    const logged = consoleSpy.log.mock.calls.map((c) => c[0] as string);
    const errors = logged.filter((m) => m.startsWith("error:"));
    expect(errors, `Expected no errors but got: ${errors.join("; ")}`).toHaveLength(0);
    expect(result).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("warns on placeholder text and missing role files without failing the workspace", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "doctor-quality-"));

    try {
      seedRoleWorkspace(root, ["role-a"]);
      const role = await loadRole(root, "role-a");
      await ensureWorkspaceScaffold(root, role);
      writeSharedEntityRecord(root);

      const caseDir = path.join(root, "entities", "cases", "active", "cs-2026-0001-acme-expansion");
      mkdirSync(caseDir, { recursive: true });
      writeFileSync(
        path.join(caseDir, "record.md"),
        `---
id: cs-2026-0001-acme-expansion
type: case
name: Acme - Expansion
updated_at: 2026-03-08T12:00:00.000Z
---

## Next Step

- Add next step.
`,
      );

      const result = await runDoctor(root, "role-a");
      const logged = consoleSpy.log.mock.calls.map((c) => c[0] as string);
      expect(result).toBe(true);
      expect(logged.some((m) => m.includes("placeholder text"))).toBe(true);
      expect(logged.some((m) => m.includes("activity-log.md is missing or unreadable"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails when entity-defs/entities.md has body content but no frontmatter entities list", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "doctor-entity-defs-shape-"));

    try {
      seedRoleWorkspace(root, ["role-a"]);
      writeFileSync(
        path.join(root, "entity-defs", "entities.md"),
        `- key: company
  label: Company
  type: company
  create_directory: companies
`,
      );

      const result = await runDoctor(root, "role-a");
      const logged = consoleSpy.log.mock.calls.map((c) => c[0] as string);
      expect(result).toBe(false);
      expect(logged.some((m) => m.includes("must define an `entities:` list in YAML frontmatter"))).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not treat specific agent action items as placeholder text", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "doctor-agent-actions-"));

    try {
      seedRoleWorkspace(root, ["role-a"]);
      const role = await loadRole(root, "role-a");
      await ensureWorkspaceScaffold(root, role);
      writeSharedEntityRecord(root);

      writeFileSync(
        path.join(root, "agents", "role-a", "agent", "record.md"),
        `---
id: role-a-agent
type: agent
name: Role A Agent
status: active
owner: Role A
updated_at: 2026-03-08T12:00:00.000Z
---

## Summary

Owns real follow-through for the role.

## Active Projects

- Tighten pipeline inspection.

## Next Actions

- Add MEDDPICC review coverage for the two late-stage cases before Friday.

## Waiting For

- None yet.

## Calendar

- None scheduled.

## Someday Or Maybe

- Add a quarterly coaching retro once the team is stable.
`,
      );

      const result = await runDoctor(root, "role-a");
      const logged = consoleSpy.log.mock.calls.map((c) => c[0] as string);
      expect(result).toBe(true);
      expect(logged.some((m) => m.includes("placeholder text"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
