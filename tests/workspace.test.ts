import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadRole } from "../src/roles.js";
import {
  appendLine,
  copyTranscriptIntoRoleEntity,
  copyTranscriptToRoleInbox,
  createRoleEntityRecord,
  ensureWorkspaceScaffold,
  findCreatableRoleEntities,
  findEntityById,
  findTranscriptEntityCandidates,
  getWorkspaceInitializationState,
  getWorkspacePaths,
  makeSlug,
  resolveTranscriptEntity,
  scanEntities,
  writeFileSafely,
} from "../src/workspace.js";
import { seedRoleWorkspace, writeSharedEntityRecord } from "./test-helpers.js";

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
    expect(rolePaths.roleDir).toBe(path.join(tmpRoot, "agents", "role-a"));
    expect(rolePaths.sharedSkillsDir).toBe(path.join(tmpRoot, "skills"));
    expect(rolePaths.roleSkillsDir).toBe(path.join(tmpRoot, "agents", "role-a", "skills"));
    expect(rolePaths.sessionsDir).toBe(path.join(tmpRoot, "agents", "role-a", ".role-agent", "sessions"));
  });

  it("slugifies strings safely", () => {
    expect(makeSlug("Café Team")).toBe("cafe-team");
  });

  it("creates shared and role scaffolds", async () => {
    const role = await loadRole(tmpRoot, "role-a");
    await ensureWorkspaceScaffold(tmpRoot, role);
    expect(readdirSync(tmpRoot)).toEqual(expect.arrayContaining(["entities", "agents", "skills"]));
    expect(readFileSync(path.join(tmpRoot, "agents", "role-a", "agent", "record.md"), "utf8")).toContain("Role A");
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

  it("supports safe writes and append operations", async () => {
    const filePath = path.join(tmpRoot, "notes", "log.md");
    await writeFileSafely(filePath, "one");
    await expect(writeFileSafely(filePath, "two")).rejects.toThrow(/Refusing to overwrite/);
    await appendLine(filePath, "two");
    expect(readFileSync(filePath, "utf8")).toBe("one" + "two\n");
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

  it("finds entities by ID and filters creatable role entities", async () => {
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
    const activeCases = await findCreatableRoleEntities(tmpRoot, role, "case");
    expect(found?.id).toBe(caseEntity.id);
    expect(activeCases.map((entity) => entity.id)).toContain(caseEntity.id);
  });

  it("matches transcript candidates against the configured transcript capability", async () => {
    const role = await loadRole(tmpRoot, "role-a");
    await ensureWorkspaceScaffold(tmpRoot, role);
    await createRoleEntityRecord(
      role,
      "case",
      {
        account: "Acme",
        title: "Platform",
        owner: "Taylor",
        status: "active",
        nextStep: "Review",
      },
      { sourceRefs: ["test"] },
    );
    await createRoleEntityRecord(
      role,
      "case",
      {
        account: "Acme",
        title: "Expansion",
        owner: "Taylor",
        status: "active",
        nextStep: "Review plan",
      },
      { sourceRefs: ["test"] },
    );

    const capability = role.transcriptIngest!;
    const candidates = await findTranscriptEntityCandidates(tmpRoot, role, capability, "/tmp/acme-expansion-call.md");
    expect(candidates.length).toBeGreaterThan(0);

    const resolved = await resolveTranscriptEntity(tmpRoot, role, capability, undefined, "/tmp/acme-expansion-call.md");
    expect(resolved?.name).toContain("Expansion");
  });

  it("copies transcript evidence into a role entity and inbox", async () => {
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
        nextStep: "Review",
      },
      { sourceRefs: ["test"] },
    );
    const sourcePath = path.join(tmpRoot, "call.md");
    writeFileSync(sourcePath, "Transcript content");
    const capability = role.transcriptIngest!;
    const entity = (await findEntityById(tmpRoot, role, caseEntity.id))!;
    const copied = await copyTranscriptIntoRoleEntity(capability, entity, sourcePath);
    const inboxCopy = await copyTranscriptToRoleInbox(role, capability, sourcePath);
    expect(readFileSync(copied, "utf8")).toBe("Transcript content");
    expect(readFileSync(inboxCopy, "utf8")).toBe("Transcript content");
    expect(copied).toContain("transcripts");
    expect(inboxCopy).toContain("unmatched-transcripts");
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
