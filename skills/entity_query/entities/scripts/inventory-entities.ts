#!/usr/bin/env -S node --import tsx
import {
  getNumberFlag,
  getStringFlag,
  matchesField,
  parseArgs,
  printJson,
  resolveWorkspaceRoot,
  scanWorkspaceEntities,
  toSortedCounts,
} from "./entity-lib.ts";

interface InventoryGroup {
  key: string;
  count: number;
  commonFiles: Array<{ key: string; count: number }>;
  commonDirectories: Array<{ key: string; count: number }>;
}

function buildInventory(
  records: Awaited<ReturnType<typeof scanWorkspaceEntities>>,
  groupBy: "type" | "directory" | "top-level",
  top: number,
): InventoryGroup[] {
  const grouped = new Map<string, typeof records>();

  for (const record of records) {
    const key =
      groupBy === "directory"
        ? record.containerDirectory
        : groupBy === "top-level"
          ? record.topLevelDirectory
          : record.type;
    const existing = grouped.get(key) ?? [];
    existing.push(record);
    grouped.set(key, existing);
  }

  return [...grouped.entries()]
    .map(([key, groupRecords]) => ({
      key,
      count: groupRecords.length,
      commonFiles: toSortedCounts(groupRecords.flatMap((record) => record.files)).slice(0, top),
      commonDirectories: toSortedCounts(groupRecords.flatMap((record) => record.directories)).slice(0, top),
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const workspaceRoot = resolveWorkspaceRoot(args);
  const top = getNumberFlag(args, "top", 8);
  const rawGroupBy = getStringFlag(args, "group-by", "type") ?? "type";
  const groupBy = rawGroupBy === "directory" || rawGroupBy === "top-level" ? rawGroupBy : "type";

  const records = (await scanWorkspaceEntities(workspaceRoot))
    .filter((record) => matchesField(record.type, getStringFlag(args, "type")))
    .filter((record) => matchesField(record.containerDirectory, getStringFlag(args, "directory")));

  const inventory = buildInventory(records, groupBy, top);
  if (getStringFlag(args, "format", "text") === "json") {
    printJson({ workspaceRoot, groupBy, inventory });
    return;
  }

  console.log(`Workspace: ${workspaceRoot}`);
  console.log(`Grouped by: ${groupBy}`);
  console.log(`Groups: ${inventory.length}`);

  for (const group of inventory) {
    console.log("");
    console.log(`${group.key} (${group.count})`);
    console.log("files:");
    for (const item of group.commonFiles) {
      console.log(`- ${item.key}: ${item.count}`);
    }
    if (group.commonFiles.length === 0) {
      console.log("- none");
    }

    console.log("directories:");
    for (const item of group.commonDirectories) {
      console.log(`- ${item.key}: ${item.count}`);
    }
    if (group.commonDirectories.length === 0) {
      console.log("- none");
    }
  }
}

void main();
