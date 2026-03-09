import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { RoleEntityDefinition } from "./workspace.js";

export interface EntityFileContent {
  relativePath: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

async function readMarkdownFile(filePath: string, relativePath: string): Promise<EntityFileContent> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = matter(raw);
    return {
      relativePath,
      frontmatter: (parsed.data as Record<string, unknown>) ?? {},
      content: parsed.content.trim(),
    };
  } catch {
    return {
      relativePath,
      frontmatter: {},
      content: "",
    };
  }
}

export async function readEntityFrontmatter(entityPath: string): Promise<Record<string, unknown>> {
  const filePath = path.join(entityPath, "record.md");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = matter(raw);
    return (parsed.data as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

export function formatEntityFieldValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(", ");
  }
  if (value === null || value === undefined || value === "") {
    return "";
  }
  return String(value);
}

export async function readMarkdownFiles(directoryPath: string, relativePaths?: string[]): Promise<EntityFileContent[]> {
  const files = relativePaths
    ? [...relativePaths]
    : (await fs.readdir(directoryPath, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name)
        .sort((left, right) => {
          if (left === "record.md") return -1;
          if (right === "record.md") return 1;
          return left.localeCompare(right);
        });

  return Promise.all(files.map((relativePath) => readMarkdownFile(path.join(directoryPath, relativePath), relativePath)));
}

export async function readEntityRecordContent(
  entityPath: string,
  entityDef: RoleEntityDefinition,
): Promise<EntityFileContent[]> {
  const files = entityDef.files ?? [{ path: "record.md", template: "" }];
  return readMarkdownFiles(
    entityPath,
    files.map((file) => file.path),
  );
}
