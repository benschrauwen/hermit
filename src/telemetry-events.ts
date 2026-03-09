import type { TelemetrySessionContext } from "./types.js";

export interface TelemetryEventCommon {
  timestamp: string;
  sessionId: string;
  roleId?: string | undefined;
  commandName: string;
  model: string;
}

interface TelemetryBaseEvent extends TelemetryEventCommon {
  eventType: string;
}

interface SessionStartTelemetryEvent extends TelemetryBaseEvent {
  eventType: "session_start";
  persist: boolean;
  continueRecent: boolean;
  workspaceRoot: string;
}

export interface SessionEndTelemetryEvent extends TelemetryBaseEvent {
  eventType: "session_end";
  durationMs: number;
  turnCount: number;
  toolCallCount: number;
  toolErrorCount: number;
  assistantErrorTurnCount: number;
  silentTurnCount: number;
  retryCount: number;
  compactionCount: number;
}

interface TurnStartTelemetryEvent extends TelemetryBaseEvent {
  eventType: "turn_start";
  turnId: string;
}

interface FirstTokenTelemetryEvent extends TelemetryBaseEvent {
  eventType: "first_token";
  turnId: string;
  latencyMs: number;
}

interface ToolStartTelemetryEvent extends TelemetryBaseEvent {
  eventType: "tool_start";
  turnId?: string | undefined;
  toolCallId: string;
  toolName: string;
}

export interface ToolEndTelemetryEvent extends TelemetryBaseEvent {
  eventType: "tool_end";
  turnId?: string | undefined;
  toolCallId: string;
  toolName: string;
  durationMs?: number | undefined;
  isError: boolean;
  errorMessage?: string | undefined;
}

interface AssistantMessageEndTelemetryEvent extends TelemetryBaseEvent {
  eventType: "assistant_message_end";
  turnId?: string | undefined;
  hasText: boolean;
  textChars: number;
  errorMessage?: string | undefined;
}

export interface RetryTelemetryEvent extends TelemetryBaseEvent {
  eventType: "retry_start" | "retry_end";
  turnId?: string | undefined;
  attempt: number;
  maxAttempts?: number | undefined;
  delayMs?: number | undefined;
  success?: boolean | undefined;
  errorMessage?: string | undefined;
  finalError?: string | undefined;
}

export interface CompactionTelemetryEvent extends TelemetryBaseEvent {
  eventType: "compaction_start" | "compaction_end";
  turnId?: string | undefined;
  reason?: string | undefined;
  aborted?: boolean | undefined;
  willRetry?: boolean | undefined;
  errorMessage?: string | undefined;
}

export interface TurnEndTelemetryEvent extends TelemetryBaseEvent {
  eventType: "turn_end";
  turnId: string;
  durationMs: number;
  timeToFirstTokenMs?: number | undefined;
  toolCallCount: number;
  toolErrorCount: number;
  assistantTextChars: number;
  assistantError: boolean;
  hadAssistantText: boolean;
  retryCount: number;
  compactionCount: number;
}

export type StoredTelemetryEvent =
  | SessionStartTelemetryEvent
  | SessionEndTelemetryEvent
  | TurnStartTelemetryEvent
  | FirstTokenTelemetryEvent
  | ToolStartTelemetryEvent
  | ToolEndTelemetryEvent
  | AssistantMessageEndTelemetryEvent
  | RetryTelemetryEvent
  | CompactionTelemetryEvent
  | TurnEndTelemetryEvent;

export function formatModelName(context: TelemetrySessionContext): string {
  return `${context.modelProvider}/${context.modelId}`;
}

export function createTelemetryEventCommon(
  context: TelemetrySessionContext,
  sessionId: string,
  timestamp: string,
): TelemetryEventCommon {
  return {
    timestamp,
    sessionId,
    roleId: context.roleId,
    commandName: context.commandName,
    model: formatModelName(context),
  };
}
