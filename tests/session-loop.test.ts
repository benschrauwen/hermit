import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { questionMock, closeMock, tuiReadInputMock, MockChatTui } = vi.hoisted(() => {
  const questionMock = vi.fn<() => Promise<string>>();
  const closeMock = vi.fn();
  const tuiReadInputMock = vi.fn<() => Promise<string>>();

  class MockChatTui {
    static instances: MockChatTui[] = [];

    public activeRoleLabel: string;
    public readonly notices: string[] = [];

    constructor(activeRoleLabel: string) {
      this.activeRoleLabel = activeRoleLabel;
      MockChatTui.instances.push(this);
    }

    setInterruptHandler(): void {}

    setActiveRoleLabel(activeRoleLabel: string): void {
      this.activeRoleLabel = activeRoleLabel;
    }

    async readInput(): Promise<string> {
      return tuiReadInputMock();
    }

    consumeExitRequest(): boolean {
      return false;
    }

    appendUserPrompt(): void {}

    appendSystemNotice(text: string): void {
      this.notices.push(text);
    }

    async close(): Promise<void> {}
  }

  return {
    questionMock,
    closeMock,
    tuiReadInputMock,
    MockChatTui,
  };
});

vi.mock("node:readline/promises", () => ({
  default: {
    createInterface: () => ({
      question: questionMock,
      close: closeMock,
    }),
  },
}));

vi.mock("../src/session-terminal.js", () => ({
  attachConsoleStreaming: () => () => {},
  formatEntryDesignator: (activeRoleLabel: string) => `- ${activeRoleLabel} >>`,
  formatUserPromptEcho: (prompt: string, activeRoleLabel: string) => `${activeRoleLabel}:${prompt}`,
}));

vi.mock("../src/session-chat-ui.js", () => ({
  ChatTui: MockChatTui,
  attachChatTuiStreaming: () => () => {},
}));

import { runChatLoop } from "../src/session-loop.js";

import type { InteractiveChatSession, RoleSwitchRequest } from "../src/session-types.js";

function createInteractiveSession(
  activeRoleLabel: string,
  pendingRequests: RoleSwitchRequest[],
  prompts: string[],
): InteractiveChatSession {
  return {
    session: {
      prompt: async (prompt: string) => {
        prompts.push(prompt);
      },
      abort: async () => {},
    } as never,
    telemetry: {} as never,
    workspaceState: {
      initialized: true,
      sharedEntityCount: 0,
      roleEntityCount: 0,
      roleEntityCounts: {},
    },
    activeRoleLabel,
    modelLabel: "anthropic/claude-sonnet-4-6",
    consumeRoleSwitchRequest: () => pendingRequests.shift(),
  };
}

describe("runChatLoop role switching", () => {
  const stdinTtyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const stdoutTtyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  let stdoutWriteSpy: { mockRestore: () => void };

  beforeEach(() => {
    questionMock.mockReset();
    closeMock.mockReset();
    tuiReadInputMock.mockReset();
    MockChatTui.instances = [];
    stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
    if (stdinTtyDescriptor) {
      Object.defineProperty(process.stdin, "isTTY", stdinTtyDescriptor);
    }
    if (stdoutTtyDescriptor) {
      Object.defineProperty(process.stdout, "isTTY", stdoutTtyDescriptor);
    }
  });

  it("swaps roles without prompting the new session in readline mode", async () => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
    questionMock.mockResolvedValueOnce("/quit");

    const initialPrompts: string[] = [];
    const switchedPrompts: string[] = [];
    const initialSession = createInteractiveSession("Hermit", [{ roleId: "retouch-approval-manager" }], initialPrompts);
    const switchedSession = createInteractiveSession("retouch-approval-manager", [], switchedPrompts);
    const onRoleSwitch = vi.fn(async () => switchedSession);

    await runChatLoop({
      initialSession,
      initialPrompt: "Resume the intake workflow.",
      onRoleSwitch,
    });

    expect(onRoleSwitch).toHaveBeenCalledTimes(1);
    expect(initialPrompts).toEqual(["Resume the intake workflow."]);
    expect(switchedPrompts).toEqual([]);
    expect(stdoutWriteSpy).toHaveBeenCalledWith("\x1b[90mUsing model anthropic/claude-sonnet-4-6.\x1b[0m\n");
  });

  it("swaps roles without prompting the new session in TUI mode", async () => {
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    tuiReadInputMock.mockResolvedValueOnce("/quit");

    const initialPrompts: string[] = [];
    const switchedPrompts: string[] = [];
    const initialSession = createInteractiveSession("Hermit", [{ roleId: "personal-assistant" }], initialPrompts);
    const switchedSession = createInteractiveSession("personal-assistant", [], switchedPrompts);
    const onRoleSwitch = vi.fn(async () => switchedSession);

    await runChatLoop({
      initialSession,
      initialPrompt: "Pick up where we left off.",
      onRoleSwitch,
    });

    expect(onRoleSwitch).toHaveBeenCalledTimes(1);
    expect(initialPrompts).toEqual(["Pick up where we left off."]);
    expect(switchedPrompts).toEqual([]);
    expect(MockChatTui.instances).toHaveLength(1);
    expect(MockChatTui.instances[0]?.notices).toContain("Using model anthropic/claude-sonnet-4-6.");
    expect(MockChatTui.instances[0]?.notices).toContain(
      "Switched active role to personal-assistant using anthropic/claude-sonnet-4-6.",
    );
  });
});
