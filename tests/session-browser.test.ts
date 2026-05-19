import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { HERMIT_ROLE_ID } from "../src/constants.js";
import {
  decodeSessionKey,
  encodeSessionKey,
  extractSessionMessages,
  resolveSessionPathUnderWorkspace,
  resolveWorkspaceSessionPath,
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

  it("resolves session paths across interactive and heartbeat histories", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "session-browser-find-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    const hermitSessionsDir = path.join(root, ".hermit", "sessions", "hermit");
    mkdirSync(hermitSessionsDir, { recursive: true });
    const hermitSessionPath = path.join(hermitSessionsDir, "hermit-session.jsonl");
    writeFileSync(hermitSessionPath, SESSION_LINES, "utf8");

    const heartbeatSessionsDir = path.join(root, "agents", "role-a", ".role-agent", "heartbeat-sessions");
    mkdirSync(heartbeatSessionsDir, { recursive: true });
    const heartbeatSessionPath = path.join(heartbeatSessionsDir, "heartbeat-session.jsonl");
    writeFileSync(heartbeatSessionPath, SESSION_LINES, "utf8");

    const hermitSession = await resolveWorkspaceSessionPath(
      root,
      ".hermit/sessions/hermit/hermit-session.jsonl",
    );
    expect(hermitSession).toMatchObject({
      roleId: HERMIT_ROLE_ID,
      historyType: "interactive",
      path: hermitSessionPath,
    });

    const heartbeatSession = await resolveWorkspaceSessionPath(
      root,
      "agents/role-a/.role-agent/heartbeat-sessions/heartbeat-session.jsonl",
    );
    expect(heartbeatSession).toMatchObject({
      roleId: "role-a",
      historyType: "heartbeat",
      path: heartbeatSessionPath,
    });

    expect(resolveSessionPathUnderWorkspace(root, hermitSessionPath)).toBe(hermitSessionPath);
    await expect(resolveWorkspaceSessionPath(root, "missing/session.jsonl")).rejects.toThrow(/not found/);
    await expect(resolveWorkspaceSessionPath(root, "../outside.jsonl")).rejects.toThrow(/outside workspace/);
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
