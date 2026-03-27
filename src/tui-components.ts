import {
  Editor,
  truncateToWidth,
  visibleWidth,
  type Component,
  type TUI,
} from "@mariozechner/pi-tui";

import { formatEntryDesignator } from "./session-formatting.js";

export const ANSI_BOLD = "\x1b[1m";
export const ANSI_DIM = "\x1b[90m";
export const ANSI_RESET = "\x1b[0m";
export const ANSI_BRIGHT_MAGENTA = "\x1b[95m";

const STATUS_SPINNER_FRAMES = ["|", "/", "-", "\\"] as const;
const STATUS_SPINNER_INTERVAL_MS = 80;

export function colorize(code: string, text: string): string {
  return `${code}${text}${ANSI_RESET}`;
}

export const editorTheme = {
  borderColor: (text: string) => colorize(ANSI_DIM, text),
  selectList: {
    selectedPrefix: (text: string) => colorize(ANSI_BRIGHT_MAGENTA, text),
    selectedText: (text: string) => colorize(ANSI_BRIGHT_MAGENTA, text),
    description: (text: string) => colorize(ANSI_DIM, text),
    scrollInfo: (text: string) => colorize(ANSI_DIM, text),
    noMatch: (text: string) => colorize(ANSI_DIM, text),
  },
};

export class AnsiTextBuffer implements Component {
  private text = "";
  private cachedText: string | undefined;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  constructor(private readonly renderBlock: (text: string, width: number) => string[]) {}

  appendText(text: string): void {
    if (!text) {
      return;
    }
    this.text += text;
    this.invalidate();
  }

  setText(text: string): void {
    if (this.text === text) {
      return;
    }
    this.text = text;
    this.invalidate();
  }

  invalidate(): void {
    this.cachedText = undefined;
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    if (this.cachedText === this.text && this.cachedWidth === width && this.cachedLines) {
      return this.cachedLines;
    }
    const lines = this.renderBlock(this.text, width);
    this.cachedText = this.text;
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }
}

export class StatusLine implements Component {
  private message: string | undefined;
  private spinnerFrame = 0;
  private spinnerTimer: NodeJS.Timeout | undefined;

  constructor(private readonly onChange: () => void) {}

  setMessage(message: string): void {
    const normalized = message.replace(/\r\n/g, " ").replace(/\r/g, " ").replace(/\s+/g, " ").trim() || "Thinking";
    this.message = normalized;

    if (!this.spinnerTimer) {
      this.spinnerTimer = setInterval(() => {
        this.spinnerFrame += 1;
        this.onChange();
      }, STATUS_SPINNER_INTERVAL_MS);
    }

    this.onChange();
  }

  clear(): void {
    this.message = undefined;
    if (this.spinnerTimer) {
      clearInterval(this.spinnerTimer);
      this.spinnerTimer = undefined;
    }
    this.onChange();
  }

  invalidate(): void {}

  render(width: number): string[] {
    if (!this.message) {
      return [];
    }
    const frame = STATUS_SPINNER_FRAMES[this.spinnerFrame % STATUS_SPINNER_FRAMES.length];
    return [truncateToWidth(colorize(ANSI_DIM, `${frame} ${this.message}`), Math.max(1, width))];
  }
}

export class RoleLabeledEditor extends Editor {
  private roleLabel: string;

  constructor(tui: TUI, theme: typeof editorTheme, roleLabel: string) {
    super(tui, theme, { paddingX: 1, autocompleteMaxVisible: 6 });
    this.roleLabel = roleLabel;
  }

  setRoleLabel(roleLabel: string): void {
    if (this.roleLabel === roleLabel) {
      return;
    }
    this.roleLabel = roleLabel;
    this.tui.requestRender();
  }

  render(width: number): string[] {
    const lines = super.render(width);
    if (lines.length === 0 || lines[0]?.includes("↑")) {
      return lines;
    }
    const label = `${formatEntryDesignator(this.roleLabel)} `;
    const suffixWidth = Math.max(0, width - visibleWidth(label));
    lines[0] = `${label}${this.borderColor("─".repeat(suffixWidth))}`;
    return lines;
  }
}
