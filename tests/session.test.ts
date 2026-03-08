import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

import {
  DEFAULT_CHAT_OPENING_PROMPT,
  formatActivityStatus,
  loadImageAttachments,
  ONBOARDING_CHAT_OPENING_PROMPT,
  renderTerminalMarkdown,
  resolveInitialChatPrompt,
} from "../src/session.js";

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

describe("resolveInitialChatPrompt", () => {
  it("uses the explicit prompt when provided", () => {
    expect(
      resolveInitialChatPrompt({
        initialPrompt: "Open with pipeline review.",
        continueRecent: false,
        workspaceState: {
          initialized: true,
          hasCompanyRecord: true,
          peopleCount: 1,
          roleEntityCount: 1,
          roleEntityCounts: { deal: 1 },
        },
      }),
    ).toBe("Open with pipeline review.");
  });

  it("starts onboarding automatically for uninitialized workspaces", () => {
    expect(
      resolveInitialChatPrompt({
        continueRecent: false,
        workspaceState: {
          initialized: false,
          hasCompanyRecord: false,
          peopleCount: 0,
          roleEntityCount: 0,
          roleEntityCounts: {},
        },
      }),
    ).toBe(ONBOARDING_CHAT_OPENING_PROMPT);
  });

  it("does not inject a new opening when continuing a session", () => {
    expect(
      resolveInitialChatPrompt({
        continueRecent: true,
        workspaceState: {
          initialized: true,
          hasCompanyRecord: true,
          peopleCount: 1,
          roleEntityCount: 1,
          roleEntityCounts: { deal: 1 },
        },
      }),
    ).toBeUndefined();
  });

  it("starts normal chat sessions with an assistant-first opening", () => {
    expect(
      resolveInitialChatPrompt({
        continueRecent: false,
        workspaceState: {
          initialized: true,
          hasCompanyRecord: true,
          peopleCount: 1,
          roleEntityCount: 1,
          roleEntityCounts: { deal: 1 },
        },
      }),
    ).toBe(DEFAULT_CHAT_OPENING_PROMPT);
  });
});

describe("formatActivityStatus", () => {
  it("falls back to Thinking when there is no active tool", () => {
    expect(formatActivityStatus(undefined)).toBe("Thinking");
  });

  it("renders bash commands compactly", () => {
    expect(formatActivityStatus("bash", { command: "bun run check" })).toBe("bash bun run check");
  });

  it("renders read paths with line ranges", () => {
    expect(formatActivityStatus("read", { path: "src/session.ts", offset: 10, limit: 5 })).toBe(
      "read src/session.ts:10-14",
    );
  });

  it("renders grep searches with quoted patterns", () => {
    expect(formatActivityStatus("grep", { pattern: "thinking_start", path: "src" })).toBe(
      'grep "thinking_start" in src',
    );
  });

  it("renders custom tools from meaningful input fields", () => {
    expect(formatActivityStatus("web_search", { query: "sales leader forecast hygiene" })).toBe(
      "web_search sales leader forecast hygiene",
    );
  });
});

describe("renderTerminalMarkdown", () => {
  it("renders a limited markdown subset into ANSI-styled terminal output", () => {
    expect(
      renderTerminalMarkdown("# Heading\n- **Bold** and *italic* with `code`\n1. [Docs](https://example.com)\n"),
    ).toBe(
      "\x1b[1m\x1b[4mHeading\x1b[0m\n\x1b[36m•\x1b[0m \x1b[1mBold\x1b[0m and \x1b[3mitalic\x1b[0m with \x1b[36mcode\x1b[0m\n\x1b[36m1.\x1b[0m \x1b[4mDocs\x1b[0m (https://example.com)\n",
    );
  });

  it("renders fenced code blocks without interpreting markdown inside them", () => {
    expect(renderTerminalMarkdown("```ts\nconst value = `**literal**`;\n```\n")).toBe(
      "\x1b[90m--- code: ts ---\x1b[0m\n  const value = `**literal**`;\n\x1b[90m--- end code ---\x1b[0m\n",
    );
  });

  it("strips model-supplied terminal control sequences before rendering", () => {
    expect(renderTerminalMarkdown("Hello \x1b[31mred\x1b[0m **team**")).toBe("Hello red \x1b[1mteam\x1b[0m");
  });
});
