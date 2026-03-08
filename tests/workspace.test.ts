import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  getWorkspacePaths,
  ensureWorkspaceScaffold,
  getWorkspaceInitializationState,
  makeSlug,
  makePersonId,
  makeProductId,
  makeDealId,
  writeFileSafely,
  appendLine,
  buildEntityPath,
  createCompanyRecords,
  createDealRecord,
  createPersonRecord,
  createProductRecord,
  scanEntities,
  findEntityById,
  findDeals,
  findActiveDeals,
  findTranscriptDealCandidates,
  resolveTranscriptDeal,
} from "../src/workspace.js";

describe("getWorkspacePaths", () => {
  it("returns paths under root", () => {
    const root = "/workspace";
    const paths = getWorkspacePaths(root);
    expect(paths.root).toBe(root);
    expect(paths.agentsFile).toBe(path.join(root, "AGENTS.md"));
    expect(paths.promptsDir).toBe(path.join(root, "prompts"));
    expect(paths.companyDir).toBe(path.join(root, "company"));
    expect(paths.peopleDir).toBe(path.join(root, "people"));
    expect(paths.productDir).toBe(path.join(root, "product"));
    expect(paths.dealsDir).toBe(path.join(root, "deals"));
    expect(paths.activeDealsDir).toBe(path.join(root, "deals", "active"));
    expect(paths.closedWonDealsDir).toBe(path.join(root, "deals", "closed-won"));
    expect(paths.closedLostDealsDir).toBe(path.join(root, "deals", "closed-lost"));
    expect(paths.supportingFilesDir).toBe(path.join(root, "supporting-files"));
    expect(paths.sessionsDir).toBe(path.join(root, ".sales-agent", "sessions"));
  });
});

describe("makeSlug", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(makeSlug("Acme Corp")).toBe("acme-corp");
  });

  it("strips non-alphanumeric and collapses", () => {
    expect(makeSlug("  Hello   World!  ")).toBe("hello-world");
  });

  it("handles unicode-ish safely", () => {
    // slugify strips accents; "Café" -> "cafe"
    expect(makeSlug("Café")).toBe("cafe");
  });
});

describe("makePersonId", () => {
  it("prefixes slug with p-", () => {
    expect(makePersonId("Jane Doe")).toBe("p-jane-doe");
  });
});

describe("makeProductId", () => {
  it("prefixes slug with prd-", () => {
    expect(makeProductId("Widget Pro")).toBe("prd-widget-pro");
  });
});

describe("buildEntityPath", () => {
  const root = "/root";

  it("returns path under people for person", () => {
    expect(buildEntityPath(root, "person", "p-jane")).toBe(
      path.join(root, "people", "p-jane"),
    );
  });

  it("returns path under product for product", () => {
    expect(buildEntityPath(root, "product", "prd-widget")).toBe(
      path.join(root, "product", "prd-widget"),
    );
  });

  it("returns path under active deals for deal", () => {
    expect(buildEntityPath(root, "deal", "d-2025-0001-acme")).toBe(
      path.join(root, "deals", "active", "d-2025-0001-acme"),
    );
  });
});

