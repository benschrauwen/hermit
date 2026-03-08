import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

import type { ImageContent, Model } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type AgentSession,
} from "@mariozechner/pi-coding-agent";

import { createCustomTools } from "./agent-tools.js";
import { DEFAULT_MODEL, DEFAULT_THINKING_LEVEL } from "./constants.js";
import { PromptLibrary } from "./prompt-library.js";
import type { PromptContext, RoleDefinition, SessionKind, WorkspaceInitializationState } from "./types.js";
import { ensureWorkspaceScaffold, getWorkspaceInitializationState, getWorkspacePaths } from "./workspace.js";

interface SessionOptions {
  root: string;
  role: RoleDefinition;
  kind: SessionKind;
  promptContext: PromptContext;
  persist: boolean;
  continueRecent?: boolean;
}

export const ONBOARDING_CHAT_OPENING_PROMPT =
  "The workspace is not initialized yet. Start onboarding now. Ask the single highest-value question first and use the deterministic creation tools as information becomes clear.";

export const DEFAULT_CHAT_OPENING_PROMPT =
  "Start the conversation by speaking first. Give a brief, direct opening grounded in the workspace context when helpful, then ask the single most useful question or suggest the most useful next area to inspect. Keep it concise.";

const STATUS_SPINNER_FRAMES = ["|", "/", "-", "\\"] as const;
const STATUS_SPINNER_INTERVAL_MS = 80;
const MAX_STATUS_TEXT_LENGTH = 96;
const ANSI_BOLD = "\x1b[1m";
const ANSI_DIM = "\x1b[90m";
const ANSI_ITALIC = "\x1b[3m";
const ANSI_RESET = "\x1b[0m";
const ANSI_UNDERLINE = "\x1b[4m";
const ANSI_CYAN = "\x1b[36m";

interface TerminalMarkdownState {
  inCodeBlock: boolean;
}

export function resolveInitialChatPrompt(options: {
  initialPrompt?: string;
  continueRecent?: boolean;
  workspaceState: WorkspaceInitializationState;
}): string | undefined {
  if (options.initialPrompt !== undefined) {
    return options.initialPrompt;
  }

  if (!options.workspaceState.initialized) {
    return ONBOARDING_CHAT_OPENING_PROMPT;
  }

  if (options.continueRecent) {
    return undefined;
  }

  return DEFAULT_CHAT_OPENING_PROMPT;
}

function selectPromptBundle(
  role: RoleDefinition,
  kind: SessionKind,
  workspaceState: WorkspaceInitializationState,
): readonly string[] {
  if (kind === "default" && !workspaceState.initialized) {
    return role.promptBundles.onboarding ?? role.promptBundles.default ?? [];
  }

  return role.promptBundles[kind] ?? role.promptBundles.default ?? [];
}

function parsePreferredModel(modelName: string): { provider: string; modelId: string } {
  if (modelName.includes("/")) {
    const [provider = "openai", ...rest] = modelName.split("/");
    return { provider, modelId: rest.join("/") };
  }

  return {
    provider: "openai",
    modelId: modelName,
  };
}

