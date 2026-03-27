import { wrapTextWithAnsi } from "@mariozechner/pi-tui";

const ANSI_CONTROL_SEQUENCE_PATTERN = /\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\x1B\\))/y;
const MIN_HEARTBEAT_HEIGHT = 1;
const MIN_CHAT_HEIGHT = 4;

export function resolveWorkspaceStartLayout(totalRows: number): {
  heartbeatHeight: number;
  chatHeight: number;
} {
  const safeTotalRows = Math.max(3, Math.floor(totalRows));
  const dividerHeight = 1;
  const preferredChatHeight =
    safeTotalRows >= MIN_HEARTBEAT_HEIGHT + MIN_CHAT_HEIGHT + dividerHeight
      ? MIN_CHAT_HEIGHT
      : Math.max(1, Math.ceil(safeTotalRows * 0.55));
  const heartbeatCeiling = Math.max(1, safeTotalRows - preferredChatHeight - dividerHeight);
  const heartbeatHeight = Math.max(
    1,
    Math.min(Math.max(1, Math.floor(safeTotalRows * 0.32)), heartbeatCeiling),
  );

  return {
    heartbeatHeight,
    chatHeight: Math.max(1, safeTotalRows - heartbeatHeight - dividerHeight),
  };
}

export function extractExplorerUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s]*/i);
  return match?.[0];
}

function matchAnsiControlSequence(text: string, index: number): string | undefined {
  ANSI_CONTROL_SEQUENCE_PATTERN.lastIndex = index;
  return ANSI_CONTROL_SEQUENCE_PATTERN.exec(text)?.[0];
}

function isEraseLineSequence(sequence: string): boolean {
  return /^\x1b\[(?:0|2)?K$/.test(sequence);
}

function appendWrappedAnsiLine(target: string[], line: string, width: number): void {
  if (line.length === 0) {
    target.push("");
    return;
  }

  target.push(...wrapTextWithAnsi(line, width));
}

export function renderAnsiTextBlock(text: string, width: number): string[] {
  if (!text) {
    return [];
  }

  const safeWidth = Math.max(1, width);
  const rendered: string[] = [];
  let currentLine = "";
  let carriageReturnPending = false;

  for (let index = 0; index < text.length; ) {
    const currentChar = text[index];

    if (currentChar === "\r" && text[index + 1] === "\n") {
      appendWrappedAnsiLine(rendered, currentLine, safeWidth);
      currentLine = "";
      carriageReturnPending = false;
      index += 2;
      continue;
    }

    const ansiSequence = currentChar === "\x1b" ? matchAnsiControlSequence(text, index) : undefined;
    if (ansiSequence) {
      if (isEraseLineSequence(ansiSequence)) {
        currentLine = "";
        carriageReturnPending = false;
      } else {
        if (carriageReturnPending) {
          currentLine = "";
          carriageReturnPending = false;
        }
        currentLine += ansiSequence;
      }
      index += ansiSequence.length;
      continue;
    }

    if (currentChar === "\r") {
      carriageReturnPending = true;
      index += 1;
      continue;
    }

    if (currentChar === "\n") {
      appendWrappedAnsiLine(rendered, currentLine, safeWidth);
      currentLine = "";
      carriageReturnPending = false;
      index += 1;
      continue;
    }

    if (carriageReturnPending) {
      // Heartbeat status redraws use CR-based line replacement.
      currentLine = "";
      carriageReturnPending = false;
    }

    currentLine += currentChar;
    index += 1;
  }

  if (currentLine.length > 0) {
    appendWrappedAnsiLine(rendered, currentLine, safeWidth);
  }

  if (text.endsWith("\n")) {
    rendered.push("");
  }

  return rendered;
}
