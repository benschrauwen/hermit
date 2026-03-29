import process from "node:process";

import { isRecord } from "./type-guards.js";

const MAX_STATUS_TEXT_LENGTH = 96;
const STATUS_PREFIX_LENGTH = 2; // spinner char + space

const ANSI_BOLD = "\x1b[1m";
const ANSI_DIM = "\x1b[90m";
const ANSI_ITALIC = "\x1b[3m";
const ANSI_RESET = "\x1b[0m";
const ANSI_UNDERLINE = "\x1b[4m";
const ANSI_CYAN = "\x1b[36m";
const ANSI_BRIGHT_MAGENTA = "\x1b[95m";

export interface TerminalRenderState {
  inCodeBlock: boolean;
  pendingLine: string;
}

export function getMaxStatusTextLength(): number {
  const columns = typeof process.stdout.columns === "number" ? process.stdout.columns : 80;
  return Math.max(10, Math.min(MAX_STATUS_TEXT_LENGTH, columns - STATUS_PREFIX_LENGTH));
}

export function formatEntryDesignator(activeRoleLabel: string): string {
  return `${ANSI_BOLD}${ANSI_BRIGHT_MAGENTA}- ${activeRoleLabel} >>${ANSI_RESET}`;
}

function formatQueuedEntryDesignator(): string {
  return `${ANSI_BOLD}${ANSI_BRIGHT_MAGENTA}Queued >>${ANSI_RESET}`;
}

function formatPromptEcho(prompt: string, designator: string): string {
  const normalizedPrompt = prompt.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalizedPrompt.split("\n");

  if (lines.length <= 1) {
    return `\n${designator} ${ANSI_BRIGHT_MAGENTA}${normalizedPrompt}${ANSI_RESET}\n\n`;
  }

  const renderedLines = lines.map((line) => `${ANSI_BRIGHT_MAGENTA}${line}${ANSI_RESET}`).join("\n");
  return `\n${designator}\n${renderedLines}\n\n`;
}

export function formatUserPromptEcho(prompt: string, activeRoleLabel: string): string {
  return formatPromptEcho(prompt, formatEntryDesignator(activeRoleLabel));
}

export function formatQueuedPromptEcho(prompt: string): string {
  return formatPromptEcho(prompt, formatQueuedEntryDesignator());
}

export function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function truncateInlineText(value: string, maxLength = MAX_STATUS_TEXT_LENGTH): string {
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

export function normalizeAssistantText(value: string): string {
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

export function renderTerminalMarkdownLine(line: string, state: TerminalRenderState): string {
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
  const messageValue = typeof args.message === "string" ? args.message : undefined;
  const textValue = typeof args.text === "string" ? args.text : undefined;
  const actionValue = typeof args.action === "string" ? args.action : undefined;
  const fileValue = typeof args.file === "string" ? args.file : undefined;
  const targetValue = typeof args.target === "string" ? args.target : undefined;
  const idValue = typeof args.id === "string" ? args.id : undefined;
  const roleValue = typeof args.roleId === "string" ? args.roleId : undefined;

  const inlineValues = [queryValue, promptValue, messageValue, textValue, actionValue, fileValue, targetValue, idValue, roleValue].filter(
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
