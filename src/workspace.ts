import matter from "gray-matter";
import { promises as fs } from "node:fs";
import path from "node:path";
import slugifyImport from "slugify";

import {
  DEAL_SEQUENCE_WIDTH,
  REQUIRED_ROOT_DIRECTORIES,
  REQUIRED_SUPPORTING_DIRECTORIES,
} from "./constants.js";
import {
  agentInboxTemplate,
  agentRecordTemplate,
  activityLogTemplate,
  companyGtmTemplate,
  companyRecordTemplate,
  companyStrategyTemplate,
  competitiveAnalysisTemplate,
  dealRecordTemplate,
  developmentPlanTemplate,
  meddiccTemplate,
  personRecordTemplate,
  playbookTemplate,
  productRecordTemplate,
} from "./templates.js";
import type {
  CompanyBootstrapInput,
  DealBootstrapInput,
  EntityRecord,
  PersonBootstrapInput,
  ProductBootstrapInput,
  WorkspaceInitializationState,
} from "./types.js";

const slugify = slugifyImport as unknown as (
  value: string,
  options?: { lower?: boolean; strict?: boolean; trim?: boolean },
) => string;

const DEAL_BUCKET_DIRECTORY_NAMES = ["active", "closed-won", "closed-lost"] as const;

export interface WorkspacePaths {
  root: string;
  agentsFile: string;
  agentDir: string;
  promptsDir: string;
  companyDir: string;
  peopleDir: string;
  productDir: string;
  dealsDir: string;
  activeDealsDir: string;
  closedWonDealsDir: string;
  closedLostDealsDir: string;
  supportingFilesDir: string;
  sessionsDir: string;
}

export function getWorkspacePaths(root: string): WorkspacePaths {
  const dealsDir = path.join(root, "deals");

  return {
    root,
    agentsFile: path.join(root, "AGENTS.md"),
    agentDir: path.join(root, "agent"),
    promptsDir: path.join(root, "prompts"),
    companyDir: path.join(root, "company"),
    peopleDir: path.join(root, "people"),
    productDir: path.join(root, "product"),
    dealsDir,
    activeDealsDir: path.join(dealsDir, "active"),
    closedWonDealsDir: path.join(dealsDir, "closed-won"),
    closedLostDealsDir: path.join(dealsDir, "closed-lost"),
    supportingFilesDir: path.join(root, "supporting-files"),
    sessionsDir: path.join(root, ".sales-agent", "sessions"),
  };
}

export async function ensureWorkspaceScaffold(root: string): Promise<void> {
  await Promise.all(
    [...REQUIRED_ROOT_DIRECTORIES, ...REQUIRED_SUPPORTING_DIRECTORIES].map((relativePath) =>
      fs.mkdir(path.join(root, relativePath), { recursive: true }),
    ),
  );

  const paths = getWorkspacePaths(root);
  const requiredAgentFiles = [
    { path: path.join(paths.agentDir, "record.md"), content: agentRecordTemplate() },
    { path: path.join(paths.agentDir, "inbox.md"), content: agentInboxTemplate() },
  ] as const satisfies ReadonlyArray<{ path: string; content: string }>;

  await Promise.all(
    requiredAgentFiles.map(async (file) => {
      if (!(await fileExists(file.path))) {
        await fs.writeFile(file.path, file.content, "utf8");
      }
    }),
  );
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function makeSlug(value: string): string {
  return slugify(value, {
    lower: true,
    strict: true,
    trim: true,
  });
}

export function makePersonId(name: string): string {
  return `p-${makeSlug(name)}`;
}

export function makeProductId(name: string): string {
  return `prd-${makeSlug(name)}`;
}

export async function makeDealId(root: string, accountName: string, opportunityName: string): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await getNextDealSequence(root, year);
  const slug = makeSlug(`${accountName} ${opportunityName}`);

  return `d-${year}-${String(sequence).padStart(DEAL_SEQUENCE_WIDTH, "0")}-${slug}`;
}

function isDealBucketDirectoryName(value: string): boolean {
  return DEAL_BUCKET_DIRECTORY_NAMES.includes(value as (typeof DEAL_BUCKET_DIRECTORY_NAMES)[number]);
}

function getDealBucketDirectories(paths: WorkspacePaths): string[] {
  return [paths.activeDealsDir, paths.closedWonDealsDir, paths.closedLostDealsDir];
}

