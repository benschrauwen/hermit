import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { formatErrorMessage, isMissingPathError } from "./fs-utils.js";

const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const DEFAULT_TELEGRAM_POLL_TIMEOUT_SECONDS = 20;
const DEFAULT_TELEGRAM_RETRY_DELAY_MS = 5_000;
const TELEGRAM_STATE_FILE = path.join(".hermit", "state", "telegram.json");
const TELEGRAM_MAX_MESSAGE_LENGTH = 4_096;

export interface TelegramBridgeConfig {
  botToken: string;
  chatId: string;
  apiBaseUrl: string;
  pollTimeoutSeconds: number;
}

export type TelegramBridgeStatus =
  | { kind: "disabled" }
  | { kind: "misconfigured"; issues: string[] }
  | { kind: "configured"; config: TelegramBridgeConfig };

export interface TelegramInboundMessage {
  updateId: number;
  chatId: string;
  chatLabel: string;
  senderLabel: string;
  messageId: number;
  text: string;
}

export interface TelegramSendResult {
  chatId: string;
  messageId: number;
  text: string;
}

export type TelegramMessageSender = (config: TelegramBridgeConfig, message: string) => Promise<TelegramSendResult>;

interface TelegramApiChat {
  id?: number | string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  type?: string;
}

interface TelegramApiUser {
  id?: number | string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_bot?: boolean;
}

interface TelegramApiMessage {
  message_id?: number;
  text?: string;
  caption?: string;
  chat?: TelegramApiChat;
  from?: TelegramApiUser;
  [key: string]: unknown;
}

interface TelegramApiUpdate {
  update_id?: number;
  message?: TelegramApiMessage;
  channel_post?: TelegramApiMessage;
}

interface TelegramApiResponse<T> {
  ok?: boolean;
  result?: T;
  description?: string;
}

interface TelegramStateFile {
  nextUpdateOffset?: number;
}

type FetchLike = typeof fetch;

interface TelegramApiCallOptions {
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}

interface TelegramGetUpdatesOptions extends TelegramApiCallOptions {
  nextUpdateOffset?: number;
}

export interface TelegramPollingBridgeOptions {
  workspaceRoot: string;
  config: TelegramBridgeConfig;
  onMessage: (message: TelegramInboundMessage) => void;
  onInfo?: (message: string) => void;
  onError?: (message: string) => void;
  fetchImpl?: FetchLike;
  retryDelayMs?: number;
}

function getTrimmedEnv(env: NodeJS.ProcessEnv, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeChatId(value: number | string | undefined): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
}

