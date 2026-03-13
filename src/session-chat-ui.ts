import process from "node:process";

import type { AgentSession } from "@mariozechner/pi-coding-agent";
import {
  CombinedAutocompleteProvider,
  Editor,
  Key,
  ProcessTerminal,
  TUI,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
} from "@mariozechner/pi-tui";

import { createSessionStreamHandler, formatEntryDesignator, formatUserPromptEcho, type SessionOutputSink } from "./session-terminal.js";
import type { TelemetryRecorder } from "./telemetry-recorder.js";

const ANSI_DIM = "\x1b[90m";
const ANSI_RESET = "\x1b[0m";
const ANSI_BRIGHT_MAGENTA = "\x1b[95m";

const STATUS_SPINNER_FRAMES = ["|", "/", "-", "\\"] as const;
const STATUS_SPINNER_INTERVAL_MS = 80;

function colorize(code: string, text: string): string {
  return `${code}${text}${ANSI_RESET}`;
}

function renderAnsiTextBlock(text: string, width: number): string[] {
  if (!text) {
    return [];
  }

  const safeWidth = Math.max(1, width);
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rendered: string[] = [];

  for (const line of normalizedText.split("\n")) {
    if (line.length === 0) {
      rendered.push("");
      continue;
    }

    rendered.push(...wrapTextWithAnsi(line, safeWidth));
  }

  return rendered;
}

class AnsiTextBuffer implements Component {
  private text = "";
  private cachedText: string | undefined;
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

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

    const lines = renderAnsiTextBlock(this.text, width);
    this.cachedText = this.text;
    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }
}

class StatusLine implements Component {
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

class RoleLabeledEditor extends Editor {
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

const editorTheme = {
  borderColor: (text: string) => colorize(ANSI_DIM, text),
  selectList: {
    selectedPrefix: (text: string) => colorize(ANSI_BRIGHT_MAGENTA, text),
    selectedText: (text: string) => colorize(ANSI_BRIGHT_MAGENTA, text),
    description: (text: string) => colorize(ANSI_DIM, text),
    scrollInfo: (text: string) => colorize(ANSI_DIM, text),
    noMatch: (text: string) => colorize(ANSI_DIM, text),
  },
};

export class ChatTui implements SessionOutputSink {
  private readonly terminal = new ProcessTerminal();
  private readonly tui = new TUI(this.terminal);
  private readonly transcript = new AnsiTextBuffer();
  private readonly status = new StatusLine(() => this.tui.requestRender());
  private readonly editor: RoleLabeledEditor;
  private readonly removeInputListener: () => void;

  private activeRoleLabel: string;
  private pendingSubmit:
    | {
        resolve: (value: string) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  private exitRequested = false;
  private interruptHandler: (() => Promise<void> | void) | undefined;
  private interruptInFlight = false;

  constructor(activeRoleLabel: string) {
    this.activeRoleLabel = activeRoleLabel;
    this.editor = new RoleLabeledEditor(this.tui, editorTheme, activeRoleLabel);

    this.tui.addChild(this.transcript);
    this.tui.addChild(this.status);
    this.tui.addChild(this.editor);
    this.tui.setFocus(this.editor);

    this.editor.disableSubmit = true;
    this.editor.setAutocompleteProvider(
      new CombinedAutocompleteProvider(
        [
          { name: "exit", description: "Exit the current chat session." },
          { name: "quit", description: "Exit the current chat session." },
        ],
        process.cwd(),
      ),
    );
    this.editor.onSubmit = (submittedValue) => {
      if (!this.pendingSubmit) {
        return;
      }

      if (submittedValue.trim().length > 0) {
        this.editor.addToHistory(submittedValue);
      }
      this.editor.disableSubmit = true;

      const pendingSubmit = this.pendingSubmit;
      this.pendingSubmit = undefined;
      pendingSubmit.resolve(submittedValue);
    };

    this.removeInputListener = this.tui.addInputListener((data) => {
      if (matchesKey(data, Key.ctrl("c"))) {
        if (this.pendingSubmit) {
          this.requestExit();
        } else {
          this.requestInterrupt();
        }
        return { consume: true };
      }

      if (matchesKey(data, Key.ctrl("d")) && this.editor.getExpandedText().length === 0) {
        this.requestExit();
        return { consume: true };
      }

      return undefined;
    });

    this.terminal.setTitle(`Hermit chat: ${activeRoleLabel}`);
    this.tui.start();
  }

  setActiveRoleLabel(activeRoleLabel: string): void {
    this.activeRoleLabel = activeRoleLabel;
    this.editor.setRoleLabel(activeRoleLabel);
    this.terminal.setTitle(`Hermit chat: ${activeRoleLabel}`);
  }

  setInterruptHandler(handler: (() => Promise<void> | void) | undefined): void {
    this.interruptHandler = handler;
  }

  async readInput(): Promise<string> {
    if (this.pendingSubmit) {
      throw new Error("A chat submission is already pending.");
    }

    this.editor.disableSubmit = false;
    this.tui.setFocus(this.editor);
    this.tui.requestRender();

    return new Promise<string>((resolve, reject) => {
      this.pendingSubmit = { resolve, reject };
    });
  }

  consumeExitRequest(): boolean {
    const requested = this.exitRequested;
    this.exitRequested = false;
    return requested;
  }

  appendUserPrompt(prompt: string): void {
    this.appendText(formatUserPromptEcho(prompt, this.activeRoleLabel));
  }

  appendSystemNotice(text: string): void {
    this.appendText(`${colorize(ANSI_DIM, text)}\n`);
  }

  appendText(text: string): void {
    this.transcript.appendText(text);
    this.tui.requestRender();
  }

  appendToolStatus(text: string): void {
    this.transcript.appendText(`${colorize(ANSI_DIM, text)}\n`);
    this.tui.requestRender();
  }

  showStatus(text: string): void {
    this.status.setMessage(text);
  }

  clearStatus(): void {
    this.status.clear();
  }

  async close(): Promise<void> {
    this.removeInputListener();
    this.status.clear();
    this.editor.disableSubmit = true;

    if (this.pendingSubmit) {
      this.pendingSubmit.reject(new Error("Chat UI closed before input submission."));
      this.pendingSubmit = undefined;
    }

    await this.terminal.drainInput().catch(() => undefined);
    this.tui.stop();
  }

  private requestExit(): void {
    if (this.pendingSubmit) {
      const pendingSubmit = this.pendingSubmit;
      this.pendingSubmit = undefined;
      this.editor.setText("");
      this.editor.disableSubmit = true;
      pendingSubmit.resolve("/exit");
      return;
    }

    if (this.exitRequested) {
      return;
    }

    this.exitRequested = true;
    this.appendSystemNotice("Exit requested. Closing after the current turn finishes.");
  }

  private requestInterrupt(): void {
    if (!this.interruptHandler) {
      this.requestExit();
      return;
    }

    if (this.interruptInFlight) {
      return;
    }

    this.interruptInFlight = true;
    this.appendSystemNotice("Interrupting current turn...");

    void Promise.resolve(this.interruptHandler()).finally(() => {
      this.interruptInFlight = false;
    });
  }
}

export function attachChatTuiStreaming(session: AgentSession, tui: ChatTui, telemetry?: TelemetryRecorder): () => void {
  return session.subscribe(createSessionStreamHandler(tui, telemetry));
}