async function listDirectoryNames(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function listDealDirectoryNames(paths: WorkspacePaths): Promise<string[]> {
  const legacyDealNames = (await listDirectoryNames(paths.dealsDir)).filter((name) => !isDealBucketDirectoryName(name));
  const bucketDealNames = await Promise.all(getDealBucketDirectories(paths).map((directory) => listDirectoryNames(directory)));

  return [...legacyDealNames, ...bucketDealNames.flat()];
}

async function getNextDealSequence(root: string, year: number): Promise<number> {
  const dealDirectoryNames = await listDealDirectoryNames(getWorkspacePaths(root));
  const values = dealDirectoryNames
    .map((name) => {
      const match = name.match(/^d-(\d{4})-(\d{4})-/);
      if (!match) {
        return undefined;
      }

      return Number(match[1]) === year ? Number(match[2]) : undefined;
    })
    .filter((value): value is number => value !== undefined);

  return (values.length > 0 ? Math.max(...values) : 0) + 1;
}

export async function writeFileSafely(filePath: string, content: string, force = false): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  if (!force) {
    try {
      await fs.access(filePath);
      throw new Error(`Refusing to overwrite existing file: ${filePath}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Refusing")) {
        throw error;
      }
    }
  }

  await fs.writeFile(filePath, content, "utf8");
}

export async function appendLine(filePath: string, line: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${line}\n`, "utf8");
}

export async function getWorkspaceInitializationState(root: string): Promise<WorkspaceInitializationState> {
  const paths = getWorkspacePaths(root);
  const [people, products, deals, hasCompanyRecord] = await Promise.all([
    scanEntityDirectory(paths.peopleDir),
    scanEntityDirectory(paths.productDir),
    scanDealDirectories(paths),
    fileExists(path.join(paths.companyDir, "record.md")),
  ]);

  const peopleCount = people.length;
  const productCount = products.length;
  const dealCount = deals.length;

  return {
    initialized: hasCompanyRecord && (peopleCount > 0 || productCount > 0 || dealCount > 0),
    hasCompanyRecord,
    peopleCount,
    productCount,
    dealCount,
  };
}

export async function scanEntities(root: string): Promise<EntityRecord[]> {
  const paths = getWorkspacePaths(root);
  const entities: EntityRecord[] = [];

  entities.push(...(await scanEntityDirectory(paths.peopleDir)));
  entities.push(...(await scanEntityDirectory(paths.productDir)));
  entities.push(...(await scanDealDirectories(paths)));

  return entities.sort((left, right) => left.name.localeCompare(right.name));
}

async function scanDealDirectories(paths: WorkspacePaths): Promise<EntityRecord[]> {
  const [legacyDeals, activeDeals, closedWonDeals, closedLostDeals] = await Promise.all([
    scanEntityDirectory(paths.dealsDir, { excludeDirectoryNames: DEAL_BUCKET_DIRECTORY_NAMES }),
    scanEntityDirectory(paths.activeDealsDir),
    scanEntityDirectory(paths.closedWonDealsDir),
    scanEntityDirectory(paths.closedLostDealsDir),
  ]);

  return [...legacyDeals, ...activeDeals, ...closedWonDeals, ...closedLostDeals];
}

async function scanEntityDirectory(
  directory: string,
  options: { excludeDirectoryNames?: readonly string[] } = {},
): Promise<EntityRecord[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const entities = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isDirectory() &&
            !(options.excludeDirectoryNames ?? []).includes(entry.name),
        )
        .map(async (entry) => {
          const recordPath = path.join(directory, entry.name, "record.md");

          try {
            const content = await fs.readFile(recordPath, "utf8");
            const parsed = matter(content);
            const data = parsed.data as Record<string, unknown>;

            const entity: EntityRecord = {
              id: String(data.id ?? entry.name),
              type: String(data.type ?? "unknown"),
              name: String(data.name ?? entry.name),
              path: path.join(directory, entry.name),
            };

            if (data.status) {
              entity.status = String(data.status);
            }
            if (data.owner) {
              entity.owner = String(data.owner);
            }

            return entity;
          } catch {
            return {
              id: entry.name,
              type: "unknown",
              name: entry.name,
              path: path.join(directory, entry.name),
            } satisfies EntityRecord;
          }
        }),
    );

    return entities;
  } catch {
    return [];
  }
}