function formatNameParts(firstName: string | undefined, lastName: string | undefined): string | undefined {
  const parts = [firstName?.trim(), lastName?.trim()].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function formatChatLabel(chat: TelegramApiChat | undefined, chatId: string): string {
  const titledChat = chat?.title?.trim();
  if (titledChat) {
    return titledChat;
  }

  const username = chat?.username?.trim();
  if (username) {
    return `@${username}`;
  }

  const directName = formatNameParts(chat?.first_name, chat?.last_name);
  if (directName) {
    return directName;
  }

  return `chat ${chatId}`;
}

function formatSenderLabel(message: TelegramApiMessage, fallbackChatLabel: string): string {
  const from = message.from;
  const fullName = formatNameParts(from?.first_name, from?.last_name);
  const username = from?.username?.trim();
  if (fullName && username) {
    return `${fullName} (@${username})`;
  }
  if (fullName) {
    return fullName;
  }
  if (username) {
    return `@${username}`;
  }
  return fallbackChatLabel;
}

function detectAttachmentType(message: TelegramApiMessage): string {
  const knownAttachmentKeys = [
    "photo",
    "voice",
    "video",
    "video_note",
    "audio",
    "sticker",
    "document",
    "animation",
    "contact",
    "location",
    "poll",
  ];

  for (const key of knownAttachmentKeys) {
    if (message[key] !== undefined) {
      return key.replace(/_/g, " ");
    }
  }

  return "non-text message";
}

function extractMessageText(message: TelegramApiMessage): string {
  const text = message.text?.trim();
  if (text) {
    return text;
  }

  const caption = message.caption?.trim();
  if (caption) {
    return `[Telegram ${detectAttachmentType(message)} with caption]\n${caption}`;
  }

  return `[Telegram ${detectAttachmentType(message)}. Ask the human to resend it as text if you need the details.]`;
}

function toInboundMessage(update: TelegramApiUpdate, configuredChatId: string): TelegramInboundMessage | undefined {
  const message = update.message ?? update.channel_post;
  if (!message || message.from?.is_bot) {
    return undefined;
  }

  const chatId = normalizeChatId(message.chat?.id);
  if (!chatId || chatId !== configuredChatId) {
    return undefined;
  }

  const updateId = typeof update.update_id === "number" ? update.update_id : undefined;
  if (updateId === undefined) {
    return undefined;
  }

  const chatLabel = formatChatLabel(message.chat, chatId);
  return {
    updateId,
    chatId,
    chatLabel,
    senderLabel: formatSenderLabel(message, chatLabel),
    messageId: typeof message.message_id === "number" ? message.message_id : 0,
    text: extractMessageText(message),
  };
}

async function callTelegramApi<T>(
  config: TelegramBridgeConfig,
  method: string,
  payload: Record<string, unknown>,
  options: TelegramApiCallOptions = {},
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${config.apiBaseUrl}/bot${config.botToken}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const rawBody = await response.text();
  let parsed: TelegramApiResponse<T> | undefined;
  if (rawBody.trim().length > 0) {
    try {
      parsed = JSON.parse(rawBody) as TelegramApiResponse<T>;
    } catch {
      parsed = undefined;
    }
  }

  if (!response.ok) {
    const detail = parsed?.description?.trim() || `HTTP ${response.status}`;
    throw new Error(`Telegram ${method} failed (${detail}).`);
  }

  if (parsed?.ok !== true || parsed.result === undefined) {
    throw new Error(parsed?.description?.trim() || `Telegram ${method} failed.`);
  }

  return parsed.result;
}

async function getTelegramUpdates(
  config: TelegramBridgeConfig,
  options: TelegramGetUpdatesOptions = {},
): Promise<TelegramApiUpdate[]> {
  const payload: Record<string, unknown> = {
    timeout: config.pollTimeoutSeconds,
    allowed_updates: ["message", "channel_post"],
  };
  if (options.nextUpdateOffset !== undefined) {
    payload.offset = options.nextUpdateOffset;
  }

  return callTelegramApi<TelegramApiUpdate[]>(config, "getUpdates", payload, options);
}

function resolveTelegramStatePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, TELEGRAM_STATE_FILE);
}

