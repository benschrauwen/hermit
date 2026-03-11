import process from "node:process";

import type { AgentSession } from "@mariozechner/pi-coding-agent";

import { isRecord } from "./type-guards.js";
import type { TelemetryRecorder } from "./telemetry-recorder.js";

const STATUS_SPINNER_FRAMES = ["|", "/", "-", "\\"] as const;
const STATUS_SPINNER_INTERVAL_MS = 80;
const MAX_STATUS_TEXT_LENGTH = 96;
const ANSI_BOLD = "\x1b[1m";
const ANSI_DIM = "\x1b[90m";
const ANSI_ITALIC = "\x1b[3m";
const ANSI_RESET = "\x1b[0m";
const ANSI_UNDERLINE = "\x1b[4m";
const ANSI_CYAN = "\x1b[36m";
const ANSI_BRIGHT_MAGENTA = "\x1b[95m";

interface TerminalRenderState {
  inCodeBlock: boolean;
  pendingLine: string;
}

export function formatEntryDesignator(activeRoleLabel: string): string {
  return `${ANSI_BOLD}${ANSI_BRIGHT_MAGENTA}- ${activeRoleLabel} >>${ANSI_RESET}`;
}

export function formatUserPromptEcho(prompt: string, activeRoleLabel: string): string {
  return `\n${formatEntryDesignator(activeRoleLabel)} ${ANSI_BRIGHT_MAGENTA}${prompt}${ANSI_RESET}\n\n`;
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

function normalizeAssistantText(value: string): string {
  return stripTerminalControlSequences(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function renderInlineTerminalText(value: string): string {
  let rendered = "";
  let index = 0;

  while (index < value.length) {
    if (value.startsWith("**", index) || value.startsWith("__", index)) {
      const delimiter = value.slice(index, index + 2);
      const closeIndex = value.indexOf(delimiter, index + 2);
      if (closeIndex === -1) {
        rendered += delimiter;
        index += 2;
        continue;
      }

      rendered += `${ANSI_BOLD}${renderInlineTerminalText(value.slice(index + 2, closeIndex))}${ANSI_RESET}`;
      index = closeIndex + 2;
      continue;
    }

    const currentChar = value[index];
    if (currentChar === "`") {
      const closeIndex = value.indexOf("`", index + 1);
      if (closeIndex === -1) {
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
        rendered += currentChar;
        index += 1;
        continue;
      }

      rendered += `${ANSI_ITALIC}${renderInlineTerminalText(value.slice(index + 1, closeIndex))}${ANSI_RESET}`;
      index = closeIndex + 1;
      continue;
    }

    if (currentChar === "[") {
      const closeBracket = value.indexOf("]", index + 1);
      const hasLinkDestination = closeBracket !== -1 && value[closeBracket + 1] === "(";
      const closeParen = hasLinkDestination ? value.indexOf(")", closeBracket + 2) : -1;
      if (closeBracket === -1 || !hasLinkDestination || closeParen === -1) {
        rendered += currentChar;
        index += 1;
        continue;
      }

      rendered += `${ANSI_UNDERLINE}${renderInlineTerminalText(value.slice(index + 1, closeBracket))}${ANSI_RESET}`;
      rendered += ` (${value.slice(closeBracket + 2, closeParen)})`;
      index = closeParen + 1;
      continue;
    }

    rendered += currentChar;
    index += 1;
  }

  return rendered;
}

function renderTerminalMarkdownLine(line: string, state: TerminalRenderState): string {
  if (/^\s*```/.test(line)) {
    const info = line.trim().slice(3).trim();
    if (state.inCodeBlock) {
      state.inCodeBlock = false;
      return `${ANSI_DIM}--- end code ---${ANSI_RESET}`;
    }

    state.inCodeBlock = true;
    return info ? `${ANSI_DIM}--- code: ${info} ---${ANSI_RESET}` : `${ANSI_DIM}--- code ---${ANSI_RESET}`;
  }

  if (state.inCodeBlock) {
    return `  ${line}`;
  }

  if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
    return `${ANSI_DIM}${"─".repeat(Math.max(3, line.trim().length))}${ANSI_RESET}`;
  }

  const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
  if (headingMatch) {
    const level = (headingMatch[1] ?? "").length;
    const content = renderInlineTerminalText(headingMatch[2] ?? "");
    const style = level === 1 ? `${ANSI_BOLD}${ANSI_UNDERLINE}` : ANSI_BOLD;
    return `${style}${content}${ANSI_RESET}`;
  }

  const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
  if (listMatch) {
    const indent = listMatch[1] ?? "";
    const marker = /\d+\./.test(listMatch[2] ?? "") ? (listMatch[2] ?? "-") : "•";
    const content = renderInlineTerminalText(listMatch[3] ?? "");
    return `${indent}${ANSI_CYAN}${marker}${ANSI_RESET} ${content}`;
  }

  const quoteMatch = line.match(/^(\s*)>\s?(.*)$/);
  if (quoteMatch) {
    const indent = quoteMatch[1] ?? "";
    const content = renderInlineTerminalText(quoteMatch[2] ?? "");
    return `${indent}${ANSI_DIM}│${ANSI_RESET} ${content}`;
  }

  return renderInlineTerminalText(line);
}

export function renderTerminalMarkdown(value: string): string {
  const state: TerminalRenderState = { inCodeBlock: false, pendingLine: "" };
  return normalizeAssistantText(value)
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
  const roleValue = typeof args.roleId === "string" ? args.roleId : undefined;

  const inlineValues = [queryValue, promptValue, actionValue, fileValue, targetValue, idValue, roleValue].filter(
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

export function attachConsoleStreaming(session: AgentSession, telemetry?: TelemetryRecorder): () => void {
  let lastToolName: string | undefined;
  let assistantPrintedText = false;
  let cursorAtLineStart = true;
  let statusVisible = false;
  let statusText = "Thinking";
  let spinnerTimer: NodeJS.Timeout | undefined;
  let spinnerFrame = 0;
  const renderState: TerminalRenderState = { inCodeBlock: false, pendingLine: "" };

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

    writeToConsole(`\r\x1b[2K${ANSI_DIM}${frame} ${statusText || "Thinking"}${ANSI_RESET}`);
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

  function resetAssistantRenderState(): void {
    renderState.inCodeBlock = false;
    renderState.pendingLine = "";
  }

  function flushAssistantLines(force = false): void {
    while (true) {
      const newlineIndex = renderState.pendingLine.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const line = renderState.pendingLine.slice(0, newlineIndex);
      renderState.pendingLine = renderState.pendingLine.slice(newlineIndex + 1);
      writeToConsole(`${renderTerminalMarkdownLine(line, renderState)}\n`);
    }

    if (force && renderState.pendingLine) {
      writeToConsole(`${renderTerminalMarkdownLine(renderState.pendingLine, renderState)}\n`);
      renderState.pendingLine = "";
    }
  }

  function writeAssistantDelta(text: string): void {
    renderState.pendingLine += normalizeAssistantText(text);
    flushAssistantLines();
  }

  function finishAssistantOutput(): void {
    flushAssistantLines(true);
  }

  return session.subscribe((event) => {
    telemetry?.handleEvent(event);

    if (event.type === "message_start" && event.message.role === "assistant") {
      resetAssistantRenderState();
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
      flushAssistantLines(true);
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
      const errorMessage =
        "errorMessage" in event.message && typeof event.message.errorMessage === "string"
          ? event.message.errorMessage
          : undefined;

      if (!assistantPrintedText && errorMessage) {
        clearStatus();
        writeToConsole(`Assistant error: ${errorMessage}\n`);
      } else {
        clearStatus(assistantPrintedText || statusVisible);
        if (assistantPrintedText) {
          finishAssistantOutput();
        }
      }

      assistantPrintedText = false;
      lastToolName = undefined;
      resetAssistantRenderState();
      return;
    }

    if (event.type === "message_end" && event.message.role === "user") {
      assistantPrintedText = false;
      lastToolName = undefined;
      resetAssistantRenderState();
    }
  });
}