function resolvePreferredModel(modelRegistry: ModelRegistry): Model<any> {
  const preferred = parsePreferredModel(DEFAULT_MODEL);
  const available = modelRegistry.getAvailable();
  const preferredModel = available.find((model) => model.provider === preferred.provider && model.id === preferred.modelId);

  if (preferredModel) {
    return preferredModel;
  }

  const fallback = available[0] ?? modelRegistry.find(preferred.provider, preferred.modelId);
  if (!fallback) {
    throw new Error(
      `No configured model is available. Set OPENAI_API_KEY and optionally ROLE_AGENT_MODEL (current preference: ${DEFAULT_MODEL}).`,
    );
  }

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateInlineText(value: string, maxLength = MAX_STATUS_TEXT_LENGTH): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function stripTerminalControlSequences(value: string): string {
  return value
    .replace(/\x1B\][^\u0007]*(?:\u0007|\x1B\\)/g, "")
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function normalizeAssistantTextDelta(value: string): string {
  return stripTerminalControlSequences(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function renderInlineTerminalText(
  value: string,
  options: { complete: boolean },
): {
  rendered: string;
  rawLength: number;
} {
  let rendered = "";
  let index = 0;

  while (index < value.length) {
    if (value.startsWith("**", index) || value.startsWith("__", index)) {
      const delimiter = value.slice(index, index + 2);
      const closeIndex = value.indexOf(delimiter, index + 2);
      if (closeIndex === -1) {
        if (!options.complete) {
          break;
        }
        rendered += delimiter;
        index += 2;
        continue;
      }

      const content = renderInlineTerminalText(value.slice(index + 2, closeIndex), { complete: true }).rendered;
      rendered += `${ANSI_BOLD}${content}${ANSI_RESET}`;
      index = closeIndex + 2;
      continue;
    }

    const currentChar = value[index];
    if (currentChar === "`") {
      const closeIndex = value.indexOf("`", index + 1);
      if (closeIndex === -1) {
        if (!options.complete) {
          break;
        }
        rendered += currentChar;
        index += 1;
        continue;
      }

      rendered += `${ANSI_CYAN}${value.slice(index + 1, closeIndex)}${ANSI_RESET}`;
      index = closeIndex + 1;
      continue;
    }

    if (currentChar === "*" || currentChar === "_") {
      const closeIndex = value.indexOf(currentChar, index + 1);
      if (closeIndex === -1) {
        if (!options.complete) {
          break;
        }
        rendered += currentChar;
        index += 1;
        continue;
      }

      const content = renderInlineTerminalText(value.slice(index + 1, closeIndex), { complete: true }).rendered;
      rendered += `${ANSI_ITALIC}${content}${ANSI_RESET}`;
      index = closeIndex + 1;
      continue;
    }

    if (currentChar === "[") {
      const closeBracket = value.indexOf("]", index + 1);
      const hasLinkDestination = closeBracket !== -1 && value[closeBracket + 1] === "(";
      const closeParen = hasLinkDestination ? value.indexOf(")", closeBracket + 2) : -1;

      if (closeBracket === -1 || !hasLinkDestination || closeParen === -1) {
        if (!options.complete) {
          break;
        }
        rendered += currentChar;
        index += 1;
        continue;
      }

      const label = renderInlineTerminalText(value.slice(index + 1, closeBracket), { complete: true }).rendered;
      const url = value.slice(closeBracket + 2, closeParen);
      rendered += `${ANSI_UNDERLINE}${label}${ANSI_RESET}`;
      if (url) {
        rendered += ` (${url})`;
      }
      index = closeParen + 1;
      continue;
    }

    rendered += currentChar;
    index += 1;
  }

  return {
    rendered,
    rawLength: index,
  };
}

function shouldDelayPartialLineRendering(line: string, state: TerminalMarkdownState): boolean {
  if (state.inCodeBlock) {
    return true;
  }

  return (
    /^\s*```/.test(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^\s*(?:[-*+]|\d+\.)\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
  );
}

function renderTerminalMarkdownLine(line: string, state: TerminalMarkdownState): string {
  if (/^\s*```/.test(line)) {
    const info = line.trim().slice(3).trim();
    if (state.inCodeBlock) {
      state.inCodeBlock = false;
      return `${ANSI_DIM}--- end code ---${ANSI_RESET}`;
    }

    state.inCodeBlock = true;
    return info
      ? `${ANSI_DIM}--- code: ${info} ---${ANSI_RESET}`
      : `${ANSI_DIM}--- code ---${ANSI_RESET}`;
  }

  if (state.inCodeBlock) {
    return `  ${line}`;
  }

  if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
    return `${ANSI_DIM}${"─".repeat(Math.max(3, line.trim().length))}${ANSI_RESET}`;
  }

  const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
  if (headingMatch) {
    const headingMarkers = headingMatch[1] ?? "";
    const headingContent = headingMatch[2] ?? "";
    const level = headingMarkers.length;
    const content = renderInlineTerminalText(headingContent, { complete: true }).rendered;
    const style = level === 1 ? `${ANSI_BOLD}${ANSI_UNDERLINE}` : ANSI_BOLD;
    return `${style}${content}${ANSI_RESET}`;
  }

  const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
  if (listMatch) {
    const indent = listMatch[1] ?? "";
    const rawMarker = listMatch[2] ?? "-";
    const listContent = listMatch[3] ?? "";
    const marker = /\d+\./.test(rawMarker) ? rawMarker : "•";
    const content = renderInlineTerminalText(listContent, { complete: true }).rendered;
    return `${indent}${ANSI_CYAN}${marker}${ANSI_RESET} ${content}`;
  }

  const quoteMatch = line.match(/^(\s*)>\s?(.*)$/);
  if (quoteMatch) {
    const indent = quoteMatch[1] ?? "";
    const quoteContent = quoteMatch[2] ?? "";
    const content = renderInlineTerminalText(quoteContent, { complete: true }).rendered;
    return `${indent}${ANSI_DIM}│${ANSI_RESET} ${content}`;
  }

  return renderInlineTerminalText(line, { complete: true }).rendered;
}

export function renderTerminalMarkdown(value: string): string {
  const normalized = normalizeAssistantTextDelta(value);
  const state: TerminalMarkdownState = { inCodeBlock: false };
  return normalized
    .split("\n")
    .map((line) => renderTerminalMarkdownLine(line, state))
    .join("\n");
}

function asInlinePreview(value: unknown, maxLength = MAX_STATUS_TEXT_LENGTH): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return truncateInlineText(normalizeInlineText(text || ""), maxLength);
}

function formatReadRange(args: Record<string, unknown>): string {
  const offset = typeof args.offset === "number" ? args.offset : undefined;
  const limit = typeof args.limit === "number" ? args.limit : undefined;

  if (offset === undefined && limit === undefined) {
    return "";
  }

  if (offset !== undefined && limit !== undefined) {
    return `:${offset}-${offset + Math.max(limit, 1) - 1}`;
  }

  if (offset !== undefined) {
    return `:${offset}`;
  }

  return ` (+${limit} lines)`;
}

function formatObjectToolStatus(toolName: string, args: Record<string, unknown>): string {
  const pathValue = typeof args.path === "string" ? args.path : undefined;
  const queryValue = typeof args.query === "string" ? args.query : undefined;
  const promptValue = typeof args.prompt === "string" ? args.prompt : undefined;
  const actionValue = typeof args.action === "string" ? args.action : undefined;
  const fileValue = typeof args.file === "string" ? args.file : undefined;
  const targetValue = typeof args.target === "string" ? args.target : undefined;
  const idValue = typeof args.id === "string" ? args.id : undefined;

  const inlineValues = [queryValue, promptValue, actionValue, fileValue, targetValue, idValue].filter(
    (value): value is string => value !== undefined && value.length > 0,
  );

  if (pathValue) {
    return truncateInlineText(`${toolName} ${pathValue}`);
  }

  if (inlineValues.length > 0) {
    return truncateInlineText(`${toolName} ${inlineValues[0]}`);
  }

  const preview = asInlinePreview(args, 64);
  return preview ? truncateInlineText(`${toolName} ${preview}`) : toolName;
}

export function formatActivityStatus(toolName: string | undefined, args?: unknown): string {
  if (!toolName) {
    return "Thinking";
  }

  if (!isRecord(args)) {
    return toolName;
  }

  switch (toolName) {
    case "bash": {
      const command = typeof args.command === "string" ? args.command : undefined;
      return truncateInlineText(command ? `bash ${command}` : "bash");
    }
    case "read": {
      const filePath = typeof args.path === "string" ? args.path : undefined;
      return truncateInlineText(filePath ? `read ${filePath}${formatReadRange(args)}` : "read");
    }
    case "write": {
      const filePath = typeof args.path === "string" ? args.path : undefined;
      return truncateInlineText(filePath ? `write ${filePath}` : "write");
    }
    case "edit": {
      const filePath = typeof args.path === "string" ? args.path : undefined;
      return truncateInlineText(filePath ? `edit ${filePath}` : "edit");
    }
    case "grep": {
      const pattern = typeof args.pattern === "string" ? args.pattern : undefined;
      const searchPath = typeof args.path === "string" ? args.path : undefined;
      const suffix = searchPath ? ` in ${searchPath}` : "";
      return truncateInlineText(pattern ? `grep ${JSON.stringify(pattern)}${suffix}` : `grep${suffix}`);
    }
    case "find": {
      const pattern = typeof args.pattern === "string" ? args.pattern : undefined;
      const searchPath = typeof args.path === "string" ? args.path : undefined;
      const suffix = searchPath ? ` in ${searchPath}` : "";
      return truncateInlineText(pattern ? `find ${pattern}${suffix}` : `find${suffix}`);
    }
    case "ls": {
      const searchPath = typeof args.path === "string" ? args.path : undefined;
      return truncateInlineText(searchPath ? `ls ${searchPath}` : "ls");
    }
    default:
      return formatObjectToolStatus(toolName, args);
  }
}

function getSessionManager(root: string, role: RoleDefinition, persist: boolean, continueRecent = false): SessionManager {
  const { sessionsDir } = getWorkspacePaths(root, role);
  if (!persist) {
    return SessionManager.inMemory(root);
  }

  return continueRecent ? SessionManager.continueRecent(root, sessionsDir) : SessionManager.create(root, sessionsDir);
}

function enrichPromptContextWithCurrentTime(promptContext: PromptContext): PromptContext {
  const now = new Date();
  const currentTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const currentLocalDateTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: currentTimeZone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);

  return {
    ...promptContext,
    currentDateTimeIso: now.toISOString(),
    currentLocalDateTime,
    currentTimeZone,
  };
}

