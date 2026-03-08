function renderFrontmatter(data: Record<string, string | string[] | undefined>): string {
  const lines = Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        return [`${key}:`, ...value.map((entry) => `  - ${entry}`)];
      }

      return [`${key}: ${value}`];
    });

  return ["---", ...lines, "---", ""].join("\n");
}

function renderSection(title: string, body: string): string {
  return `## ${title}\n\n${body.trim()}\n`;
}

export function renderMarkdownDocument(
  metadata: Record<string, string | string[] | undefined>,
  sections: Array<{ title: string; body: string }>,
): string {
  return [
    renderFrontmatter(metadata),
    ...sections.map((section) => renderSection(section.title, section.body)),
  ].join("\n");
}

export function companyRecordTemplate(input: {
  companyName: string;
  companySummary: string;
  salesTeamName: string;
  salesMethodology: string;
  idealCustomerProfile: string;
  reviewCadence: string;
  topCompetitors: string[];
}): string {
  return renderMarkdownDocument(
    {
      id: "company",
      type: "company",
      name: input.companyName,
      status: "active",
      owner: input.salesTeamName,
      updated_at: new Date().toISOString(),
      source_refs: ["bootstrap questionnaire"],
    },
    [
      { title: "Summary", body: input.companySummary },
      { title: "Sales Team", body: input.salesTeamName },
      { title: "Sales Methodology", body: input.salesMethodology },
      { title: "Ideal Customer Profile", body: input.idealCustomerProfile },
      { title: "Review Cadence", body: input.reviewCadence },
      {
        title: "Competitive Landscape",
        body: input.topCompetitors.length > 0 ? input.topCompetitors.map((entry) => `- ${entry}`).join("\n") : "- Add competitors",
      },
      { title: "Open Questions", body: "- Add missing company context discovered during onboarding." },
    ],
  );
}

export function companyStrategyTemplate(): string {
  return "# Company Strategy\n\n## Growth Priorities\n\n- Add growth priorities.\n\n## Risks\n\n- Add strategic risks.\n";
}

export function companyGtmTemplate(): string {
  return "# GTM\n\n## Coverage Model\n\n- Add territory and segment coverage.\n\n## Operating Cadence\n\n- Add forecast and inspection cadence.\n";
}

export function personRecordTemplate(input: {
  id: string;
  name: string;
  role: string;
  manager: string;
  strengths: string;
  coachingFocus: string;
}): string {
  return renderMarkdownDocument(
    {
      id: input.id,
      type: "person",
      name: input.name,
      status: "active",
      owner: input.manager || "sales leadership",
      updated_at: new Date().toISOString(),
      source_refs: ["bootstrap questionnaire"],
    },
    [
      { title: "Role", body: input.role },
      { title: "Manager", body: input.manager || "Unknown" },
      { title: "Strengths", body: input.strengths || "Add strengths." },
      { title: "Coaching Focus", body: input.coachingFocus || "Add coaching focus." },
      { title: "Current Priorities", body: "- Add current priorities." },
    ],
  );
}

export function developmentPlanTemplate(name: string): string {
  return `# Development Plan\n\n## ${name}\n\n## Focus Areas\n\n- Add focus areas.\n\n## Actions\n\n- Add concrete actions.\n\n## Review Cadence\n\n- Add review cadence.\n`;
}

export function productRecordTemplate(input: {
  id: string;
  name: string;
  summary: string;
  valueHypothesis: string;
  competitors: string[];
}): string {
  return renderMarkdownDocument(
    {
      id: input.id,
      type: "product",
      name: input.name,
      status: "active",
      owner: "sales leadership",
      updated_at: new Date().toISOString(),
      source_refs: ["bootstrap questionnaire"],
    },
    [
      { title: "Summary", body: input.summary },
      { title: "Value Hypothesis", body: input.valueHypothesis },
      {
        title: "Competitors",
        body: input.competitors.length > 0 ? input.competitors.map((entry) => `- ${entry}`).join("\n") : "- Add competitors.",
      },
      { title: "Open Questions", body: "- Add missing positioning questions." },
    ],
  );
}

export function playbookTemplate(name: string): string {
  return `# Playbook\n\n## ${name}\n\n## Ideal Buyers\n\n- Add ideal buyers.\n\n## Discovery Themes\n\n- Add discovery themes.\n\n## Proof Points\n\n- Add proof points.\n`;
}

export function competitiveAnalysisTemplate(name: string): string {
  return `# Competitive Analysis\n\n## ${name}\n\n## Main Competitors\n\n- Add competitors.\n\n## Win Strategy\n\n- Add win strategy.\n`;
}

export function dealRecordTemplate(input: {
  id: string;
  accountName: string;
  opportunityName: string;
  owner: string;
  stage: string;
  amount: string;
  closeDate: string;
  nextStep: string;
}): string {
  return renderMarkdownDocument(
    {
      id: input.id,
      type: "deal",
      name: `${input.accountName} - ${input.opportunityName}`,
      status: input.stage,
      owner: input.owner,
      updated_at: new Date().toISOString(),
      source_refs: ["bootstrap questionnaire"],
    },
    [
      { title: "Account", body: input.accountName },
      { title: "Opportunity", body: input.opportunityName },
      { title: "Owner", body: input.owner },
      { title: "Stage", body: input.stage },
      { title: "Amount", body: input.amount || "Unknown" },
      { title: "Close Date", body: input.closeDate || "Unknown" },
      { title: "Next Step", body: input.nextStep || "Add next step." },
      { title: "Current Risks", body: "- Add deal risks." },
    ],
  );
}

export function meddiccTemplate(name: string): string {
  return `# MEDDICC\n\n## ${name}\n\n## Metrics\n\n- Add metrics.\n\n## Economic Buyer\n\n- Add economic buyer.\n\n## Decision Criteria\n\n- Add decision criteria.\n\n## Decision Process\n\n- Add decision process.\n\n## Paper Process\n\n- Add paper process.\n\n## Identified Pain\n\n- Add identified pain.\n\n## Champion\n\n- Add champion.\n\n## Competition\n\n- Add competition.\n`;
}

export function activityLogTemplate(name: string): string {
  return `# Activity Log\n\n## ${name}\n\n- ${new Date().toISOString()}: Deal created during bootstrap.\n`;
}