export async function findEntityById(root: string, entityId: string): Promise<EntityRecord | undefined> {
  const entities = await scanEntities(root);
  return entities.find((entity) => entity.id === entityId);
}

export async function findDeals(root: string): Promise<EntityRecord[]> {
  const entities = await scanEntities(root);
  return entities.filter((entity) => entity.type === "deal");
}

export async function findActiveDeals(root: string): Promise<EntityRecord[]> {
  const paths = getWorkspacePaths(root);
  const deals = await findDeals(root);

  return deals.filter((deal) => {
    const parentDirectory = path.dirname(deal.path);
    return parentDirectory === paths.activeDealsDir || parentDirectory === paths.dealsDir;
  });
}

function scoreTranscriptDealMatch(deal: EntityRecord, transcriptSlug: string): number {
  const dealIdSlug = makeSlug(deal.id);
  const dealNameSlug = makeSlug(deal.name);

  if (transcriptSlug.includes(dealIdSlug)) {
    return 100;
  }

  if (transcriptSlug === dealNameSlug) {
    return 95;
  }

  if (transcriptSlug.includes(dealNameSlug)) {
    return 90;
  }

  const overlapTokens = [...new Set([...dealNameSlug.split("-"), ...dealIdSlug.split("-")])].filter(
    (token) => token.length >= 4 && !/^\d+$/.test(token) && transcriptSlug.includes(token),
  ).length;

  if (overlapTokens >= 2) {
    return 70 + Math.min(overlapTokens, 10);
  }

  if (overlapTokens === 1) {
    return 60;
  }

  return 0;
}

function rankTranscriptDealMatches(
  deals: EntityRecord[],
  transcriptSlug: string,
): Array<{ deal: EntityRecord; score: number }> {
  return deals
    .map((deal) => ({
      deal,
      score: scoreTranscriptDealMatch(deal, transcriptSlug),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.deal.name.localeCompare(right.deal.name));
}

async function getTranscriptDealMatches(
  root: string,
  transcriptPath: string,
): Promise<Array<{ deal: EntityRecord; score: number }>> {
  const transcriptSlug = makeSlug(path.basename(transcriptPath, path.extname(transcriptPath)));
  const activeMatches = rankTranscriptDealMatches(await findActiveDeals(root), transcriptSlug);

  if (activeMatches.length > 0) {
    return activeMatches;
  }

  return rankTranscriptDealMatches(await findDeals(root), transcriptSlug);
}

export async function findTranscriptDealCandidates(root: string, transcriptPath: string): Promise<EntityRecord[]> {
  const matches = await getTranscriptDealMatches(root, transcriptPath);
  return matches.map((candidate) => candidate.deal);
}

export async function resolveTranscriptDeal(
  root: string,
  explicitDealId: string | undefined,
  transcriptPath: string,
): Promise<EntityRecord | undefined> {
  if (explicitDealId) {
    return findEntityById(root, explicitDealId);
  }

  const matches = await getTranscriptDealMatches(root, transcriptPath);
  const [bestMatch, secondMatch] = matches;

  if (bestMatch && bestMatch.score >= 90 && (!secondMatch || bestMatch.score > secondMatch.score)) {
    return bestMatch.deal;
  }

  return undefined;
}

export async function copyTranscriptIntoDeal(root: string, deal: EntityRecord, sourcePath: string): Promise<string> {
  const transcriptSlug = makeSlug(path.basename(sourcePath, path.extname(sourcePath)));
  const destination = path.join(deal.path, "transcripts", `${new Date().toISOString().slice(0, 10)}--${transcriptSlug}.md`);
  const content = await fs.readFile(sourcePath, "utf8");

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, content, "utf8");

  return destination;
}

export async function copyTranscriptToInbox(root: string, sourcePath: string): Promise<string> {
  const destination = path.join(
    getWorkspacePaths(root).supportingFilesDir,
    "unmatched-transcripts",
    `${new Date().toISOString().slice(0, 10)}--${path.basename(sourcePath)}`,
  );
  const content = await fs.readFile(sourcePath, "utf8");

  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, content, "utf8");

  return destination;
}

