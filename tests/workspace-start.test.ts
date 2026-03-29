import { describe, expect, it } from "vitest";

import {
  extractExplorerUrl,
  formatHeartbeatHeaderDetail,
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

describe("formatHeartbeatHeaderDetail", () => {
  it("includes telegram after explorer and tailscale when connected", () => {
    expect(
      formatHeartbeatHeaderDetail("http://localhost:4321", "up at https://tail.example.ts.net", "connected"),
    ).toBe("Explorer http://localhost:4321 | Tailscale up at https://tail.example.ts.net | Telegram connected");
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

