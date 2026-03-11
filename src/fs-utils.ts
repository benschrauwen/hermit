import { promises as fs } from "node:fs";

export function getErrorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
}

export function isMissingPathError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === "ENOENT" || code === "ENOTDIR";
}

export function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }
    throw error;
  }
}