async function readTelegramNextUpdateOffset(workspaceRoot: string): Promise<number | undefined> {
  try {
    const raw = await fs.readFile(resolveTelegramStatePath(workspaceRoot), "utf8");
    const parsed = JSON.parse(raw) as TelegramStateFile;
    return typeof parsed.nextUpdateOffset === "number" && Number.isInteger(parsed.nextUpdateOffset) && parsed.nextUpdateOffset > 0
      ? parsed.nextUpdateOffset
      : undefined;
  } catch (error) {
    if (isMissingPathError(error) || error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

async function writeTelegramNextUpdateOffset(workspaceRoot: string, nextUpdateOffset: number): Promise<void> {
  const filePath = resolveTelegramStatePath(workspaceRoot);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload: TelegramStateFile = { nextUpdateOffset };
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAbortFetchError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function resolveTelegramBridgeStatus(env: NodeJS.ProcessEnv = process.env): TelegramBridgeStatus {
  const botToken = getTrimmedEnv(env, "HERMIT_TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_TOKEN");
  const chatId = getTrimmedEnv(env, "HERMIT_TELEGRAM_CHAT_ID");
  const hasAnyTelegramSetting = Boolean(
    botToken ||
      chatId ||
      getTrimmedEnv(env, "HERMIT_TELEGRAM_API_BASE_URL") ||
      getTrimmedEnv(env, "HERMIT_TELEGRAM_POLL_TIMEOUT_SECONDS"),
  );

  if (!hasAnyTelegramSetting) {
    return { kind: "disabled" };
  }

  const issues: string[] = [];
  if (!botToken) {
    issues.push("Set HERMIT_TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN.");
  }
  if (!chatId) {
    issues.push("Set HERMIT_TELEGRAM_CHAT_ID to the one Telegram chat Hermit should listen to.");
  }

  if (issues.length > 0 || !botToken || !chatId) {
    return { kind: "misconfigured", issues };
  }

  return {
    kind: "configured",
    config: {
      botToken,
      chatId,
      apiBaseUrl: getTrimmedEnv(env, "HERMIT_TELEGRAM_API_BASE_URL") ?? DEFAULT_TELEGRAM_API_BASE_URL,
      pollTimeoutSeconds:
        parsePositiveInteger(getTrimmedEnv(env, "HERMIT_TELEGRAM_POLL_TIMEOUT_SECONDS")) ??
        DEFAULT_TELEGRAM_POLL_TIMEOUT_SECONDS,
    },
  };
}

export function resolveTelegramBridgeConfig(env: NodeJS.ProcessEnv = process.env): TelegramBridgeConfig | undefined {
  const status = resolveTelegramBridgeStatus(env);
  return status.kind === "configured" ? status.config : undefined;
}

export function formatTelegramInboundPrompt(message: TelegramInboundMessage): string {
  return [
    `Telegram message from ${message.senderLabel} in ${message.chatLabel} (chat ${message.chatId}, message ${message.messageId}).`,
    "This message came from Telegram.",
    "Use send_telegram_message to reply; replying in the normal chat does not send anything back to Telegram.",
    "Keep Telegram replies shorter than regular chat because they are shown in a chat app.",
    "",
    "Message:",
    message.text,
  ].join("\n");
}

export async function sendTelegramMessage(config: TelegramBridgeConfig, message: string): Promise<TelegramSendResult> {
  const text = message.trim();
  if (text.length === 0) {
    throw new Error("Telegram message cannot be empty.");
  }
  if (text.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
    throw new Error(`Telegram messages must be ${TELEGRAM_MAX_MESSAGE_LENGTH} characters or fewer.`);
  }

  const result = await callTelegramApi<TelegramApiMessage>(config, "sendMessage", {
    chat_id: config.chatId,
    text,
  });
  return {
    chatId: config.chatId,
    messageId: typeof result.message_id === "number" ? result.message_id : 0,
    text,
  };
}

export class TelegramPollingBridge {
  private stopped = false;
  private loopPromise: Promise<void> | undefined;
  private activeRequestController: AbortController | undefined;

  constructor(private readonly options: TelegramPollingBridgeOptions) {}

  start(): void {
    if (this.loopPromise) {
      return;
    }

    this.loopPromise = this.run();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.activeRequestController?.abort();
    try {
      await this.loopPromise;
    } catch (error) {
      if (!isAbortFetchError(error)) {
        throw error;
      }
    }
  }

  private async run(): Promise<void> {
    let nextUpdateOffset = await readTelegramNextUpdateOffset(this.options.workspaceRoot);
    this.options.onInfo?.(`Telegram bridge listening for chat ${this.options.config.chatId}.`);

    while (!this.stopped) {
      try {
        const controller = new AbortController();
        this.activeRequestController = controller;
        const updates = await getTelegramUpdates(this.options.config, {
          signal: controller.signal,
          ...(nextUpdateOffset !== undefined ? { nextUpdateOffset } : {}),
          ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}),
        });
        this.activeRequestController = undefined;

        let highestUpdateId = nextUpdateOffset !== undefined ? nextUpdateOffset - 1 : undefined;
        for (const update of updates) {
          const updateId = typeof update.update_id === "number" ? update.update_id : undefined;
          if (updateId !== undefined) {
            highestUpdateId = highestUpdateId === undefined ? updateId : Math.max(highestUpdateId, updateId);
          }

          const inboundMessage = toInboundMessage(update, this.options.config.chatId);
          if (inboundMessage) {
            this.options.onMessage(inboundMessage);
          }
        }

        if (highestUpdateId !== undefined) {
          const resolvedNextOffset = highestUpdateId + 1;
          if (resolvedNextOffset !== nextUpdateOffset) {
            nextUpdateOffset = resolvedNextOffset;
            await writeTelegramNextUpdateOffset(this.options.workspaceRoot, resolvedNextOffset);
          }
        }
      } catch (error) {
        this.activeRequestController = undefined;
        if (this.stopped && isAbortFetchError(error)) {
          return;
        }
        if (isAbortFetchError(error)) {
          continue;
        }

        this.options.onError?.(`Telegram polling failed (${formatErrorMessage(error)}).`);
        await sleep(this.options.retryDelayMs ?? DEFAULT_TELEGRAM_RETRY_DELAY_MS);
      }
    }
  }
}
