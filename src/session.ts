import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";

import type { ImageContent, Model } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  createAgentSession,
  createCodingTools,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  type AgentSession,
} from "@mariozechner/pi-coding-agent";

import { createCustomTools } from "./agent-tools.js";
import { DEFAULT_MODEL, DEFAULT_THINKING_LEVEL, ONBOARDING_PROMPT_BUNDLE, PROMPT_BUNDLES } from "./constants.js";
import { PromptLibrary } from "./prompt-library.js";
import type { PromptContext, SessionKind, WorkspaceInitializationState } from "./types.js";
import { ensureWorkspaceScaffold, getWorkspaceInitializationState, getWorkspacePaths } from "./workspace.js";

interface SessionOptions {
  root: string;
  kind: SessionKind;
  promptContext: PromptContext;
  persist: boolean;
  continueRecent?: boolean;
}

function selectPromptBundle(kind: SessionKind, workspaceState: WorkspaceInitializationState): readonly string[] {
  if (kind === "default" && !workspaceState.initialized) {
    return ONBOARDING_PROMPT_BUNDLE;
  }

  return PROMPT_BUNDLES[kind];
}

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
      `No configured model is available. Set OPENAI_API_KEY and optionally SALES_AGENT_MODEL (current preference: ${DEFAULT_MODEL}).`,
    );
  }

  return fallback;
}

function getSessionManager(root: string, persist: boolean, continueRecent = false): SessionManager {
  const { sessionsDir } = getWorkspacePaths(root);
  if (!persist) {
    return SessionManager.inMemory(root);
  }

  return continueRecent ? SessionManager.continueRecent(root, sessionsDir) : SessionManager.create(root, sessionsDir);
}

export async function createSalesLeaderSession(options: SessionOptions): Promise<{
  session: AgentSession;
  promptLibrary: PromptLibrary;
  workspaceState: WorkspaceInitializationState;
}> {
  await ensureWorkspaceScaffold(options.root);

  const workspaceState = await getWorkspaceInitializationState(options.root);
  const promptLibrary = await PromptLibrary.load(options.root);
  const bundle = promptLibrary.renderBundle(selectPromptBundle(options.kind, workspaceState), options.promptContext);

  const loader = new DefaultResourceLoader({
    cwd: options.root,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    appendSystemPromptOverride: (base) => [...base, bundle],
  });
  await loader.reload();

  const authStorage = AuthStorage.create();
  const modelRegistry = new ModelRegistry(authStorage);

  const { session } = await createAgentSession({
    cwd: options.root,
    authStorage,
    modelRegistry,
    model: resolvePreferredModel(modelRegistry),
    thinkingLevel: DEFAULT_THINKING_LEVEL as "minimal" | "low" | "medium" | "high" | "xhigh",
    tools: createCodingTools(options.root),
    customTools: createCustomTools(options.root),
    resourceLoader: loader,
    sessionManager: getSessionManager(options.root, options.persist, options.continueRecent),
  });

  return { session, promptLibrary, workspaceState };
}

function attachConsoleStreaming(session: AgentSession): () => void {
  let lastToolName: string | undefined;

  return session.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
      return;
    }

    if (event.type === "tool_execution_start") {
      lastToolName = event.toolName;
      process.stdout.write(`\n[tool:${event.toolName}] `);
      return;
    }

    if (event.type === "tool_execution_end" && lastToolName === event.toolName) {
      process.stdout.write("\n");
      lastToolName = undefined;
      return;
    }

    if (event.type === "message_end" && event.message.role === "assistant") {
      process.stdout.write("\n");
    }
  });
}

function extensionToMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      throw new Error(`Unsupported image type: ${filePath}`);
  }
}

export async function loadImageAttachments(imagePaths: string[]): Promise<ImageContent[]> {
  return Promise.all(
    imagePaths.map(async (imagePath) => {
      const content = await fs.readFile(imagePath);
      return {
        type: "image",
        data: content.toString("base64"),
        mimeType: extensionToMimeType(imagePath),
      };
    }),
  );
}

export async function runOneShotPrompt(session: AgentSession, prompt: string, imagePaths: string[] = []): Promise<void> {
  const stopStreaming = attachConsoleStreaming(session);

  try {
    await session.prompt(prompt, {
      images: await loadImageAttachments(imagePaths),
    });
  } finally {
    stopStreaming();
  }
}

export async function runChatLoop(
  session: AgentSession,
  options: {
    initialPrompt?: string;
    initialImages?: string[];
  } = {},
): Promise<void> {
  const stopStreaming = attachConsoleStreaming(session);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    if (options.initialPrompt) {
      await session.prompt(options.initialPrompt, {
        images: await loadImageAttachments(options.initialImages ?? []),
      });
    }

    while (true) {
      const input = (await rl.question("> ")).trim();
      if (!input) {
        continue;
      }

      if (input === "/exit" || input === "/quit") {
        break;
      }

      await session.prompt(input);
    }
  } finally {
    stopStreaming();
    rl.close();
  }
}
