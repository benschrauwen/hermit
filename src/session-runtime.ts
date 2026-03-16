import type { Model } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type AgentSession,
} from "@mariozechner/pi-coding-agent";

import { createCustomTools, createHermitTools } from "./agent-tools.js";
import { DEFAULT_THINKING_LEVEL, HERMIT_ROLE_ID, HERMIT_ROLE_ROOT } from "./constants.js";
import { resolveConfiguredModel } from "./model-auth.js";
import { PromptLibrary } from "./prompt-library.js";
import { resolveHermitSessionDirectory, resolvePersistedSessionDirectory, resolveRoleSkillPaths, resolveSharedSkillPaths } from "./session-paths.js";
import type { RoleSwitchRequest, SessionHistoryType } from "./session-types.js";
import { TelemetryRecorder } from "./telemetry-recorder.js";
import type { PromptContext, RoleDefinition, TelemetrySessionContext, WorkspaceInitializationState } from "./types.js";
import { ensureWorkspaceScaffold, getWorkspaceChatInitializationState, getWorkspaceInitializationState } from "./workspace.js";

interface SessionOptions {
  root: string;
  role: RoleDefinition;
  promptContext: PromptContext;
  persist: boolean;
  continueRecent?: boolean;
  sessionHistoryType?: SessionHistoryType;
  additionalRolePrompts?: string[];
  telemetryCommandName?: string;
  telemetryContext?: Partial<TelemetrySessionContext>;
  onRoleSwitchRequest?: (request: RoleSwitchRequest) => void;
}

const BOOTSTRAP_PROMPTS_DIRECTORY = "bootstrap";

function enrichPromptContextWithCurrentTime(promptContext: PromptContext): PromptContext {
  const now = new Date();
  const currentTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const currentLocalDateTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: currentTimeZone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(now);

  return {
    ...promptContext,
    currentDateTimeIso: now.toISOString(),
    currentLocalDateTime,
    currentTimeZone,
  };
}

interface SessionCoreOptions {
  root: string;
  systemPrompt: string;
  skillPaths: string[];
  sessionsDir: string;
  persist: boolean;
  continueRecent?: boolean | undefined;
  customTools: Array<import("@mariozechner/pi-coding-agent").ToolDefinition<any>>;
  telemetryContext: Omit<TelemetrySessionContext, "modelProvider" | "modelId">;
}

async function createSessionCore(options: SessionCoreOptions): Promise<{
  session: AgentSession;
  telemetry: TelemetryRecorder;
  modelLabel: string;
}> {
  const loader = new DefaultResourceLoader({
    cwd: options.root,
    noExtensions: true,
    additionalSkillPaths: options.skillPaths,
    noPromptTemplates: true,
    noThemes: true,
    appendSystemPromptOverride: (base) => [...base, options.systemPrompt],
  });
  await loader.reload();

  const authStorage = AuthStorage.create();
  const modelRegistry = new ModelRegistry(authStorage);
  const { model } = resolveConfiguredModel(authStorage, modelRegistry);

  const sessionManager = !options.persist
    ? SessionManager.inMemory(options.root)
    : options.continueRecent
      ? SessionManager.continueRecent(options.root, options.sessionsDir)
      : SessionManager.create(options.root, options.sessionsDir);

  const { session } = await createAgentSession({
    cwd: options.root,
    authStorage,
    modelRegistry,
    model,
    thinkingLevel: DEFAULT_THINKING_LEVEL,
    tools: createCodingTools(options.root),
    customTools: options.customTools,
    resourceLoader: loader,
    sessionManager,
  });

  const telemetry = await TelemetryRecorder.create({
    ...options.telemetryContext,
    modelProvider: model.provider,
    modelId: model.id,
  });

  return { session, telemetry, modelLabel: `${model.provider}/${model.id}` };
}

