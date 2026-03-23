import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

import {
  DEFAULT_CHAT_OPENING_PROMPT,
  DEFAULT_HEARTBEAT_PROMPT,
  formatActivityStatus,
  formatUserPromptEcho,
  HERMIT_STRATEGIC_REVIEW_PROMPT,
  loadImageAttachments,
  ONBOARDING_CHAT_OPENING_PROMPT,
  renderTerminalMarkdown,
  resolveHermitSessionDirectory,
  resolveRoleSkillPaths,
  resolvePersistedSessionDirectory,
  resolveSharedSkillPaths,
  resolveInitialChatPrompt,
} from "../src/session.js";
import type { RoleDefinition } from "../src/types.js";

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
          sharedEntityCount: 1,
          roleEntityCount: 1,
          roleEntityCounts: { item: 1 },
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
          sharedEntityCount: 0,
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
          sharedEntityCount: 1,
          roleEntityCount: 1,
          roleEntityCounts: { item: 1 },
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
          sharedEntityCount: 1,
          roleEntityCount: 1,
          roleEntityCounts: { item: 1 },
        },
      }),
    ).toBe(DEFAULT_CHAT_OPENING_PROMPT);
  });

  it("keeps the default opening focused on the user's agenda", () => {
    expect(DEFAULT_CHAT_OPENING_PROMPT).toContain("ask what they want to work on");
    expect(DEFAULT_CHAT_OPENING_PROMPT).toContain("Do not suggest exploratory inspection");
    expect(DEFAULT_CHAT_OPENING_PROMPT).toContain("focused 1:1");
    expect(DEFAULT_CHAT_OPENING_PROMPT).toContain("capturing the follow-up work for heartbeat");
  });
});

describe("heartbeat session helpers", () => {
  const role: RoleDefinition = {
    id: "role-a",
    name: "Role A",
    description: "Primary role",
    roleDir: "/tmp/workspace/agents/role-a",
    root: "/tmp/workspace",
    entitiesDir: "/tmp/workspace/entities",
    agentsFile: "/tmp/workspace/agents/role-a/AGENTS.md",
    manifestFile: "/tmp/workspace/agents/role-a/role.md",
    sharedPromptsDir: "/tmp/workspace/prompts",
    rolePromptsDir: "/tmp/workspace/agents/role-a/prompts",
    sharedSkillsDir: "/tmp/workspace/skills",
    roleSkillsDir: "/tmp/workspace/agents/role-a/skills",
    entityDefsDir: "/tmp/workspace/entity-defs",
    agentDir: "/tmp/workspace/agents/role-a/agent",
    sessionsDir: "/tmp/workspace/agents/role-a/.role-agent/sessions",
    roleDirectories: [],
    agentFiles: ["agent/record.md", "agent/inbox.md"],
    entities: [],
  };

  it("keeps heartbeat history separate from interactive session history", () => {
    expect(resolvePersistedSessionDirectory(role)).toBe("/tmp/workspace/agents/role-a/.role-agent/sessions");
    expect(resolvePersistedSessionDirectory(role, "heartbeat")).toBe(
      "/tmp/workspace/agents/role-a/.role-agent/heartbeat-sessions",
    );
  });

  it("adds shared and role-local skill directories to the session loader", () => {
    expect(resolveRoleSkillPaths(role)).toEqual([
      "/tmp/workspace/skills",
      "/tmp/workspace/agents/role-a/skills",
    ]);
  });

  it("stores Hermit chat history outside role-local directories", () => {
    expect(resolveHermitSessionDirectory("/tmp/workspace")).toBe("/tmp/workspace/.hermit/sessions/hermit");
    expect(resolveHermitSessionDirectory("/tmp/workspace", "heartbeat")).toBe(
      "/tmp/workspace/.hermit/sessions/hermit-heartbeat",
    );
  });

  it("loads only shared skills during Hermit chat", () => {
    expect(resolveSharedSkillPaths("/tmp/workspace")).toEqual(["/tmp/workspace/skills"]);
  });

  it("uses a backlog-focused default prompt for heartbeat turns", () => {
    expect(DEFAULT_HEARTBEAT_PROMPT).toContain("GTD backlog");
    expect(DEFAULT_HEARTBEAT_PROMPT).toContain("shared `inbox/` directory");
    expect(DEFAULT_HEARTBEAT_PROMPT).toContain("Do not infer or resurrect tasks");
    expect(DEFAULT_HEARTBEAT_PROMPT).toContain("If no clearly worthwhile step exists");
  });

  it("uses a strategic-review prompt for Hermit framework upkeep", () => {
    expect(HERMIT_STRATEGIC_REVIEW_PROMPT).toContain(".hermit/agent/record.md");
    expect(HERMIT_STRATEGIC_REVIEW_PROMPT).toContain("prompts/35-strategic-reflection.md");
    expect(HERMIT_STRATEGIC_REVIEW_PROMPT).toContain("prompts/90-self-improvement.md");
  });
});

describe("formatUserPromptEcho", () => {
  it("wraps the user prompt with spacing, the active role, and a distinct color", () => {
    expect(formatUserPromptEcho("Inspect the top 3 deals.", "sales")).toBe(
      "\n\x1b[1m\x1b[95m- sales >>\x1b[0m \x1b[95mInspect the top 3 deals.\x1b[0m\n\n",
    );
  });

  it("formats multiline prompts as a block under the active role label", () => {
    expect(formatUserPromptEcho("Line one\nLine two", "sales")).toBe(
      "\n\x1b[1m\x1b[95m- sales >>\x1b[0m\n\x1b[95mLine one\x1b[0m\n\x1b[95mLine two\x1b[0m\n\n",
    );
  });
});

describe("formatActivityStatus", () => {
  it("falls back to Thinking when there is no active tool", () => {
    expect(formatActivityStatus(undefined)).toBe("Thinking");
  });

  it("renders bash commands compactly", () => {
    expect(formatActivityStatus("bash", { command: "npm run check" })).toBe("bash npm run check");
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
    expect(formatActivityStatus("web_search", { query: "role-a backlog hygiene" })).toBe(
      "web_search role-a backlog hygiene",
    );
  });

  it("renders role switches from the requested role ID", () => {
    expect(formatActivityStatus("switch_role", { roleId: "Hermit" })).toBe("switch_role Hermit");
  });
});

describe("renderTerminalMarkdown", () => {
  it("renders a small markdown subset with terminal colors", () => {
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

  it("strips model-supplied terminal control sequences", () => {
    expect(renderTerminalMarkdown("Hello \x1b[31mred\x1b[0m **team**")).toBe("Hello red \x1b[1mteam\x1b[0m");
  });
});
