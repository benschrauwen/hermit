import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { formatErrorMessage, isMissingPathError } from "./fs-utils.js";

const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const DEFAULT_TELEGRAM_POLL_TIMEOUT_SECONDS = 20;
const DEFAULT_TELEGRAM_RETRY_DELAY_MS = 5_000;
const TELEGRAM_STATE_FILE = path.join(".hermit", "state", "telegram.json");
const TELEGRAM_ATTACHMENT_DIR = path.join("inbox", "telegram");
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

export interface TelegramInboundAttachment {
  kind: string;
  path: string;
}

export interface TelegramInboundMessage {
  updateId: number;
  chatId: string;
  chatLabel: string;
  senderLabel: string;
  messageId: number;
  text: string;
  attachments?: TelegramInboundAttachment[];
}

export interface TelegramSendResult {
  chatId: string;
  messageId: number;
  text: string;
}

export interface TelegramVoiceSendResult {
  chatId: string;
  messageId: number;
  audioFilePath: string;
  caption?: string;
}

export type TelegramMessageSender = (config: TelegramBridgeConfig, message: string) => Promise<TelegramSendResult>;
export type TelegramVoiceNoteSender = (
  config: TelegramBridgeConfig,
  audioFilePath: string,
  caption?: string,
) => Promise<TelegramVoiceSendResult>;

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

interface TelegramApiFile {
  file_id?: string;
  file_path?: string;
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
  onReady?: () => void;
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
      return key === "voice" ? "voice note" : key.replace(/_/g, " ");
    }
  }

  return "non-text message";
}

function getObjectProperty(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

function getStringProperty(value: unknown, key: string): string | undefined {
  const property = getObjectProperty(value, key);
  return typeof property === "string" && property.trim().length > 0 ? property.trim() : undefined;
}

function getExtensionFromPath(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined;
  }
  const extension = path.extname(filePath).trim().toLowerCase();
  return extension.length > 0 ? extension : undefined;
}

function extensionFromMimeType(mimeType: string | undefined): string | undefined {
  switch (mimeType?.toLowerCase()) {
    case "audio/ogg":
    case "application/ogg":
      return ".ogg";
    case "audio/mpeg":
      return ".mp3";
    case "audio/mp4":
    case "audio/x-m4a":
      return ".m4a";
    case "audio/wav":
    case "audio/x-wav":
      return ".wav";
    case "audio/webm":
      return ".webm";
    case "video/mp4":
      return ".mp4";
    default:
      return undefined;
  }
}

interface DownloadableTelegramAttachment {
  kind: string;
  fileId: string;
  extension: string;
}

function getDownloadableAttachments(message: TelegramApiMessage): DownloadableTelegramAttachment[] {
  const voiceFileId = getStringProperty(message.voice, "file_id");
  if (voiceFileId) {
    return [{ kind: "voice note", fileId: voiceFileId, extension: ".ogg" }];
  }

  const audioFileId = getStringProperty(message.audio, "file_id");
  if (audioFileId) {
    const audioFileName = getStringProperty(message.audio, "file_name");
    const audioMimeType = getStringProperty(message.audio, "mime_type");
    return [{
      kind: "audio",
      fileId: audioFileId,
      extension: getExtensionFromPath(audioFileName) ?? extensionFromMimeType(audioMimeType) ?? ".mp3",
    }];
  }

  const videoNoteFileId = getStringProperty(message.video_note, "file_id");
  if (videoNoteFileId) {
    return [{ kind: "video note", fileId: videoNoteFileId, extension: ".mp4" }];
  }

  const documentFileId = getStringProperty(message.document, "file_id");
  const documentMimeType = getStringProperty(message.document, "mime_type");
  if (documentFileId && documentMimeType?.toLowerCase().startsWith("audio/")) {
    const documentFileName = getStringProperty(message.document, "file_name");
    return [{
      kind: "audio document",
      fileId: documentFileId,
      extension: getExtensionFromPath(documentFileName) ?? extensionFromMimeType(documentMimeType) ?? ".bin",
    }];
  }

  return [];
}

