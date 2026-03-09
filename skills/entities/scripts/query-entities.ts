#!/usr/bin/env bun
import {
  getBooleanFlag,
  getNumberFlag,
  getStringFlag,
  matchesField,
  matchesSearch,
  parseArgs,
  printJson,
  printTable,
  resolveWorkspaceRoot,
  scanWorkspaceEntities,
  sortRecords,
} from "./entity-lib.ts";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const workspaceRoot = resolveWorkspaceRoot(args);
  const limit = getNumberFlag(args, "limit", 50);
  const sort = getStringFlag(args, "sort", "name") ?? "name";
  const format = getStringFlag(args, "format", "table") ?? "table";
  const descending = getBooleanFlag(args, "desc");

  const records = (await scanWorkspaceEntities(workspaceRoot))
    .filter((record) => matchesField(record.type, getStringFlag(args, "type")))
    .filter((record) => matchesField(record.status, getStringFlag(args, "status")))
    .filter((record) => matchesField(record.owner, getStringFlag(args, "owner")))
    .filter((record) => matchesField(record.id, getStringFlag(args, "id")))
    .filter((record) => matchesField(record.name, getStringFlag(args, "name")))
    .filter((record) => matchesField(record.containerDirectory, getStringFlag(args, "directory")))
    .filter((record) => matchesSearch(record, getStringFlag(args, "text")));

  const sorted = sortRecords(records, sort, descending);
  const limited = sorted.slice(0, Math.max(0, limit));

  if (format === "json") {
    printJson(
      limited.map((record) => ({
        id: record.id,
        type: record.type,
        name: record.name,
        status: record.status,
        owner: record.owner,
        updatedAt: record.updatedAt,
        relativePath: record.relativePath,
        files: record.files,
        directories: record.directories,
      })),
    );
    return;
  }

  if (format === "paths") {
    for (const record of limited) {
      console.log(record.relativePath);
    }
    return;
  }

  console.log(`Matched ${records.length} entities. Showing ${limited.length}.`);
  printTable(limited);
}

void main();
