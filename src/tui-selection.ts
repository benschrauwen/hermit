import { visibleWidth } from "@mariozechner/pi-tui";

const ANSI_CONTROL_SEQUENCE_PATTERN =
  /\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\x1B\\))/g;

export type SelectablePane = "heartbeat" | "transcript";

export interface SelectionPoint {
  pane: SelectablePane;
  /** Visible line index within the pane body (includes padding rows). */
  line: number;
  /** Zero-based visible column. */
  col: number;
}

export interface SelectionRange {
  pane: SelectablePane;
  start: SelectionPoint;
  end: SelectionPoint;
}

export function stripAnsi(text: string): string {
  return text.replace(ANSI_CONTROL_SEQUENCE_PATTERN, "");
}

export function normalizeSelectionRange(anchor: SelectionPoint, active: SelectionPoint): SelectionRange | undefined {
  if (anchor.pane !== active.pane) {
    return undefined;
  }

  const start =
    anchor.line < active.line || (anchor.line === active.line && anchor.col <= active.col) ? anchor : active;
  const end = start === anchor ? active : anchor;

  return { pane: anchor.pane, start, end };
}

export function extractSelectedText(lines: readonly string[], range: SelectionRange): string {
  const parts: string[] = [];

  for (let lineIndex = range.start.line; lineIndex <= range.end.line; lineIndex += 1) {
    const plain = stripAnsi(lines[lineIndex] ?? "");
    const startCol = lineIndex === range.start.line ? range.start.col : 0;
    const endCol = lineIndex === range.end.line ? range.end.col + 1 : plain.length;
    if (startCol < endCol) {
      parts.push(plain.slice(startCol, endCol));
    }
  }

  return parts.join("\n");
}

export function selectionIsEmpty(range: SelectionRange): boolean {
  if (range.start.line === range.end.line) {
    return range.start.col >= range.end.col;
  }
  return false;
}

/** Apply reverse-video highlight on the selected visible columns of one rendered line. */
export function highlightSelectionLine(
  line: string,
  lineIndex: number,
  range: SelectionRange | undefined,
): string {
  if (!range || lineIndex < range.start.line || lineIndex > range.end.line) {
    return line;
  }

  const plain = stripAnsi(line);
  const startCol = lineIndex === range.start.line ? range.start.col : 0;
  const endCol = lineIndex === range.end.line ? range.end.col + 1 : plain.length;
  if (startCol >= endCol || startCol >= plain.length) {
    return line;
  }

  const clampedEnd = Math.min(endCol, plain.length);
  const before = plain.slice(0, startCol);
  const selected = plain.slice(startCol, clampedEnd);
  const after = plain.slice(clampedEnd);
  return `${before}\x1b[7m${selected}\x1b[27m${after}`;
}

/** Clamp a selection column to the visible width of a rendered line. */
export function clampSelectionColumn(line: string, column: number): number {
  const plain = stripAnsi(line);
  const maxCol = Math.max(0, visibleWidth(plain) - 1);
  return Math.min(Math.max(0, Math.floor(column)), maxCol);
}
