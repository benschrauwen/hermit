import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import process from "node:process";

import {
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
import type { BootstrapAnswers, DealBootstrapInput, PersonBootstrapInput, ProductBootstrapInput } from "./types.js";
import {
  buildEntityPath,
  ensureWorkspaceScaffold,
  makeDealId,
  makePersonId,
  makeProductId,
  writeFileSafely,
} from "./workspace.js";

async function ask(rl: readline.Interface, question: string, fallback = ""): Promise<string> {
  const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ""}: `)).trim();
  return answer || fallback;
}

async function askCount(rl: readline.Interface, question: string): Promise<number> {
  const raw = await ask(rl, question, "0");
  const count = Number(raw);

  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Invalid count: ${raw}`);
  }

  return count;
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function collectPeople(rl: readline.Interface): Promise<PersonBootstrapInput[]> {
  const count = await askCount(rl, "How many people should be created");
  const people: PersonBootstrapInput[] = [];

  for (let index = 0; index < count; index += 1) {
    people.push({
      name: await ask(rl, `Person ${index + 1} name`),
      role: await ask(rl, `Person ${index + 1} role`),
      manager: await ask(rl, `Person ${index + 1} manager`, "sales leadership"),
      strengths: await ask(rl, `Person ${index + 1} strengths`, "Add strengths."),
      coachingFocus: await ask(rl, `Person ${index + 1} coaching focus`, "Add coaching focus."),
    });
  }

  return people;
}

async function collectProducts(rl: readline.Interface): Promise<ProductBootstrapInput[]> {
  const count = await askCount(rl, "How many products should be created");
  const products: ProductBootstrapInput[] = [];

  for (let index = 0; index < count; index += 1) {
    products.push({
      name: await ask(rl, `Product ${index + 1} name`),
      summary: await ask(rl, `Product ${index + 1} summary`),
      valueHypothesis: await ask(rl, `Product ${index + 1} value hypothesis`),
      competitors: parseList(await ask(rl, `Product ${index + 1} competitors`, "")),
    });
  }

  return products;
}

async function collectDeals(rl: readline.Interface): Promise<DealBootstrapInput[]> {
  const count = await askCount(rl, "How many open deals should be created");
  const deals: DealBootstrapInput[] = [];

  for (let index = 0; index < count; index += 1) {
    deals.push({
      accountName: await ask(rl, `Deal ${index + 1} account name`),
      opportunityName: await ask(rl, `Deal ${index + 1} opportunity name`),
      owner: await ask(rl, `Deal ${index + 1} owner`),
      stage: await ask(rl, `Deal ${index + 1} stage`, "qualification"),
      amount: await ask(rl, `Deal ${index + 1} amount`, "Unknown"),
      closeDate: await ask(rl, `Deal ${index + 1} close date`, "Unknown"),
      nextStep: await ask(rl, `Deal ${index + 1} next step`, "Add next step."),
    });
  }

  return deals;
}

async function collectBootstrapAnswers(): Promise<BootstrapAnswers> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return {
      companyName: await ask(rl, "Company name"),
      companySummary: await ask(rl, "Company summary"),
      salesTeamName: await ask(rl, "Sales team name", "Sales"),
      salesMethodology: await ask(rl, "Primary sales methodology", "MEDDICC"),
      idealCustomerProfile: await ask(rl, "Ideal customer profile"),
      reviewCadence: await ask(rl, "Forecast or review cadence", "Weekly"),
      topCompetitors: parseList(await ask(rl, "Top competitors (comma-separated)", "")),
      people: await collectPeople(rl),
      products: await collectProducts(rl),
      deals: await collectDeals(rl),
    };
  } finally {
    rl.close();
  }
}

async function createPerson(root: string, input: PersonBootstrapInput, force: boolean): Promise<void> {
  const entityId = makePersonId(input.name);
  const entityPath = buildEntityPath(root, "person", entityId);

  await fs.mkdir(path.join(entityPath, "notes"), { recursive: true });
  await fs.mkdir(path.join(entityPath, "artifacts"), { recursive: true });
  await writeFileSafely(path.join(entityPath, "record.md"), personRecordTemplate({ id: entityId, ...input }), force);
  await writeFileSafely(path.join(entityPath, "development-plan.md"), developmentPlanTemplate(input.name), force);
}

async function createProduct(root: string, input: ProductBootstrapInput, force: boolean): Promise<void> {
  const entityId = makeProductId(input.name);
  const entityPath = buildEntityPath(root, "product", entityId);

  await fs.mkdir(path.join(entityPath, "notes"), { recursive: true });
  await fs.mkdir(path.join(entityPath, "artifacts"), { recursive: true });
  await writeFileSafely(path.join(entityPath, "record.md"), productRecordTemplate({ id: entityId, ...input }), force);
  await writeFileSafely(path.join(entityPath, "playbook.md"), playbookTemplate(input.name), force);
  await writeFileSafely(path.join(entityPath, "competitive-analysis.md"), competitiveAnalysisTemplate(input.name), force);
}

async function createDeal(root: string, input: DealBootstrapInput, force: boolean): Promise<void> {
  const entityId = await makeDealId(root, input.accountName, input.opportunityName);
  const entityPath = buildEntityPath(root, "deal", entityId);

  await fs.mkdir(path.join(entityPath, "notes"), { recursive: true });
  await fs.mkdir(path.join(entityPath, "artifacts"), { recursive: true });
  await fs.mkdir(path.join(entityPath, "transcripts"), { recursive: true });
  await writeFileSafely(path.join(entityPath, "record.md"), dealRecordTemplate({ id: entityId, ...input }), force);
  await writeFileSafely(path.join(entityPath, "meddicc.md"), meddiccTemplate(`${input.accountName} - ${input.opportunityName}`), force);
  await writeFileSafely(
    path.join(entityPath, "activity-log.md"),
    activityLogTemplate(`${input.accountName} - ${input.opportunityName}`),
    force,
  );
}

export async function runBootstrap(root: string, force = false): Promise<void> {
  await ensureWorkspaceScaffold(root);
  const answers = await collectBootstrapAnswers();

  await writeFileSafely(
    path.join(root, "company", "record.md"),
    companyRecordTemplate({
      companyName: answers.companyName,
      companySummary: answers.companySummary,
      salesTeamName: answers.salesTeamName,
      salesMethodology: answers.salesMethodology,
      idealCustomerProfile: answers.idealCustomerProfile,
      reviewCadence: answers.reviewCadence,
      topCompetitors: answers.topCompetitors,
    }),
    force,
  );
  await writeFileSafely(path.join(root, "company", "strategy.md"), companyStrategyTemplate(), force);
  await writeFileSafely(path.join(root, "company", "gtm.md"), companyGtmTemplate(), force);

  for (const person of answers.people) {
    await createPerson(root, person, force);
  }

  for (const product of answers.products) {
    await createProduct(root, product, force);
  }

  for (const deal of answers.deals) {
    await createDeal(root, deal, force);
  }
}
