import { describe, expect, it } from "vitest";

import {
  extractExplorerUrl,
  interruptActiveHeartbeatForChatPrompt,
  renderAnsiTextBlock,
  resolveWorkspaceStartLayout,
} from "../src/workspace-start.js";

describe("resolveWorkspaceStartLayout", () => {
  it("reserves a larger lower pane for chat on standard terminals", () => {
    expect(resolveWorkspaceStartLayout(24)).toEqual({
      heartbeatHeight: 7,
      chatHeight: 16,
    });
  });

  it("still leaves room for chat on smaller terminals", () => {
    expect(resolveWorkspaceStartLayout(8)).toEqual({
      heartbeatHeight: 2,
      chatHeight: 5,
    });
  });
});

describe("extractExplorerUrl", () => {
  it("finds the local Astro URL in process output", () => {
    expect(extractExplorerUrl("┃ Local    http://localhost:4321/\n")).toBe("http://localhost:4321/");
  });

  it("supports wildcard bind output", () => {
    expect(extractExplorerUrl("ready in 412ms at http://0.0.0.0:4321")).toBe("http://0.0.0.0:4321");
  });

  it("returns undefined when no local URL is present", () => {
    expect(extractExplorerUrl("starting explorer...\n")).toBeUndefined();
  });
});

describe("renderAnsiTextBlock", () => {
  it("treats CR-based redraws as line replacement", () => {
    expect(renderAnsiTextBlock("| Thinking\r\x1b[2K/ Thinking\r\x1b[2K- Thinking", 80)).toEqual(["- Thinking"]);
  });

  it("keeps completed heartbeat log lines after spinner redraws", () => {
    expect(renderAnsiTextBlock("| Thinking\r\x1b[2K[done]\n", 80)).toEqual(["[done]", ""]);
  });
});

describe("interruptActiveHeartbeatForChatPrompt", () => {
  it("aborts the active heartbeat turn before a chat prompt starts", () => {
    let abortCount = 0;

    expect(
      interruptActiveHeartbeatForChatPrompt(
        {
          getActiveOwner: () => ({
            id: "heartbeat-1",
            kind: "heartbeat",
            commandName: "heartbeat",
            acquiredAt: "2026-03-28T00:00:00.000Z",
            roleId: "role-a",
          }),
          acquire: async () => undefined,
        },
        {
          abortActiveSession: () => {
            abortCount += 1;
            return { abortedActiveSession: true };
          },
        },
      ),
    ).toBe(true);
    expect(abortCount).toBe(1);
  });

  it("leaves chat alone when no heartbeat turn is active", () => {
    let abortCount = 0;

    expect(
      interruptActiveHeartbeatForChatPrompt(
        {
          getActiveOwner: () => ({
            id: "chat-1",
            kind: "interactive",
            commandName: "chat",
            acquiredAt: "2026-03-28T00:00:00.000Z",
            roleId: "role-a",
          }),
          acquire: async () => undefined,
        },
        {
          abortActiveSession: () => {
            abortCount += 1;
            return { abortedActiveSession: true };
          },
        },
      ),
    ).toBe(false);
    expect(abortCount).toBe(0);
  });
});
