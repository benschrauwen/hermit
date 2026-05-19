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
    message: { role: "assistant", content: "Hi there" },
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
    expect(detail?.messages).toHaveLength(2);
    expect(detail?.messages[0]?.role).toBe("user");
    expect(extractSessionMessages([])).toEqual([]);
  });
});
