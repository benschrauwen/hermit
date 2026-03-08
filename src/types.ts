export type SessionKind = "default" | "transcript-ingest";

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

export interface CompanyBootstrapInput {
  companyName: string;
  companySummary: string;
  salesTeamName: string;
  salesMethodology: string;
  idealCustomerProfile: string;
  reviewCadence: string;
  topCompetitors: string[];
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

export interface WorkspaceInitializationState {
  initialized: boolean;
  hasCompanyRecord: boolean;
  peopleCount: number;
  productCount: number;
  dealCount: number;
}
