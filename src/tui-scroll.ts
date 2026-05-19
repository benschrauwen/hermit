/** Enable SGR mouse reporting (clicks + wheel). Avoid ?1007 so wheel is not remapped to arrows. */
export const MOUSE_TRACKING_ENABLE = "\x1b[?1000h\x1b[?1002h\x1b[?1006h";
export const MOUSE_TRACKING_DISABLE = "\x1b[?1006l\x1b[?1002l\x1b[?1000l";

const MOUSE_WHEEL_UP_BUTTON = 64;
const MOUSE_WHEEL_DOWN_BUTTON = 65;

export interface MouseWheelEvent {
  column: number;
  row: number;
  direction: "up" | "down";
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

export function parseMouseWheelEvent(data: string): MouseWheelEvent | undefined {
  const match = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/.exec(data);
  if (!match) {
    return undefined;
  }

  const button = Number(match[1]);
  const column = Number(match[2]);
  const row = Number(match[3]);
  if (button !== MOUSE_WHEEL_UP_BUTTON && button !== MOUSE_WHEEL_DOWN_BUTTON) {
    return undefined;
  }

  return {
    column,
    row,
    direction: button === MOUSE_WHEEL_UP_BUTTON ? "up" : "down",
  };
}

export function scrollDeltaForWheel(direction: "up" | "down", lineStep = 1): number {
  const step = Math.max(1, lineStep);
  return direction === "up" ? step : -step;
}
