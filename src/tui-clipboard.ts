import { Key, matchesKey } from "@mariozechner/pi-tui";

const BRACKETED_PASTE_START = "\x1b[200~";
const BRACKETED_PASTE_END = "\x1b[201~";

export function isBracketedPasteInput(data: string): boolean {
  return data.includes(BRACKETED_PASTE_START) || data.includes(BRACKETED_PASTE_END);
}

/** Kitty CSI-u paste chords (Cmd/Ctrl/Shift+V) when the terminal forwards them. */
const KITTY_PASTE_CHORD = /^\x1b\[118;(?:5|9|13|33|37)(?::[123])?u$/;

/** True when the terminal sent an explicit paste shortcut instead of bracketed paste. */
export function isPasteShortcut(data: string): boolean {
  return (
    data === "\x16" ||
    matchesKey(data, Key.ctrl("v")) ||
    matchesKey(data, Key.shift("insert")) ||
    KITTY_PASTE_CHORD.test(data)
  );
}

export function wrapBracketedPaste(text: string): string {
  return `${BRACKETED_PASTE_START}${text}${BRACKETED_PASTE_END}`;
}

export async function readSystemClipboardText(): Promise<string | undefined> {
  try {
    const { getText } = await import("@mariozechner/clipboard");
    const text = await getText();
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

export async function writeSystemClipboardText(text: string): Promise<void> {
  try {
    const { setText } = await import("@mariozechner/clipboard");
    await setText(text);
  } catch {
    // Clipboard native module may be unavailable in some environments.
  }
}