export function buildEntityPath(root: string, entityType: "person" | "product" | "deal", entityId: string): string {
  const paths = getWorkspacePaths(root);
  const baseDir = entityType === "person"
    ? paths.peopleDir
    : entityType === "product"
      ? paths.productDir
      : paths.activeDealsDir;
  return path.join(baseDir, entityId);
}

interface CreateEntityOptions {
  force?: boolean;
  sourceRefs?: string[];
}

export async function createCompanyRecords(
  root: string,
  input: CompanyBootstrapInput,
  options: CreateEntityOptions = {},
): Promise<{ path: string }> {
  const paths = getWorkspacePaths(root);
  const sourceRefs = options.sourceRefs;
  await writeFileSafely(
    path.join(paths.companyDir, "record.md"),
    companyRecordTemplate({
      ...input,
      ...(sourceRefs ? { sourceRefs } : {}),
    }),
    options.force,
  );
  await writeFileSafely(path.join(paths.companyDir, "strategy.md"), companyStrategyTemplate(), options.force);
  await writeFileSafely(path.join(paths.companyDir, "gtm.md"), companyGtmTemplate(), options.force);

  return {
    path: path.join(paths.companyDir, "record.md"),
  };
}

export async function createPersonRecord(
  root: string,
  input: PersonBootstrapInput,
  options: CreateEntityOptions = {},
): Promise<{ id: string; path: string }> {
  const entityId = makePersonId(input.name);
  const entityPath = buildEntityPath(root, "person", entityId);
  const sourceRefs = options.sourceRefs;

  await fs.mkdir(path.join(entityPath, "notes"), { recursive: true });
  await fs.mkdir(path.join(entityPath, "artifacts"), { recursive: true });
  await writeFileSafely(
    path.join(entityPath, "record.md"),
    personRecordTemplate({
      id: entityId,
      ...input,
      ...(sourceRefs ? { sourceRefs } : {}),
    }),
    options.force,
  );
  await writeFileSafely(path.join(entityPath, "development-plan.md"), developmentPlanTemplate(input.name), options.force);

  return {
    id: entityId,
    path: entityPath,
  };
}

export async function createProductRecord(
  root: string,
  input: ProductBootstrapInput,
  options: CreateEntityOptions = {},
): Promise<{ id: string; path: string }> {
  const entityId = makeProductId(input.name);
  const entityPath = buildEntityPath(root, "product", entityId);
  const sourceRefs = options.sourceRefs;

  await fs.mkdir(path.join(entityPath, "notes"), { recursive: true });
  await fs.mkdir(path.join(entityPath, "artifacts"), { recursive: true });
  await writeFileSafely(
    path.join(entityPath, "record.md"),
    productRecordTemplate({
      id: entityId,
      ...input,
      ...(sourceRefs ? { sourceRefs } : {}),
    }),
    options.force,
  );
  await writeFileSafely(path.join(entityPath, "playbook.md"), playbookTemplate(input.name), options.force);
  await writeFileSafely(path.join(entityPath, "competitive-analysis.md"), competitiveAnalysisTemplate(input.name), options.force);

  return {
    id: entityId,
    path: entityPath,
  };
}

export async function createDealRecord(
  root: string,
  input: DealBootstrapInput,
  options: CreateEntityOptions = {},
): Promise<{ id: string; path: string }> {
  const entityId = await makeDealId(root, input.accountName, input.opportunityName);
  const entityPath = buildEntityPath(root, "deal", entityId);
  const sourceRefs = options.sourceRefs;

  await fs.mkdir(path.join(entityPath, "notes"), { recursive: true });
  await fs.mkdir(path.join(entityPath, "artifacts"), { recursive: true });
  await fs.mkdir(path.join(entityPath, "transcripts"), { recursive: true });
  await writeFileSafely(
    path.join(entityPath, "record.md"),
    dealRecordTemplate({
      id: entityId,
      ...input,
      ...(sourceRefs ? { sourceRefs } : {}),
    }),
    options.force,
  );
  await writeFileSafely(path.join(entityPath, "meddicc.md"), meddiccTemplate(`${input.accountName} - ${input.opportunityName}`), options.force);
  await writeFileSafely(
    path.join(entityPath, "activity-log.md"),
    activityLogTemplate(`${input.accountName} - ${input.opportunityName}`, options.sourceRefs?.[0] ?? "onboarding"),
    options.force,
  );

  return {
    id: entityId,
    path: entityPath,
  };
}
