import { promises as fs } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { RoleEntityDefinition } from "./workspace.js";

export interface EntityFileContent {
  relativePath: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

function getErrorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
}

function isMissingPathError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readMarkdownFile(filePath: string, relativePath: string, required = false): Promise<EntityFileContent> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = matter(raw);
    return {
      relativePath,
      frontmatter: (parsed.data as Record<string, unknown>) ?? {},
      content: parsed.content.trim(),
    };
  } catch (error) {
    if (isMissingPathError(error)) {
      if (required) {
        throw new Error(`Required markdown file is missing: ${filePath}`);
      }
      return {
        relativePath,
        frontmatter: {},
        content: "",
      };
    }
    throw new Error(`Failed to read markdown file ${filePath}: ${formatErrorMessage(error)}`);
  }
}

export async function readEntityFrontmatter(entityPath: string): Promise<Record<string, unknown>> {
  const filePath = path.join(entityPath, "record.md");
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = matter(raw);
    return (parsed.data as Record<string, unknown>) ?? {};
  } catch (error) {
    if (isMissingPathError(error)) {
      return {};
    }
    throw new Error(`Failed to read entity frontmatter ${filePath}: ${formatErrorMessage(error)}`);
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
  const required = Boolean(relativePaths);
  const files = relativePaths
    ? [...relativePaths]
    : await (async () => {
        try {
          return (await fs.readdir(directoryPath, { withFileTypes: true }))
            .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
            .map((entry) => entry.name)
            .sort((left, right) => {
              if (left === "record.md") return -1;
              if (right === "record.md") return 1;
              return left.localeCompare(right);
            });
        } catch (error) {
          if (isMissingPathError(error)) {
            return [];
          }
          throw new Error(`Failed to list markdown files in ${directoryPath}: ${formatErrorMessage(error)}`);
        }
      })();

  return Promise.all(
    files.map((relativePath) => readMarkdownFile(path.join(directoryPath, relativePath), relativePath, required)),
  );
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
