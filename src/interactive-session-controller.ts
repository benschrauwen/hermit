import type { WorkspaceTurnOwner } from "./turn-control.js";
import { runInteractiveSessionTurn } from "./turn-control.js";
import type { InteractiveChatSession } from "./session-runtime.js";
import type { RoleSwitchRequest } from "./types.js";

export interface InteractiveSessionStreamingHandle {
  stop(): void;
  clearStatus?(): void;
}

export interface InteractiveSessionControllerOptions {
  root: string;
  initialSession: InteractiveChatSession;
  gitCheckpointsEnabled?: boolean;
  onRoleSwitch?: (request: RoleSwitchRequest, previousRoleLabel: string) => Promise<InteractiveChatSession>;
  shouldHandleRoleSwitch?: () => boolean;
  attachStreaming: (session: InteractiveChatSession) => InteractiveSessionStreamingHandle;
  onActiveSessionChange?: (session: InteractiveChatSession) => void;
  onRedundantRoleSwitch?: (activeRoleLabel: string) => void;
  onRoleSwitched?: (session: InteractiveChatSession) => void;
}

export function normalizeChatInput(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function isExitCommand(input: string): boolean {
  const command = input.trim();
  return command === "/exit" || command === "/quit";
}

export class InteractiveSessionController {
  private activeSession: InteractiveChatSession;
  private streaming: InteractiveSessionStreamingHandle;

  constructor(private readonly options: InteractiveSessionControllerOptions) {
    this.activeSession = options.initialSession;
    this.options.onActiveSessionChange?.(this.activeSession);
    this.streaming = this.options.attachStreaming(this.activeSession);
  }

  getActiveSession(): InteractiveChatSession {
    return this.activeSession;
  }

  async prompt(
    prompt: string,
    imagePaths: string[] = [],
    onWaitForTurn?: (currentOwner?: WorkspaceTurnOwner) => void,
  ): Promise<void> {
    await runInteractiveSessionTurn({
      root: this.options.root,
      roleId: this.activeSession.activeRoleLabel,
      session: this.activeSession.session,
      prompt,
      imagePaths,
      ...(this.options.gitCheckpointsEnabled !== undefined
        ? { gitCheckpointsEnabled: this.options.gitCheckpointsEnabled }
        : {}),
      ...(onWaitForTurn ? { onWaitForTurn } : {}),
    });

    await this.applyPendingRoleSwitchIfRequested();
    this.streaming.clearStatus?.();
  }

  stop(): void {
    this.streaming.stop();
  }

  private async applyPendingRoleSwitchIfRequested(): Promise<void> {
    if (this.options.shouldHandleRoleSwitch && !this.options.shouldHandleRoleSwitch()) {
      return;
    }

    const request = this.activeSession.consumeRoleSwitchRequest();
    if (!request || !this.options.onRoleSwitch) {
      return;
    }

    if (request.roleId === this.activeSession.activeRoleLabel) {
      this.options.onRedundantRoleSwitch?.(this.activeSession.activeRoleLabel);
      return;
    }

    const previousRoleLabel = this.activeSession.activeRoleLabel;
    this.streaming.stop();
    this.activeSession = await this.options.onRoleSwitch(request, previousRoleLabel);
    this.options.onActiveSessionChange?.(this.activeSession);
    this.streaming = this.options.attachStreaming(this.activeSession);
    this.options.onRoleSwitched?.(this.activeSession);
  }
}