describe("workspace fs operations", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(tmpdir(), "sales-leader-test-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe("ensureWorkspaceScaffold", () => {
    it("creates required directories", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      const companyDir = path.join(tmpRoot, "company");
      const inboxDir = path.join(tmpRoot, "supporting-files", "inbox");
      expect(readdirSync(tmpRoot)).toContain("company");
      expect(readdirSync(path.join(tmpRoot, "deals"))).toEqual(
        expect.arrayContaining(["active", "closed-won", "closed-lost"]),
      );
      expect(readdirSync(path.join(tmpRoot, "supporting-files"))).toContain(
        "inbox",
      );
    });
  });

  describe("getWorkspaceInitializationState", () => {
    it("reports uninitialized workspace when company record and entities are missing", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      const state = await getWorkspaceInitializationState(tmpRoot);
      expect(state).toEqual({
        initialized: false,
        hasCompanyRecord: false,
        peopleCount: 0,
        productCount: 0,
        dealCount: 0,
      });
    });

    it("reports initialized workspace when company record and at least one entity exist", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      await createCompanyRecords(
        tmpRoot,
        {
          companyName: "Acme",
          companySummary: "Summary",
          salesTeamName: "Sales",
          salesMethodology: "MEDDICC",
          idealCustomerProfile: "ICP",
          reviewCadence: "Weekly",
          topCompetitors: ["Rival"],
        },
        { sourceRefs: ["test"] },
      );
      await createProductRecord(
        tmpRoot,
        {
          name: "Widget",
          summary: "A widget",
          valueHypothesis: "Value",
          competitors: ["Rival"],
        },
        { sourceRefs: ["test"] },
      );

      const state = await getWorkspaceInitializationState(tmpRoot);
      expect(state.initialized).toBe(true);
      expect(state.hasCompanyRecord).toBe(true);
      expect(state.productCount).toBe(1);
    });
  });

  describe("writeFileSafely", () => {
    it("writes new file and creates parent dirs", async () => {
      const filePath = path.join(tmpRoot, "a", "b", "file.md");
      await writeFileSafely(filePath, "content");
      const { readFileSync } = await import("node:fs");
      expect(readFileSync(filePath, "utf8")).toBe("content");
    });

    it("refuses to overwrite existing file by default", async () => {
      const filePath = path.join(tmpRoot, "existing.md");
      writeFileSync(filePath, "original");
      await expect(writeFileSafely(filePath, "new")).rejects.toThrow(
        /Refusing to overwrite/,
      );
      const { readFileSync } = await import("node:fs");
      expect(readFileSync(filePath, "utf8")).toBe("original");
    });

    it("overwrites when force is true", async () => {
      const filePath = path.join(tmpRoot, "file.md");
      writeFileSync(filePath, "original");
      await writeFileSafely(filePath, "new", true);
      const { readFileSync } = await import("node:fs");
      expect(readFileSync(filePath, "utf8")).toBe("new");
    });
  });

  describe("appendLine", () => {
    it("appends line with newline and creates parent dirs", async () => {
      const filePath = path.join(tmpRoot, "dir", "log.md");
      await appendLine(filePath, "line one");
      await appendLine(filePath, "line two");
      const { readFileSync } = await import("node:fs");
      expect(readFileSync(filePath, "utf8")).toBe("line one\nline two\n");
    });
  });

  describe("makeDealId", () => {
    it("returns d-YYYY-0001-slug when no deals exist", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      const id = await makeDealId(tmpRoot, "Acme", "Deal One");
      const year = new Date().getFullYear();
      expect(id).toMatch(new RegExp(`^d-${year}-0001-`));
      expect(id).toContain("acme");
    });

    it("increments sequence when deals exist", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      const dealsDir = path.join(tmpRoot, "deals", "active");
      const year = new Date().getFullYear();
      mkdirSync(path.join(dealsDir, `d-${year}-0001-existing`), {
        recursive: true,
      });
      mkdirSync(path.join(tmpRoot, "deals", "closed-won", `d-${year}-0002-another`), {
        recursive: true,
      });
      const id = await makeDealId(tmpRoot, "New", "Deal");
      expect(id).toBe(`d-${year}-0003-new-deal`);
    });
  });

  describe("scanEntities", () => {
    it("returns empty when no entity dirs", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      const entities = await scanEntities(tmpRoot);
      expect(entities).toEqual([]);
    });

    it("reads record.md frontmatter for id, type, name", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      const personDir = path.join(tmpRoot, "people", "p-jane");
      mkdirSync(personDir, { recursive: true });
      writeFileSync(
        path.join(personDir, "record.md"),
        `---
id: p-jane
type: person
name: Jane Doe
---
`,
      );
      const entities = await scanEntities(tmpRoot);
      expect(entities.length).toBe(1);
      expect(entities[0]).toMatchObject({
        id: "p-jane",
        type: "person",
        name: "Jane Doe",
      });
    });

    it("falls back to dir name when record missing or invalid", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      const personDir = path.join(tmpRoot, "people", "p-unknown");
      mkdirSync(personDir, { recursive: true });
      const entities = await scanEntities(tmpRoot);
      expect(entities.length).toBe(1);
      expect(entities[0].id).toBe("p-unknown");
      expect(entities[0].type).toBe("unknown");
      expect(entities[0].name).toBe("p-unknown");
    });
  });

  describe("findEntityById", () => {
    it("returns undefined when no entities", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      expect(await findEntityById(tmpRoot, "p-jane")).toBeUndefined();
    });

    it("returns entity when id matches", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      const personDir = path.join(tmpRoot, "people", "p-jane");
      mkdirSync(personDir, { recursive: true });
      writeFileSync(
        path.join(personDir, "record.md"),
        "---\nid: p-jane\ntype: person\nname: Jane\n---\n",
      );
      const entity = await findEntityById(tmpRoot, "p-jane");
      expect(entity?.id).toBe("p-jane");
      expect(entity?.name).toBe("Jane");
    });
  });

  describe("findDeals", () => {
    it("returns only entities with type deal across active and closed buckets", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      const peopleDir = path.join(tmpRoot, "people", "p-jane");
      const activeDealDir = path.join(tmpRoot, "deals", "active", "d-2025-0001-acme");
      const closedDealDir = path.join(tmpRoot, "deals", "closed-won", "d-2025-0002-beta");
      mkdirSync(peopleDir, { recursive: true });
      mkdirSync(activeDealDir, { recursive: true });
      mkdirSync(closedDealDir, { recursive: true });
      writeFileSync(
        path.join(peopleDir, "record.md"),
        "---\nid: p-jane\ntype: person\nname: Jane\n---\n",
      );
      writeFileSync(
        path.join(activeDealDir, "record.md"),
        "---\nid: d-2025-0001-acme\ntype: deal\nname: Acme\n---\n",
      );
      writeFileSync(
        path.join(closedDealDir, "record.md"),
        "---\nid: d-2025-0002-beta\ntype: deal\nname: Beta\n---\n",
      );
      const deals = await findDeals(tmpRoot);
      expect(deals).toHaveLength(2);
      expect(deals.map((deal) => deal.id)).toEqual(
        expect.arrayContaining(["d-2025-0001-acme", "d-2025-0002-beta"]),
      );
    });
  });

  describe("findActiveDeals", () => {
    it("returns active deals and treats legacy top-level deal paths as active", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      const activeDealDir = path.join(tmpRoot, "deals", "active", "d-2025-0001-acme");
      const legacyDealDir = path.join(tmpRoot, "deals", "d-2025-0002-legacy");
      const closedDealDir = path.join(tmpRoot, "deals", "closed-lost", "d-2025-0003-gamma");
      mkdirSync(activeDealDir, { recursive: true });
      mkdirSync(legacyDealDir, { recursive: true });
      mkdirSync(closedDealDir, { recursive: true });
      writeFileSync(
        path.join(activeDealDir, "record.md"),
        "---\nid: d-2025-0001-acme\ntype: deal\nname: Acme\n---\n",
      );
      writeFileSync(
        path.join(legacyDealDir, "record.md"),
        "---\nid: d-2025-0002-legacy\ntype: deal\nname: Legacy\n---\n",
      );
      writeFileSync(
        path.join(closedDealDir, "record.md"),
        "---\nid: d-2025-0003-gamma\ntype: deal\nname: Gamma\n---\n",
      );

      const deals = await findActiveDeals(tmpRoot);
      expect(deals.map((deal) => deal.id)).toEqual(
        expect.arrayContaining(["d-2025-0001-acme", "d-2025-0002-legacy"]),
      );
      expect(deals.map((deal) => deal.id)).not.toContain("d-2025-0003-gamma");
    });
  });

  describe("resolveTranscriptDeal", () => {
    it("returns entity when explicitDealId is given", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      const dealsDir = path.join(tmpRoot, "deals", "active", "d-2025-0001-acme");
      mkdirSync(dealsDir, { recursive: true });
      writeFileSync(
        path.join(dealsDir, "record.md"),
        "---\nid: d-2025-0001-acme\ntype: deal\nname: Acme Deal\n---\n",
      );
      const deal = await resolveTranscriptDeal(
        tmpRoot,
        "d-2025-0001-acme",
        "/any/transcript.md",
      );
      expect(deal?.id).toBe("d-2025-0001-acme");
    });

    it("matches by deal name slug in transcript path when no explicit id", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      const dealsDir = path.join(tmpRoot, "deals", "active", "d-2025-0001-acme");
      mkdirSync(dealsDir, { recursive: true });
      writeFileSync(
        path.join(dealsDir, "record.md"),
        "---\nid: d-2025-0001-acme\ntype: deal\nname: Acme Deal\n---\n",
      );
      const deal = await resolveTranscriptDeal(
        tmpRoot,
        undefined,
        "/path/acme-deal-call.md",
      );
      expect(deal?.id).toBe("d-2025-0001-acme");
    });

    it("returns ranked transcript deal candidates for manual confirmation when matches are ambiguous", async () => {
      await ensureWorkspaceScaffold(tmpRoot);
      const firstDealDir = path.join(tmpRoot, "deals", "active", "d-2025-0001-acme");
      const secondDealDir = path.join(tmpRoot, "deals", "active", "d-2025-0002-acme");
      mkdirSync(firstDealDir, { recursive: true });
      mkdirSync(secondDealDir, { recursive: true });
      writeFileSync(
        path.join(firstDealDir, "record.md"),
        "---\nid: d-2025-0001-acme\ntype: deal\nname: Acme Platform\n---\n",
      );
      writeFileSync(
        path.join(secondDealDir, "record.md"),
        "---\nid: d-2025-0002-acme\ntype: deal\nname: Acme Expansion\n---\n",
      );

      const candidates = await findTranscriptDealCandidates(tmpRoot, "/path/d-2025-acme-call.md");
      expect(candidates.map((candidate) => candidate.id)).toHaveLength(2);
      expect(candidates.map((candidate) => candidate.id)).toEqual(
        expect.arrayContaining(["d-2025-0001-acme", "d-2025-0002-acme"]),
      );

      const deal = await resolveTranscriptDeal(tmpRoot, undefined, "/path/d-2025-acme-call.md");
      expect(deal).toBeUndefined();
    });
  });

  describe("copyTranscriptIntoDeal", () => {
    it("copies transcript into deal transcripts dir and returns path", async () => {
      const { copyTranscriptIntoDeal } = await import("../src/workspace.js");
      await ensureWorkspaceScaffold(tmpRoot);
      const dealsDir = path.join(tmpRoot, "deals", "active", "d-2025-0001-acme");
      mkdirSync(dealsDir, { recursive: true });
      writeFileSync(
        path.join(dealsDir, "record.md"),
        "---\nid: d-2025-0001-acme\ntype: deal\nname: Acme\n---\n",
      );
      const sourcePath = path.join(tmpRoot, "call.md");
      writeFileSync(sourcePath, "Transcript content");
      const deal = { id: "d-2025-0001-acme", type: "deal", name: "Acme", path: dealsDir };
      const dest = await copyTranscriptIntoDeal(tmpRoot, deal, sourcePath);
      expect(dest).toContain("transcripts");
      expect(dest).toContain("call");
      const { readFileSync } = await import("node:fs");
      expect(readFileSync(dest, "utf8")).toBe("Transcript content");
    });
  });

  describe("copyTranscriptToInbox", () => {
    it("copies transcript to unmatched-transcripts and returns path", async () => {
      const { copyTranscriptToInbox } = await import("../src/workspace.js");
      await ensureWorkspaceScaffold(tmpRoot);
      const sourcePath = path.join(tmpRoot, "loose-transcript.md");
      writeFileSync(sourcePath, "Loose content");
      const dest = await copyTranscriptToInbox(tmpRoot, sourcePath);
      expect(dest).toContain("unmatched-transcripts");
      expect(dest).toContain("loose-transcript");
      const { readFileSync } = await import("node:fs");
      expect(readFileSync(dest, "utf8")).toBe("Loose content");
    });
  });

  describe("deterministic record creation helpers", () => {
    it("creates company, person, product, and deal records with canonical paths", async () => {
      await ensureWorkspaceScaffold(tmpRoot);

      const company = await createCompanyRecords(
        tmpRoot,
        {
          companyName: "Acme",
          companySummary: "Summary",
          salesTeamName: "Sales",
          salesMethodology: "MEDDICC",
          idealCustomerProfile: "ICP",
          reviewCadence: "Weekly",
          topCompetitors: [],
        },
        { sourceRefs: ["agent onboarding"] },
      );
      const person = await createPersonRecord(
        tmpRoot,
        {
          name: "Jane Doe",
          role: "AE",
          manager: "Bob",
          strengths: "Discovery",
          coachingFocus: "Closing",
        },
        { sourceRefs: ["agent onboarding"] },
      );
      const product = await createProductRecord(
        tmpRoot,
        {
          name: "Widget",
          summary: "Summary",
          valueHypothesis: "Value",
          competitors: [],
        },
        { sourceRefs: ["agent onboarding"] },
      );
      const deal = await createDealRecord(
        tmpRoot,
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

      const { readFileSync } = await import("node:fs");
      expect(company.path).toBe(path.join(tmpRoot, "company", "record.md"));
      expect(person.id).toBe("p-jane-doe");
      expect(product.id).toBe("prd-widget");
      expect(deal.id).toMatch(/^d-\d{4}-\d{4}-acme-expansion$/);
      expect(deal.path).toContain(path.join("deals", "active"));
      expect(readFileSync(path.join(person.path, "record.md"), "utf8")).toContain("agent onboarding");
      expect(readFileSync(path.join(product.path, "playbook.md"), "utf8")).toContain("Ideal Buyers");
      expect(readFileSync(path.join(deal.path, "activity-log.md"), "utf8")).toContain(
        "Deal created during agent onboarding",
      );
    });
  });
});
