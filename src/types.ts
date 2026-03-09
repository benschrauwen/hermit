export type RoleFieldType = "string" | "string-array";
export type RoleEntityIdStrategy = "prefixed-slug" | "year-sequence-slug" | "singleton";

export interface PromptContext {
  workspaceRoot: string;
  roleId?: string;
  roleRoot?: string;
  entityId?: string;
  entityPath?: string;
  transcriptPath?: string;
  currentDateTimeIso?: string;
  currentLocalDateTime?: string;
  currentTimeZone?: string;
}

export interface EntityRecord {
  id: string;
  type: string;
  name: string;
  path: string;
  scope: "shared" | "role";
  roleId?: string;
  status?: string;
  owner?: string;
}

export interface CompanyBootstrapInput {
  companyName: string;
  companySummary: string;
  businessModel: string;
  operatingCadence: string;
  strategicPriorities: string;
  topCompetitors: string[];
}

export interface PersonBootstrapInput {
  name: string;
  role: string;
  manager: string;
  strengths: string;
  coachingFocus: string;
}

export interface RoleFieldDefinition {
  key: string;
  label: string;
  type: RoleFieldType;
  description: string;
  required?: boolean;
  defaultValue?: string | string[];
}

export interface RoleTemplateFileDefinition {
  path: string;
  template: string;
}

export interface RoleEntityDefinition {
  key: string;
  label: string;
  type: string;
  createDirectory: string;
  scanDirectories?: string[];
  excludeDirectoryNames?: string[];
  idStrategy: RoleEntityIdStrategy;
  idPrefix?: string;
  idSourceFields: string[];
  nameTemplate: string;
  statusField?: string;
  ownerField?: string;
  includeInInitialization?: boolean;
  extraDirectories?: string[];
  fields: RoleFieldDefinition[];
  files: RoleTemplateFileDefinition[];
}

export interface TranscriptIngestCapability {
  entityType: string;
  commandPrompt: string;
  systemPrompts: string[];
  evidenceDirectory: string;
  unmatchedDirectory: string;
  activityLogFile: string;
}

export interface RoleExplorerRendererConfig {
  detail?: Record<string, string>;
  files?: Record<string, Record<string, string>>;
}

export interface RoleExplorerConfig {
  renderers?: RoleExplorerRendererConfig;
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  roleDir: string;
  root: string;
  entitiesDir: string;
  agentsFile: string;
  manifestFile: string;
  sharedPromptsDir: string;
  rolePromptsDir: string;
  sharedSkillsDir: string;
  roleSkillsDir: string;
  entityDefsDir: string;
  agentDir: string;
  sessionsDir: string;
  roleDirectories: string[];
  agentFiles: string[];
  entities: RoleEntityDefinition[];
  transcriptIngest?: TranscriptIngestCapability;
  explorer?: RoleExplorerConfig;
}

export interface RoleResolution {
  root: string;
  role: RoleDefinition;
}

export interface WorkspaceInitializationState {
  initialized: boolean;
  hasCompanyRecord: boolean;
  peopleCount: number;
  roleEntityCount: number;
  roleEntityCounts: Record<string, number>;
}

export interface TelemetrySessionContext {
  workspaceRoot: string;
  roleId?: string;
  commandName: string;
  persist: boolean;
  continueRecent?: boolean;
  modelProvider: string;
  modelId: string;
}

export interface TelemetryToolReport {
  toolName: string;
  callCount: number;
  errorCount: number;
  errorRate?: number;
  durationP50Ms?: number;
  durationP95Ms?: number;
}

export interface TelemetryTurnReport {
  sessionId: string;
  turnId: string;
  roleId?: string;
  commandName: string;
  durationMs: number;
  timeToFirstTokenMs?: number;
  toolCallCount: number;
  toolErrorCount: number;
}

export interface TelemetryReport {
  generatedAt: string;
  roleId?: string;
  window: {
    label: string;
    start: string;
    end: string;
  };
  summary: {
    sessionCount: number;
    turnCount: number;
    toolCallCount: number;
    toolErrorCount: number;
    toolErrorRate?: number;
    assistantErrorTurnCount: number;
    assistantErrorRate?: number;
    silentTurnCount: number;
    silentTurnRate?: number;
    retryCount: number;
    compactionCount: number;
    turnDurationP50Ms?: number;
    turnDurationP95Ms?: number;
    timeToFirstTokenP50Ms?: number;
    timeToFirstTokenP95Ms?: number;
    toolDurationP50Ms?: number;
    toolDurationP95Ms?: number;
  };
  failingTools: TelemetryToolReport[];
  slowestTurns: TelemetryTurnReport[];
  toolBreakdown: TelemetryToolReport[];
  source: {
    eventCount: number;
    sessionFileCount: number;
  };
}
