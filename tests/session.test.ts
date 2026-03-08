import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

import { loadImageAttachments } from "../src/session.js";

describe("loadImageAttachments", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "session-img-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no paths", async () => {
    const result = await loadImageAttachments([]);
    expect(result).toEqual([]);
  });

  it("loads PNG file and returns image content with correct mimeType", async () => {
    const pngPath = path.join(tmpDir, "test.png");
    writeFileSync(pngPath, "fake-png-bytes");
    const result = await loadImageAttachments([pngPath]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: "image",
      data: Buffer.from("fake-png-bytes").toString("base64"),
      mimeType: "image/png",
    });
  });

  it("loads JPEG file with correct mimeType", async () => {
    const jpgPath = path.join(tmpDir, "photo.jpg");
    writeFileSync(jpgPath, "jpeg");
    const result = await loadImageAttachments([jpgPath]);
    expect(result[0].mimeType).toBe("image/jpeg");
  });

  it("throws for unsupported image extension", async () => {
    const badPath = path.join(tmpDir, "file.bmp");
    writeFileSync(badPath, "x");
    await expect(loadImageAttachments([badPath])).rejects.toThrow(
      /Unsupported image type/,
    );
  });
});
