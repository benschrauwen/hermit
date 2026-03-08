import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import process from "node:process";

import { PromptLibrary } from "./prompt-library.js";
import { createSalesLeaderSession, runOneShotPrompt } from "./session.js";
import type { EntityRecord } from "./types.js";
import { appendLine, copyTranscriptIntoDeal, copyTranscriptToInbox, findDeals, resolveTranscriptDeal } from "./workspace.js";

async function chooseDeal(deals: EntityRecord[]): Promise<EntityRecord | undefined> {
  if (deals.length === 0) {
    return undefined;
  }

  console.log("Multiple possible deals found. Choose one:");
  deals.forEach((deal, index) => {
    console.log(`${index + 1}. ${deal.id} - ${deal.name}`);
  });
  console.log("0. Save transcript as unmatched");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const raw = await rl.question("Selection: ");
    const index = Number(raw);
    if (index <= 0 || index > deals.length || !Number.isInteger(index)) {
      return undefined;
    }

    return deals[index - 1];
  } finally {
    rl.close();
  }
}

export async function runTranscriptIngest(options: {
  root: string;
  transcriptPath: string;
  dealId?: string;
  imagePaths: string[];
}): Promise<void> {
  await fs.access(options.transcriptPath);

  let deal = await resolveTranscriptDeal(options.root, options.dealId, options.transcriptPath);
  if (!deal && !options.dealId) {
    const deals = await findDeals(options.root);
    deal = await chooseDeal(deals);
  }

  if (!deal) {
    const inboxPath = await copyTranscriptToInbox(options.root, options.transcriptPath);
    console.log(`No deal selected. Transcript stored at ${inboxPath}`);
    return;
  }

  const transcriptCopyPath = await copyTranscriptIntoDeal(options.root, deal, options.transcriptPath);
  await appendLine(
    path.join(deal.path, "activity-log.md"),
    `- ${new Date().toISOString()}: Transcript ingested from ${transcriptCopyPath}.`,
  );

  const promptLibrary = await PromptLibrary.load(options.root);
  const commandPrompt = promptLibrary.renderNamedPrompt("40-command-transcript-run.md", {
    workspaceRoot: options.root,
    entityId: deal.id,
    entityPath: deal.path,
    transcriptPath: transcriptCopyPath,
  });

  const { session } = await createSalesLeaderSession({
    root: options.root,
    kind: "transcript-ingest",
    persist: true,
    promptContext: {
      workspaceRoot: options.root,
      entityId: deal.id,
      entityPath: deal.path,
      transcriptPath: transcriptCopyPath,
    },
  });

  await runOneShotPrompt(session, commandPrompt, options.imagePaths);
}
