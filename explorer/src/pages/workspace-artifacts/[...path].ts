import { promises as fs } from "node:fs";
import path from "node:path";
import type { APIRoute } from "astro";

import { getWorkspaceRoot } from "../../lib/workspace.js";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error ? String((error as NodeJS.ErrnoException).code) : undefined;
}

function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[extension] || "application/octet-stream";
}

export const GET: APIRoute = async ({ params }) => {
  const requested = params.path || "";
  if (!requested) {
    return new Response("Not found", { status: 404 });
  }

  const workspaceRoot = getWorkspaceRoot();
  const resolved = path.resolve(workspaceRoot, requested);
  const relativeToRoot = path.relative(workspaceRoot, resolved);
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    return new Response("Forbidden", { status: 403 });
  }
  const segments = relativeToRoot.split(path.sep).filter(Boolean);
  if (!segments.includes("artifacts")) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const file = await fs.readFile(resolved);
    return new Response(file, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(resolved),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return new Response("Not found", { status: 404 });
    }
    throw error;
  }
};