export async function createRoleSession(options: SessionOptions): Promise<{
  session: AgentSession;
  promptLibrary: PromptLibrary;
  workspaceState: WorkspaceInitializationState;
}> {
  await ensureWorkspaceScaffold(options.root, options.role);

  const workspaceState = await getWorkspaceInitializationState(options.root, options.role);
  const promptLibrary = await PromptLibrary.load(options.role);
  const promptContext = enrichPromptContextWithCurrentTime(options.promptContext);
  const bundle = promptLibrary.renderBundle(selectPromptBundle(options.role, options.kind, workspaceState), promptContext);

  const loader = new DefaultResourceLoader({
    cwd: options.root,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    appendSystemPromptOverride: (base) => [...base, bundle],
  });
  await loader.reload();

  const authStorage = AuthStorage.create();
  const modelRegistry = new ModelRegistry(authStorage);

  const { session } = await createAgentSession({
    cwd: options.root,
    authStorage,
    modelRegistry,
    model: resolvePreferredModel(modelRegistry),
    thinkingLevel: DEFAULT_THINKING_LEVEL as "minimal" | "low" | "medium" | "high" | "xhigh",
    tools: createCodingTools(options.root),
    customTools: createCustomTools(options.root, options.role),
    resourceLoader: loader,
    sessionManager: getSessionManager(options.root, options.role, options.persist, options.continueRecent),
  });

  return { session, promptLibrary, workspaceState };
}