export async function createRoleSession(options: SessionOptions): Promise<{
  session: AgentSession;
  promptLibrary: PromptLibrary;
  workspaceState: WorkspaceInitializationState;
  telemetry: TelemetryRecorder;
  modelLabel: string;
}> {
  await ensureWorkspaceScaffold(options.root, options.role);

  const workspaceState = await getWorkspaceInitializationState(options.root, options.role);
  const promptLibrary = await PromptLibrary.load(options.role);
  const promptContext = enrichPromptContextWithCurrentTime(options.promptContext);
  const systemPrompt = await promptLibrary.renderSystemPrompt(promptContext, options.additionalRolePrompts);

  const { session, telemetry, modelLabel } = await createSessionCore({
    root: options.root,
    systemPrompt,
    skillPaths: resolveRoleSkillPaths(options.role),
    sessionsDir: resolvePersistedSessionDirectory(options.role, options.sessionHistoryType),
    persist: options.persist,
    continueRecent: options.continueRecent,
    customTools: createCustomTools(options.root, options.role, {
      ...(options.onRoleSwitchRequest ? { onRoleSwitchRequest: options.onRoleSwitchRequest } : {}),
    }),
    telemetryContext: {
      workspaceRoot: options.root,
      roleId: options.role.id,
      commandName: options.telemetryCommandName ?? "chat",
      persist: options.persist,
      ...(options.continueRecent !== undefined ? { continueRecent: options.continueRecent } : {}),
      ...options.telemetryContext,
    },
  });

  return { session, promptLibrary, workspaceState, telemetry, modelLabel };
}

export async function createHermitSession(options: {
  root: string;
  promptContext: PromptContext;
  persist: boolean;
  continueRecent?: boolean;
  sessionHistoryType?: SessionHistoryType;
  bootstrapMode?: boolean;
  telemetryCommandName?: string;
  telemetryContext?: Partial<TelemetrySessionContext>;
  onRoleSwitchRequest?: (request: RoleSwitchRequest) => void;
}): Promise<{
  session: AgentSession;
  promptLibrary: PromptLibrary;
  workspaceState: WorkspaceInitializationState;
  telemetry: TelemetryRecorder;
  modelLabel: string;
}> {
  await ensureWorkspaceScaffold(options.root);

  const workspaceState = await getWorkspaceChatInitializationState(options.root);
  const promptLibrary = await PromptLibrary.loadForWorkspace(options.root);
  const promptContext = enrichPromptContextWithCurrentTime({
    roleId: HERMIT_ROLE_ID,
    roleRoot: HERMIT_ROLE_ROOT,
    ...options.promptContext,
  });
  const baseSystemPrompt = await promptLibrary.renderSystemPrompt(promptContext);
  const bootstrapOverlay = options.bootstrapMode
    ? await promptLibrary.renderSharedPromptDirectory(BOOTSTRAP_PROMPTS_DIRECTORY, promptContext)
    : "";
  const systemPrompt = [baseSystemPrompt, bootstrapOverlay].filter(Boolean).join("\n\n");

  const { session, telemetry, modelLabel } = await createSessionCore({
    root: options.root,
    systemPrompt,
    skillPaths: resolveSharedSkillPaths(options.root),
    sessionsDir: resolveHermitSessionDirectory(options.root, options.sessionHistoryType),
    persist: options.persist,
    continueRecent: options.continueRecent,
    customTools: createHermitTools(options.root, {
      ...(options.onRoleSwitchRequest ? { onRoleSwitchRequest: options.onRoleSwitchRequest } : {}),
    }),
    telemetryContext: {
      workspaceRoot: options.root,
      roleId: HERMIT_ROLE_ID,
      commandName: options.telemetryCommandName ?? "chat",
      persist: options.persist,
      ...(options.continueRecent !== undefined ? { continueRecent: options.continueRecent } : {}),
      ...options.telemetryContext,
    },
  });

  return { session, promptLibrary, workspaceState, telemetry, modelLabel };
}
