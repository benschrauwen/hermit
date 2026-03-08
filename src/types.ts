export type UserMode = "product" | "people" | "pipeline" | "deal" | "prompt-maintenance";

export type InternalMode = UserMode | "bootstrap" | "transcript-ingest";

export interface PromptContext {
  workspaceRoot: string;
  entityId?: string;
  entityPath?: string;
  transcriptPath?: string;
}

export interface EntityRecord {
  id: string;
  type: string;
  name: string;
  path: string;
  status?: string;
  owner?: string;
}

export interface PersonBootstrapInput {
  name: string;
  role: string;
  manager: string;
  strengths: string;
  coachingFocus: string;
}

export interface ProductBootstrapInput {
  name: string;
  summary: string;
  valueHypothesis: string;
  competitors: string[];
}

export interface DealBootstrapInput {
  accountName: string;
  opportunityName: string;
  owner: string;
  stage: string;
  amount: string;
  closeDate: string;
  nextStep: string;
}

export interface BootstrapAnswers {
  companyName: string;
  companySummary: string;
  salesTeamName: string;
  salesMethodology: string;
  idealCustomerProfile: string;
  reviewCadence: string;
  topCompetitors: string[];
  people: PersonBootstrapInput[];
  products: ProductBootstrapInput[];
  deals: DealBootstrapInput[];
}
