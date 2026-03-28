import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createCustomTools,
  createEntityLookupTool,
  createHermitTools,
  createRoleSwitchTool,
  createTelegramSendTool,
  createWebSearchTool,
} from "../src/agent-tools.js";
import { loadRole } from "../src/roles.js";
import { ensureWorkspaceScaffold } from "../src/workspace.js";
import { seedRoleWorkspace } from "./test-helpers.js";

describe("createEntityLookupTool", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "agent-tools-lookup-"));
    seedRoleWorkspace(root, ["role-a"]);
  });

  it("returns tool with expected name and description", () => {
    const role = {
      id: "role-a",
    } as Awaited<ReturnType<typeof loadRole>>;
    const tool = createEntityLookupTool("/any/root", role);
    expect(tool.name).toBe("entity_lookup");
    expect(tool.label).toBe("Entity Lookup");
    expect(tool.description).toContain("shared and role-specific entities");
    expect(tool.parameters).toBeDefined();
  });

  it("execute returns content and details (empty when no entities)", async () => {
    const role = await loadRole(root, "role-a");
    const tool = createEntityLookupTool(root, role);
    const execute = tool.execute as (
      id: unknown,
      params: { query: string; type?: string; limit?: number },
    ) => Promise<unknown>;
    const result = (await execute("call-1", {
      query: "jane",
      limit: 10,
    })) as {
      content: Array<{ type: string; text: string }>;
      details: { count: number };
    };
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.details).toEqual({ count: 0 });
    expect(JSON.parse(result.content[0].text)).toEqual([]);
  });
});

describe("createCustomTools", () => {
  it("returns entity lookup and create-entity-record tools for shared and role entities", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "agent-tools-custom-"));
    seedRoleWorkspace(root, ["role-a"]);
    const role = await loadRole(root, "role-a");
    const tools = createCustomTools("/root", role);
    const names = tools.map((t) => t.name);
    expect(names).toContain("entity_lookup");
    expect(names).toContain("web_search");
    expect(names).toContain("create_item_record");
    expect(names).toContain("create_case_record");
    expect(names).toContain("create_issue_record");
    rmSync(root, { recursive: true, force: true });
  });
});

describe("createHermitTools", () => {
  it("returns web search for Hermit sessions by default", () => {
    const tools = createHermitTools("/tmp/workspace");
    expect(tools.map((tool) => tool.name)).toEqual(["web_search"]);
  });

  it("adds telegram send tool when telegram config is provided", () => {
    const tools = createHermitTools("/tmp/workspace", {
      telegram: {
        config: {
          botToken: "telegram-token",
          chatId: "123456",
          apiBaseUrl: "https://api.telegram.org",
          pollTimeoutSeconds: 20,
        },
      },
    });
    expect(tools.map((tool) => tool.name)).toEqual(["web_search", "send_telegram_message"]);
  });
});