function attachConsoleStreaming(session: AgentSession): () => void {
  let lastToolName: string | undefined;
  let assistantPrintedText = false;
  let assistantTextBuffer = "";
  let cursorAtLineStart = true;
  let markdownState: TerminalMarkdownState = { inCodeBlock: false };
  let statusVisible = false;
  let statusText = "Thinking";
  let spinnerTimer: NodeJS.Timeout | undefined;
  let spinnerFrame = 0;

  function writeToConsole(text: string): void {
    if (!text) {
      return;
    }

    process.stdout.write(text);
    cursorAtLineStart = text.endsWith("\n");
  }

  function stopSpinner(): void {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = undefined;
    }
  }

  function renderStatus(): void {
    const frame = STATUS_SPINNER_FRAMES[spinnerFrame % STATUS_SPINNER_FRAMES.length];
    spinnerFrame += 1;

    if (!statusVisible && !cursorAtLineStart) {
      writeToConsole("\n");
    }

    writeToConsole(`\r\x1b[2K${frame} ${statusText || "Thinking"}`);
    statusVisible = true;
    cursorAtLineStart = false;
  }

  function showStatus(nextStatus = "Thinking"): void {
    statusText = truncateInlineText(normalizeInlineText(nextStatus || "Thinking")) || "Thinking";
    renderStatus();

    if (!spinnerTimer) {
      spinnerTimer = setInterval(renderStatus, STATUS_SPINNER_INTERVAL_MS);
    }
  }

  function clearStatus(writeNewline = false): void {
    stopSpinner();

    if (!statusVisible) {
      if (writeNewline && !cursorAtLineStart) {
        writeToConsole("\n");
      }
      return;
    }

    writeToConsole("\r\x1b[2K");
    statusVisible = false;
    cursorAtLineStart = true;

    if (writeNewline) {
      writeToConsole("\n");
    }
  }

  function printToolTombstone(text: string): void {
    clearStatus();

    if (!cursorAtLineStart) {
      writeToConsole("\n");
    }

    writeToConsole(`${ANSI_DIM}${text}${ANSI_RESET}\n`);
  }

  function resetAssistantFormattingState(): void {
    assistantTextBuffer = "";
    markdownState = { inCodeBlock: false };
  }

  function flushCompletedAssistantLines(): void {
    while (true) {
      const newlineIndex = assistantTextBuffer.indexOf("\n");
      if (newlineIndex === -1) {
        return;
      }

      const line = assistantTextBuffer.slice(0, newlineIndex);
      assistantTextBuffer = assistantTextBuffer.slice(newlineIndex + 1);
      writeToConsole(`${renderTerminalMarkdownLine(line, markdownState)}\n`);
    }
  }

  function flushAssistantInlinePreview(): void {
    if (!assistantTextBuffer || shouldDelayPartialLineRendering(assistantTextBuffer, markdownState)) {
      return;
    }

    const rendered = renderInlineTerminalText(assistantTextBuffer, { complete: false });
    if (rendered.rawLength === 0) {
      return;
    }

    assistantTextBuffer = assistantTextBuffer.slice(rendered.rawLength);
    writeToConsole(rendered.rendered);
  }

  function writeAssistantDelta(text: string): void {
    assistantTextBuffer += normalizeAssistantTextDelta(text);
    flushCompletedAssistantLines();
    flushAssistantInlinePreview();
  }

  function flushAssistantBuffer(force = false): void {
    flushCompletedAssistantLines();

    if (force && assistantTextBuffer) {
      writeToConsole(renderTerminalMarkdownLine(assistantTextBuffer, markdownState));
      assistantTextBuffer = "";
    }
  }

  return session.subscribe((event) => {
    if (event.type === "message_start" && event.message.role === "assistant") {
      resetAssistantFormattingState();
      showStatus("Thinking");
      return;
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_start") {
      showStatus("Thinking");
      return;
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "thinking_delta") {
      if (!statusVisible) {
        showStatus("Thinking");
      }
      return;
    }

    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      assistantPrintedText = true;
      clearStatus();
      writeAssistantDelta(event.assistantMessageEvent.delta);
      return;
    }

    if (event.type === "tool_execution_start") {
      flushAssistantBuffer(true);
      lastToolName = event.toolName;
      const toolStatus = formatActivityStatus(event.toolName, event.args);
      printToolTombstone(toolStatus);
      showStatus(toolStatus);
      return;
    }

    if (event.type === "tool_execution_end" && lastToolName === event.toolName) {
      lastToolName = undefined;
      showStatus("Thinking");
      return;
    }

    if (event.type === "message_end" && event.message.role === "assistant") {
      flushAssistantBuffer(true);
      const errorMessage =
        "errorMessage" in event.message && typeof event.message.errorMessage === "string"
          ? event.message.errorMessage
          : undefined;

      if (!assistantPrintedText && errorMessage) {
        clearStatus();
        writeToConsole(`Assistant error: ${errorMessage}\n`);
      } else {
        clearStatus(assistantPrintedText || statusVisible);
      }

      assistantPrintedText = false;
      lastToolName = undefined;
      resetAssistantFormattingState();
      return;
    }

    if (event.type === "message_end" && event.message.role === "user") {
      assistantPrintedText = false;
      lastToolName = undefined;
      resetAssistantFormattingState();
      return;
    }
  });
}

function extensionToMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      throw new Error(`Unsupported image type: ${filePath}`);
  }
}

export async function loadImageAttachments(imagePaths: string[]): Promise<ImageContent[]> {
  return Promise.all(
    imagePaths.map(async (imagePath) => {
      const content = await fs.readFile(imagePath);
      return {
        type: "image",
        data: content.toString("base64"),
        mimeType: extensionToMimeType(imagePath),
      };
    }),
  );
}

export async function runOneShotPrompt(session: AgentSession, prompt: string, imagePaths: string[] = []): Promise<void> {
  const stopStreaming = attachConsoleStreaming(session);

  try {
    await session.prompt(prompt, {
      images: await loadImageAttachments(imagePaths),
    });
  } finally {
    stopStreaming();
  }
}

export async function runChatLoop(
  session: AgentSession,
  options: {
    initialPrompt?: string;
    initialImages?: string[];
  } = {},
): Promise<void> {
  const stopStreaming = attachConsoleStreaming(session);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    if (options.initialPrompt) {
      await session.prompt(options.initialPrompt, {
        images: await loadImageAttachments(options.initialImages ?? []),
      });
    }

    while (true) {
      const input = (await rl.question("> ")).trim();
      if (!input) {
        continue;
      }

      if (input === "/exit" || input === "/quit") {
        break;
      }

      await session.prompt(input);
    }
  } finally {
    stopStreaming();
    rl.close();
  }
}
