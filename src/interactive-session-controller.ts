import type { AgentSession } from "@mariozechner/pi-coding-agent";

import type { WorkspaceTurnCoordinator, WorkspaceTurnOwner } from "./turn-control.js";
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
  turnCoordinator?: WorkspaceTurnCoordinator;
  onRoleSwitch?: (request: RoleSwitchRequest, previousRoleLabel: string) => Promise<InteractiveChatSession>;
  shouldHandleRoleSwitch?: () => boolean;
  attachStreaming: (session: InteractiveChatSession) => InteractiveSessionStreamingHandle;
  onActiveSessionChange?: (session: InteractiveChatSession) => void;
  onRedundantRoleSwitch?: (activeRoleLabel: string) => void;
  onRoleSwitched?: (session: InteractiveChatSession) => void;
  onTurnStateChange?: (state: "idle" | "waiting" | "running") => void;
  onQueuedFollowUpCountChange?: (count: number) => void;
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
  private sessionTrackingStop: (() => void) | undefined;
  private turnState: "idle" | "waiting" | "running" = "idle";
  private queuedFollowUpCount = 0;

  constructor(private readonly options: InteractiveSessionControllerOptions) {
    this.activeSession = options.initialSession;
    this.options.onActiveSessionChange?.(this.activeSession);
    this.streaming = this.options.attachStreaming(this.activeSession);
    this.attachSessionTracking(this.activeSession.session);
  }

  getActiveSession(): InteractiveChatSession {
    return this.activeSession;
  }

  getTurnState(): "idle" | "waiting" | "running" {
    return this.turnState;
  }

  getQueuedFollowUpCount(): number {
    return this.queuedFollowUpCount;
  }

  queueFollowUp(prompt: string): boolean {
    if (this.turnState !== "running") {
      return false;
    }

    this.activeSession.session.followUp(prompt);
    this.setQueuedFollowUpCount(this.queuedFollowUpCount + 1);
    return true;
  }

  async prompt(
    prompt: string,
    imagePaths: string[] = [],
    onWaitForTurn?: (currentOwner?: WorkspaceTurnOwner) => void,
  ): Promise<void> {
    this.setTurnState("waiting");

    try {
      await runInteractiveSessionTurn({
        root: this.options.root,
        roleId: this.activeSession.activeRoleLabel,
        session: this.activeSession.session,
        prompt,
        imagePaths,
        ...(this.options.gitCheckpointsEnabled !== undefined
          ? { gitCheckpointsEnabled: this.options.gitCheckpointsEnabled }
          : {}),
        ...(this.options.turnCoordinator ? { turnCoordinator: this.options.turnCoordinator } : {}),
        ...(onWaitForTurn ? { onWaitForTurn } : {}),
        onTurnStarted: () => {
          this.setTurnState("running");
        },
      });

      await this.applyPendingRoleSwitchIfRequested();
      this.streaming.clearStatus?.();
    } finally {
      this.setTurnState("idle");
      this.setQueuedFollowUpCount(0);
    }
  }

  stop(): void {
    this.sessionTrackingStop?.();
    this.sessionTrackingStop = undefined;
    this.streaming.stop();
  }

  private attachSessionTracking(session: AgentSession): void {
    this.sessionTrackingStop?.();
    this.sessionTrackingStop = session.subscribe((event) => {
      if (event.type === "message_end" && event.message.role === "user" && this.queuedFollowUpCount > 0) {
        this.setQueuedFollowUpCount(this.queuedFollowUpCount - 1);
      }
    });
  }

  private setTurnState(state: "idle" | "waiting" | "running"): void {
    if (this.turnState === state) {
      return;
    }

    this.turnState = state;
    this.options.onTurnStateChange?.(state);
  }

  private setQueuedFollowUpCount(count: number): void {
    const normalized = Math.max(0, count);
    if (this.queuedFollowUpCount === normalized) {
      return;
    }

    this.queuedFollowUpCount = normalized;
    this.options.onQueuedFollowUpCountChange?.(normalized);
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
    this.attachSessionTracking(this.activeSession.session);
    this.options.onActiveSessionChange?.(this.activeSession);
    this.streaming = this.options.attachStreaming(this.activeSession);
    this.options.onRoleSwitched?.(this.activeSession);
  }
}