describe("createRoleSwitchTool", () => {
  it("queues a switch into Hermit or another known role", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "agent-tools-switch-"));
    try {
      seedRoleWorkspace(root, ["role-a"]);
      const requests: Array<{ roleId: string; reason?: string }> = [];
      const tool = createRoleSwitchTool(root, {
        onRoleSwitchRequest: (request) => {
          requests.push(request);
        },
      });
      await (tool.execute as (id: unknown, params: unknown) => Promise<unknown>)("call-1", {
        roleId: "Hermit",
        reason: "Return to the base prompt.",
      });
      await (tool.execute as (id: unknown, params: unknown) => Promise<unknown>)("call-2", {
        roleId: "role-a",
      });

      expect(requests).toEqual([
        { roleId: "Hermit", reason: "Return to the base prompt." },
        { roleId: "role-a" },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("createWebSearchTool", () => {
  it("describes web search as full research support", () => {
    const tool = createWebSearchTool();
    expect(tool.description).toContain("research subagent");
    expect(tool.promptSnippet).toContain("full research question");
    expect(tool.promptGuidelines).toContain(
      "Treat web_search as a web-connected research worker, not a simple keyword lookup box: give it the full question, objective, and any useful constraints.",
    );
    expect(tool.promptGuidelines).toContain(
      "Complex web_search runs can take several minutes, so prefer background or heartbeat-friendly use when the answer is not needed immediately.",
    );
  });

  it("formats answer text and citations from the executor", async () => {
    const executor = vi.fn().mockResolvedValue({
      answer: "OpenAI supports web search through the Responses API.",
      citations: [
        {
          title: "Web search | OpenAI API",
          url: "https://developers.openai.com/api/docs/guides/tools-web-search/",
        },
      ],
    });

    const tool = createWebSearchTool(executor);
    const result = await (tool.execute as (id: unknown, params: unknown) => Promise<unknown>)("call-1", {
      query: "How does OpenAI web search work?",
      allowedDomains: ["developers.openai.com"],
      externalWebAccess: false,
    });

    expect(executor).toHaveBeenCalledWith({
      query: "How does OpenAI web search work?",
      allowedDomains: ["developers.openai.com"],
      externalWebAccess: false,
    });

    const typed = result as {
      content: Array<{ type: string; text: string }>;
      details: {
        answer: string;
        citations: Array<{ title?: string; url: string }>;
      };
    };
    expect(typed.content).toHaveLength(1);
    expect(typed.content[0].type).toBe("text");
    expect(typed.content[0].text).toContain("OpenAI supports web search");
    expect(typed.content[0].text).toContain("Sources:");
    expect(typed.content[0].text).toContain("Web search | OpenAI API");
    expect(typed.details.citations).toEqual([
      {
        title: "Web search | OpenAI API",
        url: "https://developers.openai.com/api/docs/guides/tools-web-search/",
      },
    ]);
  });
});

describe("createTelegramSendTool", () => {
  it("sends the configured message through the telegram sender", async () => {
    const sender = vi.fn().mockResolvedValue({
      chatId: "123456",
      messageId: 77,
      text: "Short reply",
    });
    const tool = createTelegramSendTool(
      {
        botToken: "telegram-token",
        chatId: "123456",
        apiBaseUrl: "https://api.telegram.org",
        pollTimeoutSeconds: 20,
      },
      sender,
    );

    expect(tool.promptGuidelines).toContain(
      "Keep Telegram replies shorter and more direct than normal desktop chat because they appear in a chat app.",
    );

    const result = await (tool.execute as (id: unknown, params: unknown) => Promise<unknown>)("call-1", {
      message: "Short reply",
    });

    expect(sender).toHaveBeenCalledWith(
      {
        botToken: "telegram-token",
        chatId: "123456",
        apiBaseUrl: "https://api.telegram.org",
        pollTimeoutSeconds: 20,
      },
      "Short reply",
    );
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Telegram message sent to chat 123456.",
        },
      ],
      details: {
        chatId: "123456",
        messageId: 77,
        text: "Short reply",
      },
    });
  });
});

describe("createEntityRecordTool", () => {
  it("creates a record via the generic entity tool", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "agent-tools-"));
    try {
      seedRoleWorkspace(root, ["role-a"]);
      await ensureWorkspaceScaffold(root, await loadRole(root, "role-a"));
      const role = await loadRole(root, "role-a");
      const entity = role.entities[0];
      expect(entity).toBeDefined();
      const { createEntityRecordTool } = await import("../src/agent-tools.js");
      const tool = createEntityRecordTool(root, role, entity!);
      const params = Object.fromEntries(
        entity!.fields.map((field) => [
          field.key,
          field.type === "string-array" ? [`${field.label} Example`] : `${field.label} Example`,
        ]),
      );
      const result = await (tool.execute as (id: unknown, params: unknown) => Promise<unknown>)("id", params);
      const typed = result as { details: { path: string } };
      expect(typed.details.path).toBeTruthy();
      expect(readFileSync(path.join(typed.details.path, "record.md"), "utf8")).toContain("agent onboarding");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
