import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { formatTelegramInboundPrompt, resolveTelegramBridgeStatus, TelegramPollingBridge } from "../src/telegram.js";

function createTelegramResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function createAbortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

describe("resolveTelegramBridgeStatus", () => {
  it("returns configured when token and chat ID are present", () => {
    expect(
      resolveTelegramBridgeStatus({
        HERMIT_TELEGRAM_BOT_TOKEN: "token-123",
        HERMIT_TELEGRAM_CHAT_ID: "456",
      }),
    ).toEqual({
      kind: "configured",
      config: {
        botToken: "token-123",
        chatId: "456",
        apiBaseUrl: "https://api.telegram.org",
        pollTimeoutSeconds: 20,
      },
    });
  });

  it("reports misconfiguration when only one required setting is present", () => {
    const status = resolveTelegramBridgeStatus({
      HERMIT_TELEGRAM_CHAT_ID: "456",
    });
    expect(status.kind).toBe("misconfigured");
    if (status.kind === "misconfigured") {
      expect(status.issues).toContain("Set HERMIT_TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN.");
    }
  });
});

describe("formatTelegramInboundPrompt", () => {
  it("prepends tool and brevity guidance for Telegram messages", () => {
    const prompt = formatTelegramInboundPrompt({
      updateId: 10,
      chatId: "456",
      chatLabel: "Alice",
      senderLabel: "Alice",
      messageId: 12,
      text: "Can you summarize the latest plan?",
    });

    expect(prompt).toContain("This message came from Telegram.");
    expect(prompt).toContain("Use send_telegram_message to reply");
    expect(prompt).toContain("Keep Telegram replies shorter");
    expect(prompt).toContain("Can you summarize the latest plan?");
  });
});

describe("TelegramPollingBridge", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("forwards messages from the configured chat and persists the next update offset", async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), "telegram-bridge-"));
    tempDirs.push(workspaceRoot);

    let fetchCallCount = 0;
    const fetchImpl = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      fetchCallCount += 1;
      if (fetchCallCount === 1) {
        return createTelegramResponse({
          ok: true,
          result: [
            {
              update_id: 10,
              message: {
                message_id: 12,
                text: "Ping from Telegram",
                chat: { id: 456, first_name: "Alice" },
                from: { first_name: "Alice" },
              },
            },
            {
              update_id: 11,
              message: {
                message_id: 13,
                text: "Ignore me",
                chat: { id: 999, first_name: "Mallory" },
                from: { first_name: "Mallory" },
              },
            },
          ],
        });
      }

      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(createAbortError());
        });
      });
    };

    const receivedMessages: Array<{ senderLabel: string; text: string }> = [];
    const infoMessages: string[] = [];
    let readyCount = 0;
    const bridge = new TelegramPollingBridge({
      workspaceRoot,
      config: {
        botToken: "token-123",
        chatId: "456",
        apiBaseUrl: "https://api.telegram.org",
        pollTimeoutSeconds: 20,
      },
      fetchImpl,
      onMessage: (message) => {
        receivedMessages.push({
          senderLabel: message.senderLabel,
          text: message.text,
        });
      },
      onReady: () => {
        readyCount += 1;
      },
      onInfo: (message) => {
        infoMessages.push(message);
      },
    });

    bridge.start();

    while (receivedMessages.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await bridge.stop();

    expect(receivedMessages).toEqual([
      {
        senderLabel: "Alice",
        text: "Ping from Telegram",
      },
    ]);
    expect(infoMessages).toContain("Telegram bridge listening for chat 456.");
    expect(readyCount).toBe(1);

    const statePath = path.join(workspaceRoot, ".hermit", "state", "telegram.json");
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({
      nextUpdateOffset: 12,
    });
  });
});
