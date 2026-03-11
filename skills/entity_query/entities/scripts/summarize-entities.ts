#!/usr/bin/env -S node --import tsx
import {
  formatCountRows,
  getNumberFlag,
  getStringFlag,
  matchesField,
  parseArgs,
  printJson,
  resolveWorkspaceRoot,
  scanWorkspaceEntities,
  toSortedCounts,
} from "./entity-lib.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const workspaceRoot = resolveWorkspaceRoot(args);
  const top = getNumberFlag(args, "top", 10);

  const records = (await scanWorkspaceEntities(workspaceRoot))
    .filter((record) => matchesField(record.type, getStringFlag(args, "type")))
    .filter((record) => matchesField(record.status, getStringFlag(args, "status")))
    .filter((record) => matchesField(record.owner, getStringFlag(args, "owner")))
    .filter((record) => matchesField(record.containerDirectory, getStringFlag(args, "directory")));

  const summary = {
    workspaceRoot,
    totalEntities: records.length,
    byType: toSortedCounts(records.map((record) => record.type)),
    byStatus: toSortedCounts(records.map((record) => record.status ?? "unknown")),
    byOwner: toSortedCounts(records.map((record) => record.owner ?? "unassigned")),
    byDirectory: toSortedCounts(records.map((record) => record.containerDirectory)),
  };

  if (getStringFlag(args, "format", "text") === "json") {
    printJson(summary);
    return;
  }

  console.log(`Workspace: ${workspaceRoot}`);
  console.log(`Total entities: ${summary.totalEntities}`);
  console.log("");
  for (const line of formatCountRows("By type", summary.byType, top)) {
    console.log(line);
  }
  console.log("");
  for (const line of formatCountRows("By status", summary.byStatus, top)) {
    console.log(line);
  }
  console.log("");
  for (const line of formatCountRows("By owner", summary.byOwner, top)) {
    console.log(line);
  }
  console.log("");
  for (const line of formatCountRows("By directory", summary.byDirectory, top)) {
    console.log(line);
  }
}

void main();
