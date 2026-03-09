import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadRole } from "../src/roles.js";
import {
  appendLine,
  copyTranscriptIntoRoleEntity,
  copyTranscriptToRoleInbox,
  createCompanyRecords,
  createPersonRecord,
  createRoleEntityRecord,
  ensureWorkspaceScaffold,
  findCreatableRoleEntities,
  findEntityById,
  findTranscriptEntityCandidates,
  getWorkspaceInitializationState,
  getWorkspacePaths,
  makePersonId,
  makeSlug,
  resolveTranscriptEntity,
  scanEntities,
  writeFileSafely,
} from "../src/workspace.js";
import { seedRoleWorkspace, writeCompanyRecord } from "./test-helpers.js";

describe("workspace", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "multi-role-workspace-"));
    seedRoleWorkspace(tmpRoot, ["sales", "engineering"]);
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns shared and role-aware workspace paths", async () => {
    const role = await loadRole(tmpRoot, "sales");
    const sharedPaths = getWorkspacePaths(tmpRoot);
    const rolePaths = getWorkspacePaths(tmpRoot, role);
    expect(sharedPaths.companyDir).toBe(path.join(tmpRoot, "entities", "company"));
    expect(sharedPaths.peopleDir).toBe(path.join(tmpRoot, "entities", "people"));
    expect(rolePaths.roleDir).toBe(path.join(tmpRoot, "agents", "sales"));
    expect(rolePaths.sessionsDir).toBe(path.join(tmpRoot, "agents", "sales", ".role-agent", "sessions"));
  });

  it("slugifies and generates shared person IDs", () => {
    expect(makeSlug("Café Team")).toBe("cafe-team");
    expect(makePersonId("Jane Doe")).toBe("p-jane-doe");
  });

  it("creates shared and role scaffolds", async () => {
    const role = await loadRole(tmpRoot, "sales");
    await ensureWorkspaceScaffold(tmpRoot, role);
    expect(readdirSync(tmpRoot)).toEqual(expect.arrayContaining(["entities", "agents"]));
    expect(readFileSync(path.join(tmpRoot, "agents", "sales", "agent", "record.md"), "utf8")).toContain("Sales Leader");
    expect(readdirSync(path.join(tmpRoot, "entities", "deals"))).toEqual(
      expect.arrayContaining(["active", "closed-won", "closed-lost"]),
    );
  });

  it("reports initialization from shared company plus role entities", async () => {
    const role = await loadRole(tmpRoot, "sales");
    await ensureWorkspaceScaffold(tmpRoot, role);
    let state = await getWorkspaceInitializationState(tmpRoot, role);
    expect(state.initialized).toBe(false);

    writeCompanyRecord(tmpRoot);
    await createRoleEntityRecord(
      tmpRoot,
      role,
      "product",
      {
        name: "Widget",
        summary: "Summary",
        valueHypothesis: "Value",
        competitors: ["Rival"],
      },
      { sourceRefs: ["test"] },
    );

    state = await getWorkspaceInitializationState(tmpRoot, role);
    expect(state.initialized).toBe(true);
    expect(state.hasCompanyRecord).toBe(true);
    expect(state.roleEntityCounts.product).toBe(1);
  });

  it("supports safe writes and append operations", async () => {
    const filePath = path.join(tmpRoot, "notes", "log.md");
    await writeFileSafely(filePath, "one");
    await expect(writeFileSafely(filePath, "two")).rejects.toThrow(/Refusing to overwrite/);
    await appendLine(filePath, "two");
    expect(readFileSync(filePath, "utf8")).toBe("one" + "two\n");
  });

  it("creates shared company and person records from shared templates", async () => {
    await createCompanyRecords(
      tmpRoot,
      {
        companyName: "Acme",
        companySummary: "Summary",
        businessModel: "Subscription",
        operatingCadence: "Weekly reviews",
        strategicPriorities: "Land and expand",
        topCompetitors: ["Rival"],
      },
      { sourceRefs: ["agent onboarding"] },
    );
    const person = await createPersonRecord(
      tmpRoot,
      {
        name: "Jane Doe",
        role: "VP Sales",
        manager: "CEO",
        strengths: "Discovery",
        coachingFocus: "Forecasting",
      },
      { sourceRefs: ["agent onboarding"] },
    );
    expect(person.id).toBe("p-jane-doe");
    expect(readFileSync(path.join(tmpRoot, "entities", "company", "record.md"), "utf8")).toContain("Subscription");
    expect(readFileSync(path.join(person.path, "development-plan.md"), "utf8")).toContain("Review Cadence");
  });

  it("creates role-local sales entities with deterministic paths and templates", async () => {
    const role = await loadRole(tmpRoot, "sales");
    await ensureWorkspaceScaffold(tmpRoot, role);
    const product = await createRoleEntityRecord(
      tmpRoot,
      role,
      "product",
      {
        name: "Widget",
        summary: "Summary",
        valueHypothesis: "Value",
        competitors: ["Rival"],
      },
      { sourceRefs: ["agent onboarding"] },
    );
    const deal = await createRoleEntityRecord(
      tmpRoot,
      role,
      "deal",
      {
        accountName: "Acme",
        opportunityName: "Expansion",
        owner: "Jane Doe",
        stage: "qualification",
        amount: "50k",
        closeDate: "2026-06-01",
        nextStep: "Schedule demo",
      },
      { sourceRefs: ["agent onboarding"] },
    );

    expect(product.id).toBe("prd-widget");
    expect(deal.id).toMatch(/^d-\d{4}-\d{4}-acme-expansion$/);
    expect(deal.path).toContain(path.join("entities", "deals", "active"));
    expect(readFileSync(path.join(product.path, "playbook.md"), "utf8")).toContain("Ideal Buyers");
    expect(readFileSync(path.join(deal.path, "meddicc.md"), "utf8")).toContain("Economic Buyer");
  });

  it("scans shared and role entities together", async () => {
    const role = await loadRole(tmpRoot, "sales");
    await ensureWorkspaceScaffold(tmpRoot, role);
    mkdirSync(path.join(tmpRoot, "entities", "people", "p-jane"), { recursive: true });
    writeFileSync(
      path.join(tmpRoot, "entities", "people", "p-jane", "record.md"),
      "---\nid: p-jane\ntype: person\nname: Jane\n---\n",
    );
    await createRoleEntityRecord(
      tmpRoot,
      role,
      "product",
      { name: "Widget", summary: "Summary", valueHypothesis: "Value", competitors: [] },
      { sourceRefs: ["test"] },
    );
    const entities = await scanEntities(tmpRoot, role);
    expect(entities.map((entity) => entity.id)).toEqual(expect.arrayContaining(["p-jane", "prd-widget"]));
  });

  it("finds entities by ID and filters creatable role entities", async () => {
    const role = await loadRole(tmpRoot, "sales");
    await ensureWorkspaceScaffold(tmpRoot, role);
    const deal = await createRoleEntityRecord(
      tmpRoot,
      role,
      "deal",
      {
        accountName: "Acme",
        opportunityName: "Expansion",
        owner: "Jane Doe",
        stage: "qualification",
        amount: "50k",
        closeDate: "2026-06-01",
        nextStep: "Schedule demo",
      },
      { sourceRefs: ["test"] },
    );
    const found = await findEntityById(tmpRoot, role, deal.id);
    const activeDeals = await findCreatableRoleEntities(tmpRoot, role, "deal");
    expect(found?.id).toBe(deal.id);
    expect(activeDeals.map((entity) => entity.id)).toContain(deal.id);
  });

  it("matches transcript candidates against the sales transcript capability", async () => {
    const role = await loadRole(tmpRoot, "sales");
    await ensureWorkspaceScaffold(tmpRoot, role);
    await createRoleEntityRecord(
      tmpRoot,
      role,
      "deal",
      {
        accountName: "Acme",
        opportunityName: "Platform",
        owner: "Jane Doe",
        stage: "qualification",
        amount: "50k",
        closeDate: "2026-06-01",
        nextStep: "Demo",
      },
      { sourceRefs: ["test"] },
    );
    await createRoleEntityRecord(
      tmpRoot,
      role,
      "deal",
      {
        accountName: "Acme",
        opportunityName: "Expansion",
        owner: "Jane Doe",
        stage: "qualification",
        amount: "60k",
        closeDate: "2026-06-15",
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
    const role = await loadRole(tmpRoot, "sales");
    await ensureWorkspaceScaffold(tmpRoot, role);
    const deal = await createRoleEntityRecord(
      tmpRoot,
      role,
      "deal",
      {
        accountName: "Acme",
        opportunityName: "Expansion",
        owner: "Jane Doe",
        stage: "qualification",
        amount: "50k",
        closeDate: "2026-06-01",
        nextStep: "Demo",
      },
      { sourceRefs: ["test"] },
    );
    const sourcePath = path.join(tmpRoot, "call.md");
    writeFileSync(sourcePath, "Transcript content");
    const capability = role.transcriptIngest!;
    const entity = (await findEntityById(tmpRoot, role, deal.id))!;
    const copied = await copyTranscriptIntoRoleEntity(capability, entity, sourcePath);
    const inboxCopy = await copyTranscriptToRoleInbox(role, capability, sourcePath);
    expect(readFileSync(copied, "utf8")).toBe("Transcript content");
    expect(readFileSync(inboxCopy, "utf8")).toBe("Transcript content");
    expect(copied).toContain("transcripts");
    expect(inboxCopy).toContain("unmatched-transcripts");
  });

  it("supports a second non-sales role without changing core code", async () => {
    const role = await loadRole(tmpRoot, "engineering");
    await ensureWorkspaceScaffold(tmpRoot, role);
    const ticket = await createRoleEntityRecord(
      tmpRoot,
      role,
      "ticket",
      {
        title: "Stabilize deployment pipeline",
        owner: "Alex",
        status: "in-progress",
        priority: "P1",
        nextStep: "Create rollback checklist",
      },
      { sourceRefs: ["test"] },
    );
    expect(ticket.id).toBe("tkt-stabilize-deployment-pipeline");
    expect(readFileSync(path.join(ticket.path, "record.md"), "utf8")).toContain("Create rollback checklist");
  });
});
