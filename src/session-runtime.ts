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
import { DEFAULT_MODEL, DEFAULT_THINKING_LEVEL, HERMIT_ROLE_ID } from "./constants.js";
import { PromptLibrary } from "./prompt-library.js";
import { resolveBootstrapSessionDirectory, resolvePersistedSessionDirectory, resolveRoleSkillPaths, resolveSharedSkillPaths } from "./session-paths.js";
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

function parsePreferredModel(modelName: string): { provider: string; modelId: string } {
  if (modelName.includes("/")) {
    const [provider = "openai", ...rest] = modelName.split("/");
    return { provider, modelId: rest.join("/") };
  }

  return {
    provider: "openai",
    modelId: modelName,
  };
}

function resolvePreferredModel(modelRegistry: ModelRegistry): Model<any> {
  const preferred = parsePreferredModel(DEFAULT_MODEL);
  const available = modelRegistry.getAvailable();
  const preferredModel = available.find((model) => model.provider === preferred.provider && model.id === preferred.modelId);

  if (preferredModel) {
    return preferredModel;
  }

  const fallback = available[0] ?? modelRegistry.find(preferred.provider, preferred.modelId);
  if (!fallback) {
    throw new Error(
      `No configured model is available. Set OPENAI_API_KEY and optionally ROLE_AGENT_MODEL (current preference: ${DEFAULT_MODEL}).`,
    );
  }

  return fallback;
}

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
  const model = resolvePreferredModel(modelRegistry);

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

  return { session, telemetry };
}

export async function createRoleSession(options: SessionOptions): Promise<{
  session: AgentSession;
  promptLibrary: PromptLibrary;
  workspaceState: WorkspaceInitializationState;
  telemetry: TelemetryRecorder;
}> {
  await ensureWorkspaceScaffold(options.root, options.role);

  const workspaceState = await getWorkspaceInitializationState(options.root, options.role);
  const promptLibrary = await PromptLibrary.load(options.role);
  const promptContext = enrichPromptContextWithCurrentTime(options.promptContext);
  const systemPrompt = await promptLibrary.renderSystemPrompt(promptContext, options.additionalRolePrompts);

  const { session, telemetry } = await createSessionCore({
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

  return { session, promptLibrary, workspaceState, telemetry };
}

export async function createHermitSession(options: {
  root: string;
  promptContext: PromptContext;
  persist: boolean;
  continueRecent?: boolean;
  bootstrapMode?: boolean;
  telemetryCommandName?: string;
  telemetryContext?: Partial<TelemetrySessionContext>;
  onRoleSwitchRequest?: (request: RoleSwitchRequest) => void;
}): Promise<{
  session: AgentSession;
  promptLibrary: PromptLibrary;
  workspaceState: WorkspaceInitializationState;
  telemetry: TelemetryRecorder;
}> {
  await ensureWorkspaceScaffold(options.root);

  const workspaceState = await getWorkspaceChatInitializationState(options.root);
  const promptLibrary = await PromptLibrary.loadForWorkspace(options.root);
  const promptContext = enrichPromptContextWithCurrentTime({
    roleId: HERMIT_ROLE_ID,
    roleRoot: ".",
    ...options.promptContext,
  });
  const baseSystemPrompt = await promptLibrary.renderSystemPrompt(promptContext);
  const bootstrapOverlay = options.bootstrapMode
    ? await promptLibrary.renderSharedPromptDirectory(BOOTSTRAP_PROMPTS_DIRECTORY, promptContext)
    : "";
  const systemPrompt = [baseSystemPrompt, bootstrapOverlay].filter(Boolean).join("\n\n");

  const { session, telemetry } = await createSessionCore({
    root: options.root,
    systemPrompt,
    skillPaths: resolveSharedSkillPaths(options.root),
    sessionsDir: resolveBootstrapSessionDirectory(options.root),
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

  return { session, promptLibrary, workspaceState, telemetry };
}
