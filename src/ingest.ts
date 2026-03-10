import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import process from "node:process";

import { PromptLibrary } from "./prompt-library.js";
import { loadRole } from "./roles.js";
import { createRoleSession, runOneShotPrompt } from "./session.js";
import type { EntityRecord } from "./types.js";
import {
  appendLine,
  copyTranscriptIntoRoleEntity,
  copyTranscriptToRoleInbox,
  findCreatableRoleEntities,
  findTranscriptEntityCandidates,
  resolveTranscriptEntity,
} from "./workspace.js";

async function chooseEntity(entityType: string, entities: EntityRecord[]): Promise<EntityRecord | undefined> {
  if (entities.length === 0) {
    return undefined;
  }

  console.log(`Multiple possible ${entityType} records found. Choose one:`);
  entities.forEach((entity, index) => {
    console.log(`${index + 1}. ${entity.id} - ${entity.name}`);
  });
  console.log("0. Save transcript as unmatched");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const raw = await rl.question("Selection: ");
    const index = Number(raw);
    if (index <= 0 || index > entities.length || !Number.isInteger(index)) {
      return undefined;
    }

    return entities[index - 1];
  } finally {
    rl.close();
  }
}

export async function runTranscriptIngest(options: {
  root: string;
  roleId: string;
  transcriptPath: string;
  entityId?: string;
  imagePaths: string[];
}): Promise<void> {
  await fs.access(options.transcriptPath);
  const role = await loadRole(options.root, options.roleId);
  if (!role.transcriptIngest) {
    throw new Error(`Role ${role.id} does not support transcript ingest.`);
  }

  let entity = await resolveTranscriptEntity(
    options.root,
    role,
    role.transcriptIngest,
    options.entityId,
    options.transcriptPath,
  );
  if (!entity && !options.entityId) {
    const candidateEntities = await findTranscriptEntityCandidates(
      options.root,
      role,
      role.transcriptIngest,
      options.transcriptPath,
    );
    entity = await chooseEntity(
      role.transcriptIngest.entityType,
      candidateEntities.length > 0
        ? candidateEntities
        : await findCreatableRoleEntities(options.root, role, role.transcriptIngest.entityType),
    );
  }

  if (!entity) {
    const inboxPath = await copyTranscriptToRoleInbox(role, role.transcriptIngest, options.transcriptPath);
    console.log(`No ${role.transcriptIngest.entityType} selected. Transcript stored at ${inboxPath}`);
    return;
  }

  const transcriptCopyPath = await copyTranscriptIntoRoleEntity(role.transcriptIngest, entity, options.transcriptPath);
  await appendLine(
    path.join(entity.path, role.transcriptIngest.activityLogFile),
    `- ${new Date().toISOString()}: Transcript ingested from ${transcriptCopyPath}.`,
  );

  const promptLibrary = await PromptLibrary.load(role);
  const promptContext = {
    workspaceRoot: options.root,
    roleId: role.id,
    roleRoot: path.relative(options.root, role.roleDir) || ".",
    entityId: entity.id,
    entityPath: entity.path,
    transcriptPath: transcriptCopyPath,
  };
  const commandPrompt = await promptLibrary.renderRolePrompt(role.transcriptIngest.commandPrompt, promptContext);

  const { session, telemetry } = await createRoleSession({
    root: options.root,
    role,
    persist: true,
    telemetryCommandName: "ingest:transcript",
    promptContext,
    additionalRolePrompts: role.transcriptIngest.systemPrompts,
  });

  await runOneShotPrompt(session, commandPrompt, options.imagePaths, telemetry, role.id);
}
