import { describe, it, expect } from "vitest";
import {
  renderMarkdownDocument,
  companyRecordTemplate,
  companyStrategyTemplate,
  companyGtmTemplate,
  personRecordTemplate,
  developmentPlanTemplate,
  productRecordTemplate,
  playbookTemplate,
  competitiveAnalysisTemplate,
  dealRecordTemplate,
  meddiccTemplate,
  activityLogTemplate,
} from "../src/templates.js";

describe("renderMarkdownDocument", () => {
  it("renders frontmatter and sections", () => {
    const out = renderMarkdownDocument(
      { id: "x", name: "Test" },
      [{ title: "Section A", body: "Body A" }],
    );
    expect(out).toContain("---");
    expect(out).toContain("id: x");
    expect(out).toContain("name: Test");
    expect(out).toContain("## Section A");
    expect(out).toContain("Body A");
  });

  it("renders array frontmatter as YAML list", () => {
    const out = renderMarkdownDocument(
      { tags: ["a", "b"] },
      [{ title: "T", body: "B" }],
    );
    expect(out).toContain("tags:");
    expect(out).toContain("- a");
    expect(out).toContain("- b");
  });

  it("omits undefined frontmatter values", () => {
    const out = renderMarkdownDocument(
      { id: "x", skip: undefined },
      [{ title: "T", body: "B" }],
    );
    expect(out).toContain("id: x");
    expect(out).not.toMatch(/skip:/);
  });
});

describe("companyRecordTemplate", () => {
  it("produces markdown with company fields", () => {
    const out = companyRecordTemplate({
      companyName: "Acme",
      companySummary: "Summary",
      salesTeamName: "Sales",
      salesMethodology: "MEDDICC",
      idealCustomerProfile: "ICP",
      reviewCadence: "Weekly",
      topCompetitors: ["C1", "C2"],
    });
    expect(out).toContain("id: company");
    expect(out).toContain("name: Acme");
    expect(out).toContain("Summary");
    expect(out).toContain("Competitive Landscape");
    expect(out).toContain("- C1");
    expect(out).toContain("- C2");
  });

  it("handles empty competitors", () => {
    const out = companyRecordTemplate({
      companyName: "Acme",
      companySummary: "S",
      salesTeamName: "Sales",
      salesMethodology: "M",
      idealCustomerProfile: "I",
      reviewCadence: "W",
      topCompetitors: [],
    });
    expect(out).toContain("- Add competitors");
  });
});

describe("companyStrategyTemplate", () => {
  it("returns static strategy template", () => {
    const out = companyStrategyTemplate();
    expect(out).toContain("Company Strategy");
    expect(out).toContain("Growth Priorities");
    expect(out).toContain("Risks");
  });
});

describe("companyGtmTemplate", () => {
  it("returns static GTM template", () => {
    const out = companyGtmTemplate();
    expect(out).toContain("GTM");
    expect(out).toContain("Coverage Model");
    expect(out).toContain("Operating Cadence");
  });
});

describe("personRecordTemplate", () => {
  it("produces markdown with person fields", () => {
    const out = personRecordTemplate({
      id: "p-jane",
      name: "Jane",
      role: "AE",
      manager: "Bob",
      strengths: "Discovery",
      coachingFocus: "Closing",
    });
    expect(out).toContain("id: p-jane");
    expect(out).toContain("type: person");
    expect(out).toContain("name: Jane");
    expect(out).toContain("Role");
    expect(out).toContain("AE");
    expect(out).toContain("Coaching Focus");
  });

  it("uses fallbacks for optional manager and strengths", () => {
    const out = personRecordTemplate({
      id: "p-x",
      name: "X",
      role: "R",
      manager: "",
      strengths: "",
      coachingFocus: "",
    });
    expect(out).toContain("Unknown");
    expect(out).toContain("Add strengths.");
    expect(out).toContain("Add coaching focus.");
  });
});

describe("developmentPlanTemplate", () => {
  it("includes name in heading", () => {
    const out = developmentPlanTemplate("Alice");
    expect(out).toContain("## Alice");
    expect(out).toContain("Focus Areas");
    expect(out).toContain("Actions");
  });
});

describe("productRecordTemplate", () => {
  it("produces markdown with product fields", () => {
    const out = productRecordTemplate({
      id: "prd-widget",
      name: "Widget",
      summary: "A widget",
      valueHypothesis: "Value",
      competitors: ["X", "Y"],
    });
    expect(out).toContain("id: prd-widget");
    expect(out).toContain("type: product");
    expect(out).toContain("name: Widget");
    expect(out).toContain("- X");
    expect(out).toContain("- Y");
  });

  it("handles empty competitors", () => {
    const out = productRecordTemplate({
      id: "prd-x",
      name: "X",
      summary: "S",
      valueHypothesis: "V",
      competitors: [],
    });
    expect(out).toContain("Add competitors.");
  });
});

describe("playbookTemplate", () => {
  it("includes name and sections", () => {
    const out = playbookTemplate("Enterprise");
    expect(out).toContain("## Enterprise");
    expect(out).toContain("Ideal Buyers");
    expect(out).toContain("Discovery Themes");
  });
});

describe("competitiveAnalysisTemplate", () => {
  it("includes name and sections", () => {
    const out = competitiveAnalysisTemplate("Competitor A");
    expect(out).toContain("## Competitor A");
    expect(out).toContain("Main Competitors");
    expect(out).toContain("Win Strategy");
  });
});

describe("dealRecordTemplate", () => {
  it("produces markdown with deal fields", () => {
    const out = dealRecordTemplate({
      id: "d-2025-0001-acme",
      accountName: "Acme",
      opportunityName: "Deal One",
      owner: "Jane",
      stage: "qualification",
      amount: "50k",
      closeDate: "2025-06-01",
      nextStep: "Demo",
    });
    expect(out).toContain("id: d-2025-0001-acme");
    expect(out).toContain("type: deal");
    expect(out).toContain("Acme - Deal One");
    expect(out).toContain("Account");
    expect(out).toContain("Acme");
    expect(out).toContain("50k");
  });

  it("uses fallbacks for amount and closeDate", () => {
    const out = dealRecordTemplate({
      id: "d-1",
      accountName: "A",
      opportunityName: "O",
      owner: "X",
      stage: "qual",
      amount: "",
      closeDate: "",
      nextStep: "",
    });
    expect(out).toContain("Unknown");
    expect(out).toContain("Add next step.");
  });
});

describe("meddiccTemplate", () => {
  it("includes MEDDICC sections", () => {
    const out = meddiccTemplate("Acme Deal");
    expect(out).toContain("# MEDDICC");
    expect(out).toContain("## Acme Deal");
    expect(out).toContain("Metrics");
    expect(out).toContain("Economic Buyer");
    expect(out).toContain("Champion");
  });
});

describe("activityLogTemplate", () => {
  it("includes title and initial entry", () => {
    const out = activityLogTemplate("Deal");
    expect(out).toContain("# Activity Log");
    expect(out).toContain("## Deal");
    expect(out).toContain("Deal created during bootstrap");
  });
});