function extractMessageText(message: TelegramApiMessage, hasSavedAttachments = false): string {
  const text = message.text?.trim();
  if (text) {
    return text;
  }

  const caption = message.caption?.trim();
  if (caption) {
    return `[Telegram ${detectAttachmentType(message)} with caption]\n${caption}`;
  }

  if (hasSavedAttachments) {
    return `[Telegram ${detectAttachmentType(message)} saved to the workspace inbox.]`;
  }

  return `[Telegram ${detectAttachmentType(message)}. Ask the human to resend it as text if you need the details.]`;
}

function normalizeAttachmentFileNamePart(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "attachment";
}

async function getTelegramFile(
  config: TelegramBridgeConfig,
  fileId: string,
  options: TelegramApiCallOptions = {},
): Promise<TelegramApiFile> {
  return callTelegramApi<TelegramApiFile>(config, "getFile", { file_id: fileId }, options);
}

async function downloadTelegramFile(
  config: TelegramBridgeConfig,
  filePath: string,
  options: TelegramApiCallOptions = {},
): Promise<Uint8Array> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${config.apiBaseUrl}/file/bot${config.botToken}/${filePath}`, {
    method: "GET",
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    throw new Error(`Telegram file download failed (HTTP ${response.status}).`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function saveTelegramAttachment(args: {
  workspaceRoot: string;
  config: TelegramBridgeConfig;
  updateId: number;
  messageId: number;
  attachment: DownloadableTelegramAttachment;
  options?: TelegramApiCallOptions;
}): Promise<TelegramInboundAttachment> {
  const telegramFile = await getTelegramFile(args.config, args.attachment.fileId, args.options);
  const remoteFilePath = telegramFile.file_path?.trim();
  if (!remoteFilePath) {
    throw new Error(`Telegram attachment ${args.attachment.fileId} is missing file_path.`);
  }

  const bytes = await downloadTelegramFile(args.config, remoteFilePath, args.options);
  const fileName = `${String(args.updateId).padStart(8, "0")}-${String(args.messageId).padStart(6, "0")}-${normalizeAttachmentFileNamePart(args.attachment.kind)}${args.attachment.extension}`;
  const workspaceRelativePath = path.join(TELEGRAM_ATTACHMENT_DIR, fileName);
  const absolutePath = path.join(args.workspaceRoot, workspaceRelativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, bytes);

  return {
    kind: args.attachment.kind,
    path: absolutePath,
  };
}

async function toInboundMessage(
  update: TelegramApiUpdate,
  configuredChatId: string,
  options: {
    workspaceRoot: string;
    config: TelegramBridgeConfig;
    fetchImpl?: FetchLike;
    signal?: AbortSignal;
  },
): Promise<TelegramInboundMessage | undefined> {
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

  const downloadableAttachments = getDownloadableAttachments(message);
  const attachments = await Promise.all(
    downloadableAttachments.map((attachment) =>
      saveTelegramAttachment({
        workspaceRoot: options.workspaceRoot,
        config: options.config,
        updateId,
        messageId: typeof message.message_id === "number" ? message.message_id : 0,
        attachment,
        options: {
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
          ...(options.signal ? { signal: options.signal } : {}),
        },
      }),
    ),
  );

  const chatLabel = formatChatLabel(message.chat, chatId);
  return {
    updateId,
    chatId,
    chatLabel,
    senderLabel: formatSenderLabel(message, chatLabel),
    messageId: typeof message.message_id === "number" ? message.message_id : 0,
    text: extractMessageText(message, attachments.length > 0),
    ...(attachments.length > 0 ? { attachments } : {}),
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
  const startedWithVoiceNote = Boolean(message.attachments?.some((attachment) => attachment.kind === "voice note"));
  return [
    `Telegram message from ${message.senderLabel} in ${message.chatLabel} (chat ${message.chatId}, message ${message.messageId}).`,
    "This message came from Telegram.",
    "Use send_telegram_message to reply; replying in the normal chat does not send anything back to Telegram.",
    ...(startedWithVoiceNote
      ? [
          "The user started this Telegram exchange with a voice note.",
          "Prefer replying with a Telegram voice note when the reply is substantive and the voice-send tool is available.",
        ]
      : []),
    "Keep Telegram replies shorter than regular chat because they are shown in a chat app.",
    ...(message.attachments && message.attachments.length > 0
      ? [
          "If you need the content of a saved audio attachment, use the telegram-voice-transcription skill before replying.",
          "",
          "Saved attachments:",
          ...message.attachments.map((attachment) => `- ${attachment.path} (${attachment.kind})`),
        ]
      : []),
    "",
    "Message:",
    message.text,
  ].join("\n");
}

function getTelegramAudioMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".ogg":
    case ".opus":
      return "audio/ogg";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    default:
      return "application/octet-stream";
  }
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

export async function sendTelegramVoiceNote(
  config: TelegramBridgeConfig,
  audioFilePath: string,
  caption?: string,
): Promise<TelegramVoiceSendResult> {
  const resolvedPath = path.resolve(audioFilePath);
  const fileBuffer = await fs.readFile(resolvedPath).catch((error) => {
    if (isMissingPathError(error)) {
      throw new Error(`Telegram voice note file not found: ${resolvedPath}`);
    }
    throw error;
  });

  const trimmedCaption = caption?.trim();
  if (trimmedCaption && trimmedCaption.length > TELEGRAM_MAX_MESSAGE_LENGTH) {
    throw new Error(`Telegram captions must be ${TELEGRAM_MAX_MESSAGE_LENGTH} characters or fewer.`);
  }

  const form = new FormData();
  form.set("chat_id", config.chatId);
  form.set(
    "voice",
    new Blob([fileBuffer], { type: getTelegramAudioMimeType(resolvedPath) }),
    path.basename(resolvedPath),
  );
  if (trimmedCaption) {
    form.set("caption", trimmedCaption);
  }

  const response = await fetch(`${config.apiBaseUrl}/bot${config.botToken}/sendVoice`, {
    method: "POST",
    body: form,
  });

  const rawBody = await response.text();
  let parsed: TelegramApiResponse<TelegramApiMessage> | undefined;
  if (rawBody.trim().length > 0) {
    try {
      parsed = JSON.parse(rawBody) as TelegramApiResponse<TelegramApiMessage>;
    } catch {
      parsed = undefined;
    }
  }

  if (!response.ok) {
    const detail = parsed?.description?.trim() || `HTTP ${response.status}`;
    throw new Error(`Telegram sendVoice failed (${detail}).`);
  }

  if (parsed?.ok !== true || parsed.result === undefined) {
    throw new Error(parsed?.description?.trim() || "Telegram sendVoice failed.");
  }

  return {
    chatId: config.chatId,
    messageId: typeof parsed.result.message_id === "number" ? parsed.result.message_id : 0,
    audioFilePath: resolvedPath,
    ...(trimmedCaption ? { caption: trimmedCaption } : {}),
  };
}

export class TelegramPollingBridge {
  private stopped = false;
  private loopPromise: Promise<void> | undefined;
  private activeRequestController: AbortController | undefined;
  private readyNotified = false;

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
        if (!this.readyNotified) {
          this.readyNotified = true;
          this.options.onReady?.();
        }

        let highestUpdateId = nextUpdateOffset !== undefined ? nextUpdateOffset - 1 : undefined;
        for (const update of updates) {
          const updateId = typeof update.update_id === "number" ? update.update_id : undefined;
          if (updateId !== undefined) {
            highestUpdateId = highestUpdateId === undefined ? updateId : Math.max(highestUpdateId, updateId);
          }

          const inboundMessage = await toInboundMessage(update, this.options.config.chatId, {
            workspaceRoot: this.options.workspaceRoot,
            config: this.options.config,
            ...(this.options.fetchImpl ? { fetchImpl: this.options.fetchImpl } : {}),
            signal: controller.signal,
          });
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
