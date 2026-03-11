#!/usr/bin/env -S node --import tsx
import matter from "gray-matter";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface ParsedArgs {
  _: string[];
  flags: Record<string, string | boolean>;
}

export interface EntityScanRecord {
  id: string;
  type: string;
  name: string;
  status?: string;
  owner?: string;
  updatedAt?: string;
  workspaceRoot: string;
  entityDir: string;
  recordPath: string;
  relativePath: string;
  containerDirectory: string;
  topLevelDirectory: string;
  files: string[];
  directories: string[];
  body: string;
  rawContent: string;
  frontmatter: Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeSearchValue(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase() || undefined;
}

async function collectEntityRecordPaths(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  if (entries.some((entry) => entry.isFile() && entry.name === "record.md")) {
    return [path.join(directory, "record.md")];
  }

  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
      .map((entry) => collectEntityRecordPaths(path.join(directory, entry.name))),
  );
  return nested.flat();
}

function firstPathSegment(relativePath: string): string {
  const [segment = relativePath] = relativePath.split(path.sep);
  return segment;
}

export async function scanWorkspaceEntities(workspaceRoot: string): Promise<EntityScanRecord[]> {
  const entitiesDir = path.join(workspaceRoot, "entities");
  const recordPaths = await collectEntityRecordPaths(entitiesDir);
  const records = await Promise.all(
    recordPaths.map(async (recordPath) => {
      const rawContent = await fs.readFile(recordPath, "utf8");
      const parsed = matter(rawContent);
      const frontmatter = parsed.data as Record<string, unknown>;
      const entityDir = path.dirname(recordPath);
      const relativePath = path.relative(entitiesDir, entityDir) || ".";
      const parentDirectory = path.dirname(relativePath);
      const filesAndDirs = await fs.readdir(entityDir, { withFileTypes: true });

      return {
        id: asString(frontmatter.id) ?? path.basename(entityDir),
        type: asString(frontmatter.type) ?? "unknown",
        name: asString(frontmatter.name) ?? path.basename(entityDir),
        ...(asString(frontmatter.status) ? { status: asString(frontmatter.status) } : {}),
        ...(asString(frontmatter.owner) ? { owner: asString(frontmatter.owner) } : {}),
        ...(asString(frontmatter.updated_at) ? { updatedAt: asString(frontmatter.updated_at) } : {}),
        workspaceRoot,
        entityDir,
        recordPath,
        relativePath,
        containerDirectory: parentDirectory === "." ? relativePath : parentDirectory,
        topLevelDirectory: firstPathSegment(relativePath),
        files: filesAndDirs
          .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
          .map((entry) => entry.name)
          .sort(),
        directories: filesAndDirs
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
          .map((entry) => entry.name)
          .sort(),
        body: parsed.content,
        rawContent,
        frontmatter,
      } satisfies EntityScanRecord;
    }),
  );

  return records.sort((left, right) => left.name.localeCompare(right.name) || left.relativePath.localeCompare(right.relativePath));
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const withoutPrefix = arg.slice(2);
    const [rawKey, inlineValue] = withoutPrefix.split("=", 2);
    if (!rawKey) {
      continue;
    }

    if (inlineValue !== undefined) {
      flags[rawKey] = inlineValue;
      continue;
    }

    const nextValue = argv[index + 1];
    if (nextValue && !nextValue.startsWith("--")) {
      flags[rawKey] = nextValue;
      index += 1;
      continue;
    }

    flags[rawKey] = true;
  }

  return { _: positional, flags };
}

export function getStringFlag(args: ParsedArgs, name: string, fallback?: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : fallback;
}

export function getBooleanFlag(args: ParsedArgs, name: string): boolean {
  return args.flags[name] === true;
}

export function getNumberFlag(args: ParsedArgs, name: string, fallback: number): number {
  const raw = getStringFlag(args, name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveWorkspaceRoot(args: ParsedArgs): string {
  const configured = getStringFlag(args, "root", process.cwd()) ?? process.cwd();
  return path.resolve(configured);
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function formatCountRows(title: string, counts: Array<{ key: string; count: number }>, limit: number): string[] {
  const lines = [title];
  for (const item of counts.slice(0, limit)) {
    lines.push(`- ${item.key}: ${item.count}`);
  }
  if (counts.length === 0) {
    lines.push("- none");
  }
  return lines;
}

export function toSortedCounts(values: string[]): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

export function matchesSearch(record: EntityScanRecord, query: string | undefined): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return true;
  }

  const haystacks = [
    record.id,
    record.type,
    record.name,
    record.status ?? "",
    record.owner ?? "",
    record.relativePath,
    record.rawContent,
  ].map((value) => value.toLowerCase());

  return haystacks.some((value) => value.includes(normalizedQuery));
}

export function matchesField(recordValue: string | undefined, query: string | undefined): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return true;
  }

  return (recordValue ?? "").toLowerCase().includes(normalizedQuery);
}

export function sortRecords(
  records: EntityScanRecord[],
  sortKey: string,
  descending: boolean,
): EntityScanRecord[] {
  const sorted = [...records].sort((left, right) => {
    const leftValue = getSortValue(left, sortKey);
    const rightValue = getSortValue(right, sortKey);
    return leftValue.localeCompare(rightValue) || left.relativePath.localeCompare(right.relativePath);
  });
  return descending ? sorted.reverse() : sorted;
}

function getSortValue(record: EntityScanRecord, sortKey: string): string {
  switch (sortKey) {
    case "id":
      return record.id;
    case "type":
      return record.type;
    case "status":
      return record.status ?? "";
    case "owner":
      return record.owner ?? "";
    case "updated":
      return record.updatedAt ?? "";
    case "path":
      return record.relativePath;
    case "directory":
      return record.containerDirectory;
    case "name":
    default:
      return record.name;
  }
}

export function printTable(records: EntityScanRecord[]): void {
  if (records.length === 0) {
    console.log("No matching entities.");
    return;
  }

  console.log("id\ttype\tstatus\towner\tupdated_at\tpath\tname");
  for (const record of records) {
    console.log(
      [
        record.id,
        record.type,
        record.status ?? "",
        record.owner ?? "",
        record.updatedAt ?? "",
        record.relativePath,
        record.name,
      ].join("\t"),
    );
  }
}
