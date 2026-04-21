import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadRole } from "../src/roles.js";
import { resolveFrameworkRoot } from "../src/runtime-paths.js";
import {
  createRoleEntityRecord,
  ensureWorkspaceScaffold,
  findEntityById,
  getWorkspaceInitializationState,
  getWorkspacePaths,
  makeSlug,
  scanEntities,
  writeFileSafely,
} from "../src/workspace.js";
import { seedRoleWorkspace, writeSharedEntityRecord } from "./test-helpers.js";

function replaceInFile(filePath: string, oldText: string, newText: string): void {
  const original = readFileSync(filePath, "utf8");
  writeFileSync(filePath, original.replace(oldText, newText));
}

describe("workspace", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "multi-role-workspace-"));
    seedRoleWorkspace(tmpRoot, ["role-a", "role-b"]);
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns shared and role-aware workspace paths", async () => {
    const role = await loadRole(tmpRoot, "role-a");
    const sharedPaths = getWorkspacePaths(tmpRoot);
    const rolePaths = getWorkspacePaths(tmpRoot, role);
    expect(sharedPaths.entitiesDir).toBe(path.join(tmpRoot, "entities"));
    expect(sharedPaths.skillsDir).toBe(path.join(tmpRoot, "skills"));
    expect(sharedPaths.inboxDir).toBe(path.join(tmpRoot, "inbox"));
    expect(rolePaths.roleDir).toBe(path.join(tmpRoot, "agents", "role-a"));
    expect(rolePaths.sharedSkillsDir).toBe(path.join(resolveFrameworkRoot(), "skills"));
    expect(rolePaths.roleSkillsDir).toBe(path.join(tmpRoot, "agents", "role-a", "skills"));
    expect(rolePaths.sessionsDir).toBe(path.join(tmpRoot, "agents", "role-a", ".role-agent", "sessions"));
  });

  it("slugifies strings safely", () => {
    expect(makeSlug("Café Team")).toBe("cafe-team");
  });

  it("creates shared and role scaffolds", async () => {
    const role = await loadRole(tmpRoot, "role-a");
    await ensureWorkspaceScaffold(tmpRoot, role);
    expect(readdirSync(tmpRoot)).toEqual(expect.arrayContaining(["entities", "agents", "skills", "inbox"]));
    expect(readFileSync(path.join(tmpRoot, ".hermit", "agent", "record.md"), "utf8")).toContain("Hermit Agent");
    expect(readFileSync(path.join(tmpRoot, ".hermit", "agent", "inbox.md"), "utf8")).toContain(".hermit/agent/record.md");
    expect(readFileSync(path.join(tmpRoot, "agents", "role-a", "agent", "record.md"), "utf8")).toContain("Role A");
    expect(readFileSync(path.join(tmpRoot, "agents", "role-a", "agent", "record.md"), "utf8")).toContain(
      "## Strategic Experiments",
    );
    expect(readFileSync(path.join(tmpRoot, "agents", "role-a", "agent", "inbox.md"), "utf8")).toContain("Open Inbox Items");
    expect(readdirSync(path.join(tmpRoot, "agents", "role-a"))).toContain("skills");
    expect(readdirSync(path.join(tmpRoot, "agents", "role-a", ".role-agent"))).toEqual(
      expect.arrayContaining(["sessions", "heartbeat-sessions"]),
    );
    expect(readdirSync(path.join(tmpRoot, "entities", "cases"))).toEqual(
      expect.arrayContaining(["active", "archive"]),
    );
  });

  it("reports initialization from shared and role entities", async () => {
    const role = await loadRole(tmpRoot, "role-a");
    await ensureWorkspaceScaffold(tmpRoot, role);
    let state = await getWorkspaceInitializationState(tmpRoot, role);
    expect(state.initialized).toBe(false);

    writeSharedEntityRecord(tmpRoot);
    await createRoleEntityRecord(
      role,
      "item",
      {
        title: "Widget",
        summary: "Summary",
        owner: "Taylor",
        status: "active",
        nextStep: "Review",
      },
      { sourceRefs: ["test"] },
    );

    state = await getWorkspaceInitializationState(tmpRoot, role);
    expect(state.initialized).toBe(true);
    expect(state.sharedEntityCount).toBe(1);
    expect(state.roleEntityCounts.item).toBe(1);
  });

  it("supports safe writes", async () => {
    const filePath = path.join(tmpRoot, "notes", "log.md");
    await writeFileSafely(filePath, "one");
    await expect(writeFileSafely(filePath, "two")).rejects.toThrow(/Refusing to overwrite/);
    expect(readFileSync(filePath, "utf8")).toBe("one");
  });

  it("detects generic shared entities during scans", async () => {
    const role = await loadRole(tmpRoot, "role-a");
    await ensureWorkspaceScaffold(tmpRoot, role);
    writeSharedEntityRecord(tmpRoot, {
      directoryName: "reference",
      id: "reference",
      type: "reference",
      name: "Reference",
    });

    const entities = await scanEntities(tmpRoot, role);
    expect(entities.map((entity) => entity.id)).toContain("reference");
  });

  it("creates role-local entities with deterministic paths and templates", async () => {
    const role = await loadRole(tmpRoot, "role-a");
    await ensureWorkspaceScaffold(tmpRoot, role);
    const item = await createRoleEntityRecord(
      role,
      "item",
      {
        title: "Widget",
        summary: "Summary",
        owner: "Taylor",
        status: "active",
        nextStep: "Review scope",
      },
      { sourceRefs: ["agent onboarding"] },
    );
    const caseEntity = await createRoleEntityRecord(
      role,
      "case",
      {
        account: "Acme",
        title: "Expansion",
        owner: "Taylor",
        status: "active",
        nextStep: "Schedule review",
      },
      { sourceRefs: ["agent onboarding"] },
    );

    expect(item.id).toBe("itm-widget");
    expect(caseEntity.id).toMatch(/^cs-\d{4}-\d{4}-acme-expansion$/);
    expect(caseEntity.path).toContain(path.join("entities", "cases", "active"));
    expect(readFileSync(path.join(item.path, "notes.md"), "utf8")).toContain("Add notes");
    expect(readFileSync(path.join(caseEntity.path, "activity-log.md"), "utf8")).toContain("Add activity");
  });

  it("writes YAML-safe frontmatter for names with colons", async () => {
    const role = await loadRole(tmpRoot, "role-a");
    await ensureWorkspaceScaffold(tmpRoot, role);

    const item = await createRoleEntityRecord(
      role,
      "item",
      {
        title: "Bleau : De Gres Six",
        summary: "Climbing guide",
        owner: "Taylor",
        status: "active",
        nextStep: "Shelve",
      },
      { sourceRefs: ["agent onboarding: bookshelf photo"] },
    );

    const record = readFileSync(path.join(item.path, "record.md"), "utf8");
    expect(record).toContain('name: "Bleau : De Gres Six"');
    expect(record).toContain('source_refs:\n  - "agent onboarding: bookshelf photo"');

    const entities = await scanEntities(tmpRoot, role);
    expect(entities.map((entity) => entity.name)).toContain("Bleau : De Gres Six");
  });

  it("renders number and boolean fields as native YAML scalars", async () => {
    replaceInFile(
      path.join(tmpRoot, "entity-defs", "entities.md"),
      `      - key: nextStep
        label: Next Step
        type: string
        description: Next concrete step.
    files:
`,
      `      - key: nextStep
        label: Next Step
        type: string
        description: Next concrete step.
      - key: estimate
        label: Estimate
        type: number
        description: Estimated effort.
      - key: blocked
        label: Blocked
        type: boolean
        description: Whether the work is blocked.
        defaultValue: false
    files:
`,
    );
    replaceInFile(
      path.join(tmpRoot, "entity-defs", "item", "record.md"),
      `status: {{statusYaml}}
owner: {{ownerYaml}}
updated_at: {{updatedAtYaml}}
`,
      `status: {{statusYaml}}
owner: {{ownerYaml}}
estimate: {{estimateYaml}}
blocked: {{blockedYaml}}
updated_at: {{updatedAtYaml}}
`,
    );

    const role = await loadRole(tmpRoot, "role-a");
    await ensureWorkspaceScaffold(tmpRoot, role);
    const item = await createRoleEntityRecord(
      role,
      "item",
      {
        title: "Widget",
        summary: "Summary",
        owner: "Taylor",
        status: "active",
        estimate: 5,
        nextStep: "Review scope",
      },
      { sourceRefs: ["agent onboarding"] },
    );

    const record = readFileSync(path.join(item.path, "record.md"), "utf8");
    expect(record).toContain("estimate: 5");
    expect(record).toContain("blocked: false");
  });

  it("applies schema defaults when optional fields omit a defaulted value", async () => {
    const role = await loadRole(tmpRoot, "role-a");
    await ensureWorkspaceScaffold(tmpRoot, role);

    const item = await createRoleEntityRecord(
      role,
      "item",
      {
        title: "Widget",
        summary: "Summary",
        owner: "Taylor",
        nextStep: "Review scope",
      },
      { sourceRefs: ["test"] },
    );

    expect(readFileSync(path.join(item.path, "record.md"), "utf8")).toContain("status: active");
  });

  it("rejects record creation when a required schema field is missing", async () => {
    const role = await loadRole(tmpRoot, "role-a");
    await ensureWorkspaceScaffold(tmpRoot, role);

    await expect(
      createRoleEntityRecord(
        role,
        "case",
        {
          title: "Expansion",
          owner: "Taylor",
          status: "active",
          nextStep: "Schedule review",
        },
        { sourceRefs: ["test"] },
      ),
    ).rejects.toThrow('Missing required field "account" for entity case.');
  });

  it("scans shared and role entities together", async () => {
    const role = await loadRole(tmpRoot, "role-a");
    await ensureWorkspaceScaffold(tmpRoot, role);
    writeSharedEntityRecord(tmpRoot, {
      directoryName: "shared-note",
      id: "shared-note",
      type: "shared-note",
      name: "Shared Note",
    });
    await createRoleEntityRecord(
      role,
      "item",
      { title: "Widget", summary: "Summary", owner: "Taylor", status: "active", nextStep: "Review" },
      { sourceRefs: ["test"] },
    );
    const entities = await scanEntities(tmpRoot, role);
    expect(entities.map((entity) => entity.id)).toEqual(expect.arrayContaining(["shared-note", "itm-widget"]));
  });

  it("finds entities by ID", async () => {
    const role = await loadRole(tmpRoot, "role-a");
    await ensureWorkspaceScaffold(tmpRoot, role);
    const caseEntity = await createRoleEntityRecord(
      role,
      "case",
      {
        account: "Acme",
        title: "Expansion",
        owner: "Taylor",
        status: "active",
        nextStep: "Schedule review",
      },
      { sourceRefs: ["test"] },
    );
    const found = await findEntityById(tmpRoot, role, caseEntity.id);
    expect(found?.id).toBe(caseEntity.id);
  });

  it("supports a second role without changing core code", async () => {
    const role = await loadRole(tmpRoot, "role-b");
    await ensureWorkspaceScaffold(tmpRoot, role);
    const issue = await createRoleEntityRecord(
      role,
      "issue",
      {
        title: "Stabilize deployment pipeline",
        owner: "Alex",
        status: "in-progress",
        nextStep: "Create rollback checklist",
      },
      { sourceRefs: ["test"] },
    );
    expect(issue.id).toBe("iss-stabilize-deployment-pipeline");
    expect(readFileSync(path.join(issue.path, "record.md"), "utf8")).toContain("Create rollback checklist");
  });
});
