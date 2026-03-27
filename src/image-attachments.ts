import type { ImageContent } from "@mariozechner/pi-ai";
import { promises as fs } from "node:fs";
import path from "node:path";

function resolveImageMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      throw new Error(`Unsupported image type: ${filePath}`);
  }
}

export async function loadImageAttachments(imagePaths: string[]): Promise<ImageContent[]> {
  return Promise.all(
    imagePaths.map(async (imagePath) => {
      const content = await fs.readFile(imagePath);
      return {
        type: "image",
        data: content.toString("base64"),
        mimeType: resolveImageMimeType(imagePath),
      } satisfies ImageContent;
    }),
  );
}
