import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { SessionManager } from "@mariozechner/pi-coding-agent";
import { afterEach, describe, expect, it } from "vitest";

import {
  renderSessionHistoryToSink,
  sessionHasTranscriptHistory,
} from "../src/session-transcript-replay.js";

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
    message: { role: "user", content: "Hello from the replay test" },
  }),
  JSON.stringify({
    type: "message",
    id: "msg00002",
    parentId: "msg00001",
    timestamp: "2026-01-01T12:00:02.000Z",
    message: {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "call_read_1",
          name: "read",
          arguments: { path: "/tmp/example.txt" },
        },
        { type: "text", text: "Hi there" },
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
].join("\n");

describe("session transcript replay", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects persisted transcript history", () => {
    const root = mkdtempSync(path.join(tmpdir(), "session-replay-"));
    roots.push(root);
    const sessionsDir = path.join(root, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    const sessionPath = path.join(sessionsDir, "test-session.jsonl");
    writeFileSync(sessionPath, SESSION_LINES, "utf8");

    const emptyManager = SessionManager.create(root, sessionsDir);
    expect(sessionHasTranscriptHistory(emptyManager)).toBe(false);

    const manager = SessionManager.open(sessionPath, sessionsDir);
    expect(sessionHasTranscriptHistory(manager)).toBe(true);
  });

  it("renders user, tool, and assistant messages into the sink", () => {
    const root = mkdtempSync(path.join(tmpdir(), "session-replay-render-"));
    roots.push(root);
    const sessionsDir = path.join(root, "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    const sessionPath = path.join(sessionsDir, "test-session.jsonl");
    writeFileSync(sessionPath, SESSION_LINES, "utf8");

    const manager = SessionManager.open(sessionPath, sessionsDir);
    const chunks: string[] = [];
    const count = renderSessionHistoryToSink(manager, {
      appendText: (text) => {
        chunks.push(text);
      },
      appendToolStatus: (text) => {
        chunks.push(`[tool] ${text}`);
      },
      showStatus: () => undefined,
      clearStatus: () => undefined,
    }, "role-a");

    expect(count).toBe(2);
    expect(chunks.join("")).toContain("Hello from the replay test");
    expect(chunks.join("")).toContain("[tool]");
    expect(chunks.join("")).toContain("read");
    expect(chunks.join("")).toContain("Hi there");
  });
});
