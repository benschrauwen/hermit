import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HERMIT_ROLE_ID } from "../src/constants.js";
import {
  decodeSessionKey,
  encodeSessionKey,
  extractSessionMessages,
  listWorkspaceSessions,
  loadWorkspaceSessionDetail,
} from "../src/session-browser.js";
import { seedRoleWorkspace } from "./test-helpers.js";

const SESSION_LINES = [
  JSON.stringify({
    type: "session",
    version: 3,
    id: "abcd1234",
    timestamp: "2026-01-01T12:00:00.000Z",
    cwd: "/tmp/workspace",
  }),
  JSON.stringify({
    type: "message",
    id: "msg00001",
    parentId: null,
    timestamp: "2026-01-01T12:00:01.000Z",
    message: { role: "user", content: "Hello from the explorer test" },
  }),
  JSON.stringify({
    type: "message",
    id: "msg00002",
    parentId: "msg00001",
    timestamp: "2026-01-01T12:00:02.000Z",
    message: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Need to read the file first." },
        {
          type: "toolCall",
          id: "call_read_1",
          name: "read",
          arguments: { path: "/tmp/example.txt" },
        },
      ],
    },
  }),
  JSON.stringify({
    type: "message",
    id: "msg00003",
    parentId: "msg00002",
    timestamp: "2026-01-01T12:00:03.000Z",
    message: {
      role: "toolResult",
      toolCallId: "call_read_1",
      toolName: "read",
      content: [{ type: "text", text: "file contents" }],
      isError: false,
    },
  }),
  JSON.stringify({
    type: "message",
    id: "msg00004",
    parentId: "msg00003",
    timestamp: "2026-01-01T12:00:04.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "Hi there" }] },
  }),
].join("\n");

describe("session-browser", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("round-trips session keys within the workspace", () => {
    const root = "/tmp/workspace";
    const sessionPath = path.join(root, ".hermit", "sessions", "hermit", "test.jsonl");
    const key = encodeSessionKey(root, sessionPath);
    expect(decodeSessionKey(root, key)).toBe(path.resolve(sessionPath));
  });

  it("lists and loads persisted Hermit sessions", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "session-browser-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    const sessionsDir = path.join(root, ".hermit", "sessions", "hermit");
    mkdirSync(sessionsDir, { recursive: true });
    const sessionPath = path.join(sessionsDir, "test-session.jsonl");
    writeFileSync(sessionPath, SESSION_LINES, "utf8");

    const listed = await listWorkspaceSessions(root);
    expect(listed.some((session) => session.roleId === HERMIT_ROLE_ID && session.firstMessage.includes("explorer test"))).toBe(
      true,
    );

    const key = encodeSessionKey(root, sessionPath);
    const detail = await loadWorkspaceSessionDetail(root, key);
    expect(detail?.messages).toHaveLength(3);
    expect(detail?.messages[0]?.role).toBe("user");
    expect(detail?.messages[1]?.reasoning).toBe("Need to read the file first.");
    expect(detail?.messages[1]?.toolCalls).toEqual([
      {
        id: "call_read_1",
        name: "read",
        arguments: { path: "/tmp/example.txt" },
        resultText: "file contents",
        resultIsError: false,
      },
    ]);
    expect(detail?.messages[2]?.text).toBe("Hi there");
    expect(extractSessionMessages([])).toEqual([]);
  });

  it("extracts reasoning summaries from encrypted thinking signatures", () => {
    const messages = extractSessionMessages([
      {
        type: "message",
        id: "msg00001",
        parentId: null,
        timestamp: "2026-01-01T12:00:01.000Z",
        message: {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: "",
              thinkingSignature: JSON.stringify({
                type: "reasoning",
                summary: [{ type: "summary_text", text: "Planning the next step." }],
              }),
            },
            { type: "text", text: "Done." },
          ],
        },
      },
    ] as Parameters<typeof extractSessionMessages>[0]);

    expect(messages).toHaveLength(1);
    expect(messages[0]?.reasoning).toBe("Planning the next step.");
    expect(messages[0]?.text).toBe("Done.");
  });
});
