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
  sourceRefs?: string[];
}): string {
  return renderMarkdownDocument(
    {
      id: "company",
      type: "company",
      name: input.companyName,
      status: "active",
      owner: input.salesTeamName,
      updated_at: new Date().toISOString(),
      source_refs: input.sourceRefs ?? ["bootstrap questionnaire"],
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

export function agentRecordTemplate(): string {
  return renderMarkdownDocument(
    {
      id: "sales-leader-agent",
      type: "agent",
      name: "Sales Leader Agent",
      status: "active",
      owner: "sales leadership",
      updated_at: new Date().toISOString(),
      source_refs: ["workspace default scaffold"],
    },
    [
      {
        title: "Summary",
        body: "This file is the clarified operating system for the sales leader agent. Keep active commitments here after they leave the inbox.",
      },
      {
        title: "Current Focus",
        body: [
          "- Keep the workspace current and trustworthy.",
          "- Drive the highest-leverage next action that is not blocked.",
          "- Surface due reminders or questions in the next relevant session.",
        ].join("\n"),
      },
      {
        title: "Calendar",
        body: [
          "- `agt-cal-weekly-review`: At the first active session of each week, review inbox, projects, next actions, waiting-for items, and due follow-ups.",
        ].join("\n"),
      },
      { title: "Projects", body: "- Add active multi-step outcomes." },
      { title: "Next Actions", body: "- Add the next visible actions for active work." },
      { title: "Waiting For", body: "- Add delegated or blocked items with follow-up dates." },
      { title: "Someday / Maybe", body: "- Add worthwhile ideas that are not active commitments." },
      {
        title: "Review Cadence",
        body: [
          "- Session start: scan `agent/inbox.md` and this file before substantial work.",
          "- Weekly review: clear stale items, confirm every active project has a next action, and prune low-value commitments.",
        ].join("\n"),
      },
    ],
  );
}

export function agentInboxTemplate(): string {
  return renderMarkdownDocument(
    {
      id: "sales-leader-agent-inbox",
      type: "agent-inbox",
      name: "Sales Leader Agent Inbox",
      status: "active",
      owner: "sales leadership",
      updated_at: new Date().toISOString(),
      source_refs: ["workspace default scaffold"],
    },
    [
      {
        title: "How To Use",
        body: [
          "- Capture raw internal commitments here before clarifying them.",
          "- Preserve the original wording when possible.",
          "- Once clarified, move the active result into `agent/record.md` and mark the inbox item accordingly.",
        ].join("\n"),
      },
      { title: "Open Inbox Items", body: "- None." },
      {
        title: "Capture Template",
        body: [
          "### agi-YYYYMMDD-001",
          "- captured_at:",
          "- source:",
          "- raw_input:",
          "- desired_outcome:",
          "- why_it_matters:",
          "- notify:",
          "- not_before:",
          "- due_at:",
          "- status: new",
          "- clarification_notes:",
        ].join("\n"),
      },
    ],
  );
}

export function personRecordTemplate(input: {
  id: string;
  name: string;
  role: string;
  manager: string;
  strengths: string;
  coachingFocus: string;
  sourceRefs?: string[];
}): string {
  return renderMarkdownDocument(
    {
      id: input.id,
      type: "person",
      name: input.name,
      status: "active",
      owner: input.manager || "sales leadership",
      updated_at: new Date().toISOString(),
      source_refs: input.sourceRefs ?? ["bootstrap questionnaire"],
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
  sourceRefs?: string[];
}): string {
  return renderMarkdownDocument(
    {
      id: input.id,
      type: "product",
      name: input.name,
      status: "active",
      owner: "sales leadership",
      updated_at: new Date().toISOString(),
      source_refs: input.sourceRefs ?? ["bootstrap questionnaire"],
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
  sourceRefs?: string[];
}): string {
  return renderMarkdownDocument(
    {
      id: input.id,
      type: "deal",
      name: `${input.accountName} - ${input.opportunityName}`,
      status: input.stage,
      owner: input.owner,
      updated_at: new Date().toISOString(),
      source_refs: input.sourceRefs ?? ["bootstrap questionnaire"],
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

export function activityLogTemplate(name: string, creationSource = "bootstrap"): string {
  return `# Activity Log\n\n## ${name}\n\n- ${new Date().toISOString()}: Deal created during ${creationSource}.\n`;
}
