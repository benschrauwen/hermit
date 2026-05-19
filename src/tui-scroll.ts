/**
 * SGR mouse reporting for pane-targeted wheel scroll and in-app drag selection.
 * Native terminal selection is unavailable while mouse reporting is active; Hermit
 * implements its own selection and clipboard copy instead.
 */
export const MOUSE_TRACKING_ENABLE = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
export const MOUSE_TRACKING_DISABLE = "\x1b[?1006l\x1b[?1002l\x1b[?1000l";

const MOUSE_WHEEL_UP_BUTTON = 64;
const MOUSE_WHEEL_DOWN_BUTTON = 65;

export interface MouseWheelEvent {
  column: number;
  row: number;
  direction: "up" | "down";
}

export interface SgrMouseButtonEvent {
  action: "press" | "release" | "drag";
  column: number;
  row: number;
}

export function clampScrollFromBottom(
  scrollFromBottom: number,
  totalLines: number,
  viewportHeight: number,
): number {
  const maxScroll = Math.max(0, totalLines - viewportHeight);
  return Math.min(Math.max(0, Math.floor(scrollFromBottom)), maxScroll);
}

export function sliceScrollableLines(
  lines: string[],
  viewportHeight: number,
  scrollFromBottom: number,
): string[] {
  if (viewportHeight <= 0) {
    return [];
  }
  const clamped = clampScrollFromBottom(scrollFromBottom, lines.length, viewportHeight);
  const end = lines.length - clamped;
  const start = Math.max(0, end - viewportHeight);
  return lines.slice(start, end);
}

/** True for any SGR mouse sequence (wheel, click, release). */
export function isSgrMouseEvent(data: string): boolean {
  return /^\x1b\[<\d+;\d+;\d+[Mm]$/.test(data);
}

function parseSgrMouseFields(data: string): { button: number; column: number; row: number; released: boolean } | undefined {
  const match = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/.exec(data);
  if (!match) {
    return undefined;
  }

  return {
    button: Number(match[1]),
    column: Number(match[2]),
    row: Number(match[3]),
    released: match[4] === "m",
  };
}

export function parseMouseWheelEvent(data: string): MouseWheelEvent | undefined {
  const fields = parseSgrMouseFields(data);
  if (!fields) {
    return undefined;
  }

  const { button, column, row } = fields;
  if (button !== MOUSE_WHEEL_UP_BUTTON && button !== MOUSE_WHEEL_DOWN_BUTTON) {
    return undefined;
  }

  return {
    column,
    row,
    direction: button === MOUSE_WHEEL_UP_BUTTON ? "up" : "down",
  };
}

/** Parse left-button press, drag, and release events (requires mouse mode 1002). */
export function parseSgrMouseButtonEvent(data: string): SgrMouseButtonEvent | undefined {
  const fields = parseSgrMouseFields(data);
  if (!fields) {
    return undefined;
  }

  const { button, column, row, released } = fields;
  if (button === MOUSE_WHEEL_UP_BUTTON || button === MOUSE_WHEEL_DOWN_BUTTON) {
    return undefined;
  }

  const buttonNumber = button & 3;
  const motion = (button & 32) !== 0;
  if (buttonNumber !== 0) {
    return undefined;
  }

  if (motion) {
    return { action: "drag", column, row };
  }
  if (released) {
    return { action: "release", column, row };
  }
  return { action: "press", column, row };
}

export function scrollDeltaForWheel(direction: "up" | "down", lineStep = 1): number {
  const step = Math.max(1, lineStep);
  return direction === "up" ? step : -step;
}
