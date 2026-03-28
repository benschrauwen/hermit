import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { AuthStorage, type ToolDefinition } from "@mariozechner/pi-coding-agent";

import { HERMIT_ROLE_ID } from "./constants.js";
import { parseModelReference } from "./model-auth.js";
import {
  resolveTelegramBridgeConfig,
  sendTelegramMessage,
  type TelegramBridgeConfig,
  type TelegramMessageSender,
} from "./telegram.js";
import { getArray, getString, isRecord } from "./type-guards.js";
import { isHermitRoleId, loadRole, normalizeRoleId } from "./roles.js";
import { createRoleEntityRecord, scanEntities } from "./workspace.js";
import type { RoleDefinition, RoleEntityDefinition, RoleFieldDefinition } from "./types.js";

const entityLookupParameters = Type.Object({
  query: Type.String({ description: "ID or entity name to search for." }),
  type: Type.Optional(Type.String({ description: "Optional type filter." })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of matches to return." })),
});

const webSearchParameters = Type.Object({
  query: Type.String({ description: "Question, research brief, or complex external-information task to investigate on the web." }),
  allowedDomains: Type.Optional(
    Type.Array(Type.String({ description: "Optional allowed domain without protocol, for example openai.com." })),
  ),
  externalWebAccess: Type.Optional(
    Type.Boolean({ description: "Whether to allow live internet access. Defaults to true." }),
  ),
});

type WebSearchToolParams = Static<typeof webSearchParameters>;

const roleSwitchParameters = Type.Object({
  roleId: Type.String({ description: `Role ID to switch to, or "${HERMIT_ROLE_ID}" for the base system prompt.` }),
  reason: Type.Optional(Type.String({ description: "Short explanation for why the role should change." })),
});

type RoleSwitchToolParams = Static<typeof roleSwitchParameters>;

const telegramSendParameters = Type.Object({
  message: Type.String({
    description: "Short message to send back to the configured Telegram chat. Keep it concise because it appears in a chat app.",
  }),
});

type TelegramSendToolParams = Static<typeof telegramSendParameters>;

export interface CustomToolOptions {
  onRoleSwitchRequest?: (request: { roleId: string; reason?: string }) => void;
  telegram?: {
    config: TelegramBridgeConfig;
    sender?: TelegramMessageSender;
  };
}

interface WebSearchCitation {
  url: string;
  title?: string;
}

interface WebSearchResult {
  answer: string;
  citations: WebSearchCitation[];
}

export type WebSearchExecutor = (params: WebSearchToolParams) => Promise<WebSearchResult>;

function resolveTelegramToolOptions(options: CustomToolOptions): { config: TelegramBridgeConfig; sender: TelegramMessageSender } | undefined {
  const config = options.telegram?.config ?? resolveTelegramBridgeConfig();
  if (!config) {
    return undefined;
  }

  return {
    config,
    sender: options.telegram?.sender ?? sendTelegramMessage,
  };
}

async function getConfiguredProviderApiKey(provider: string): Promise<string | undefined> {
  const authStorage = AuthStorage.create();
  return authStorage.getApiKey(provider);
}

function buildRoleFieldSchema(field: RoleFieldDefinition): TSchema {
  if (field.type === "string-array") {
    return (field.required ?? false)
      ? Type.Array(Type.String({ description: field.description }))
      : Type.Optional(Type.Array(Type.String({ description: field.description })));
  }

  return (field.required ?? false)
    ? Type.String({ description: field.description })
    : Type.Optional(Type.String({ description: field.description }));
}

function buildRoleEntityParameters(entity: RoleEntityDefinition): TSchema {
  const properties = Object.fromEntries(entity.fields.map((field) => [field.key, buildRoleFieldSchema(field)]));
  return Type.Object(properties);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function extractWebSearchText(response: unknown): string {
  const record = asRecord(response);
  const directText = getString(record?.output_text);
  if (directText) {
    return directText.trim();
  }

  const contentParts: string[] = [];
  for (const item of getArray(record?.output) ?? []) {
    for (const content of getArray(asRecord(item)?.content) ?? []) {
      const contentRecord = asRecord(content);
      if (getString(contentRecord?.type) !== "output_text") {
        continue;
      }

      const text = getString(contentRecord?.text);
      if (text) {
        contentParts.push(text);
      }
    }
  }

  return contentParts.join("\n\n").trim();
}

function extractWebSearchCitations(response: unknown): WebSearchCitation[] {
  const record = asRecord(response);
  const citations: WebSearchCitation[] = [];
  const seenUrls = new Set<string>();

  for (const item of getArray(record?.output) ?? []) {
    for (const content of getArray(asRecord(item)?.content) ?? []) {
      for (const annotation of getArray(asRecord(content)?.annotations) ?? []) {
        const annotationRecord = asRecord(annotation);
        if (getString(annotationRecord?.type) !== "url_citation") {
          continue;
        }

        const nestedCitation = asRecord(annotationRecord?.url_citation);
        const url = getString(annotationRecord?.url) ?? getString(nestedCitation?.url);
        if (!url || seenUrls.has(url)) {
          continue;
        }

        seenUrls.add(url);
        const title = getString(annotationRecord?.title) ?? getString(nestedCitation?.title);
        citations.push(title ? { url, title } : { url });
      }
    }
  }

  return citations;
}

function extractAnthropicWebSearchText(response: unknown): string {
  const record = asRecord(response);
  const parts: string[] = [];

  for (const content of getArray(record?.content) ?? []) {
    const contentRecord = asRecord(content);
    if (getString(contentRecord?.type) !== "text") {
      continue;
    }

    const text = getString(contentRecord?.text);
    if (text) {
      parts.push(text);
    }
  }

  return parts.join("\n\n").trim();
}

function extractAnthropicWebSearchCitations(response: unknown): WebSearchCitation[] {
  const record = asRecord(response);
  const citations: WebSearchCitation[] = [];
  const seenUrls = new Set<string>();

  for (const content of getArray(record?.content) ?? []) {
    const contentRecord = asRecord(content);
    if (getString(contentRecord?.type) !== "text") {
      continue;
    }

    for (const citation of getArray(contentRecord?.citations) ?? []) {
      const citationRecord = asRecord(citation);
      if (getString(citationRecord?.type) !== "web_search_result_location") {
        continue;
      }

      const url = getString(citationRecord?.url);
      if (!url || seenUrls.has(url)) {
        continue;
      }

      seenUrls.add(url);
      const title = getString(citationRecord?.title);
      citations.push(title ? { url, title } : { url });
    }
  }

  return citations;
}

function formatWebSearchResult(result: WebSearchResult): string {
  const answer = result.answer.trim() || "Web search completed but returned no answer text.";
  if (result.citations.length === 0) {
    return answer;
  }

  const sources = result.citations.map((citation) =>
    citation.title ? `- ${citation.title}: ${citation.url}` : `- ${citation.url}`,
  );
  return `${answer}\n\nSources:\n${sources.join("\n")}`;
}

async function executeOpenAIWebSearch(params: WebSearchToolParams, apiKey?: string): Promise<WebSearchResult> {
  if (!apiKey) {
    throw new Error("OpenAI credentials are not configured.");
  }

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: "gpt-5",
    tools: [
      {
        type: "web_search",
        ...(params.allowedDomains && params.allowedDomains.length > 0
          ? {
              filters: {
                allowed_domains: params.allowedDomains,
              },
            }
          : {}),
        ...(params.externalWebAccess !== undefined
          ? {
              external_web_access: params.externalWebAccess,
            }
          : {}),
      },
    ],
    include: ["web_search_call.action.sources"],
    input: params.query,
  });

  return {
    answer: extractWebSearchText(response) || "Web search completed but returned no answer text.",
    citations: extractWebSearchCitations(response),
  };
}

async function executeAnthropicWebSearch(params: WebSearchToolParams, apiKey?: string): Promise<WebSearchResult> {
  if (!apiKey) {
    throw new Error("Anthropic credentials are not configured.");
  }
  if (params.externalWebAccess === false) {
    throw new Error("Anthropic web search does not support externalWebAccess=false. Use OpenAI for that option or omit the flag.");
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: params.query,
      },
    ],
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
        ...(params.allowedDomains && params.allowedDomains.length > 0
          ? {
              allowed_domains: params.allowedDomains,
            }
          : {}),
      },
    ],
  });

  return {
    answer: extractAnthropicWebSearchText(response) || "Web search completed but returned no answer text.",
    citations: extractAnthropicWebSearchCitations(response),
  };
}

function resolvePreferredWebSearchProvider(): "openai" | "anthropic" | undefined {
  const preferredModel = process.env.ROLE_AGENT_MODEL?.trim();
  if (!preferredModel) {
    return undefined;
  }

  const provider = parseModelReference(preferredModel).provider;
  if (provider === "openai" || provider === "anthropic") {
    return provider;
  }

  return undefined;
}

async function executeDefaultWebSearch(params: WebSearchToolParams): Promise<WebSearchResult> {
  const [openAiApiKey, anthropicApiKey] = await Promise.all([
    getConfiguredProviderApiKey("openai"),
    getConfiguredProviderApiKey("anthropic"),
  ]);
  const hasOpenAi = Boolean(openAiApiKey?.trim());
  const hasAnthropic = Boolean(anthropicApiKey?.trim());
  const preferredProvider = resolvePreferredWebSearchProvider();

  if (preferredProvider === "anthropic" && hasAnthropic) {
    return executeAnthropicWebSearch(params, anthropicApiKey);
  }
  if (preferredProvider === "openai" && hasOpenAi) {
    return executeOpenAIWebSearch(params, openAiApiKey);
  }
  if (hasOpenAi) {
    return executeOpenAIWebSearch(params, openAiApiKey);
  }
  if (hasAnthropic) {
    return executeAnthropicWebSearch(params, anthropicApiKey);
  }

  throw new Error(
    "web_search requires OpenAI or Anthropic credentials from the same auth sources Hermit uses for models (auth storage or environment).",
  );
}

export function createEntityLookupTool(root: string, role: RoleDefinition): ToolDefinition<typeof entityLookupParameters> {
  return {
    name: "entity_lookup",
    label: "Entity Lookup",
    description: "Find shared and role-specific entities by ID or name from the workspace.",
    promptSnippet: "Use entity_lookup to resolve canonical IDs before editing files.",
    promptGuidelines: [
      "Use entity_lookup when an entity name or ID is ambiguous.",
      "Prefer canonical entity IDs and paths returned by entity_lookup when updating files.",
    ],
    parameters: entityLookupParameters,
    async execute(_toolCallId, params) {
      const entities = await scanEntities(root, role);
      const normalizedQuery = params.query.toLowerCase();
      const matches = entities
        .filter((entity) => (params.type ? entity.type === params.type : true))
        .filter(
          (entity) =>
            entity.id.toLowerCase().includes(normalizedQuery) ||
            entity.name.toLowerCase().includes(normalizedQuery) ||
            entity.path.toLowerCase().includes(normalizedQuery),
        )
        .slice(0, params.limit ?? 10);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(matches, null, 2),
          },
        ],
        details: {
          count: matches.length,
        },
      };
    },
  };
}

export function createWebSearchTool(
  executor: WebSearchExecutor = executeDefaultWebSearch,
): ToolDefinition<typeof webSearchParameters> {
  return {
    name: "web_search",
    label: "Web Search",
    description: "Run a web-connected research subagent for current external information using OpenAI or Anthropic web search.",
    promptSnippet: "Use web_search when the task needs current external information that is not in the workspace. It can take a full research question, not just keywords.",
    promptGuidelines: [
      "Use web_search for recent facts, external documentation, up-to-date API behavior, or broader external research questions.",
      "Treat web_search as a web-connected research worker, not a simple keyword lookup box: give it the full question, objective, and any useful constraints.",
      "Complex web_search runs can take several minutes, so prefer background or heartbeat-friendly use when the answer is not needed immediately.",
      "web_search currently supports OpenAI and Anthropic credentials.",
      "If both are configured, Hermit prefers the provider pinned by ROLE_AGENT_MODEL when it is OpenAI or Anthropic.",
      "Prefer workspace files for canonical local truth, and use allowedDomains when a trusted source is known.",
    ],
    parameters: webSearchParameters,
    async execute(_toolCallId, params) {
      const result = await executor(params);
      return {
        content: [
          {
            type: "text",
            text: formatWebSearchResult(result),
          },
        ],
        details: result,
      };
    },
  };
}

export function createRoleSwitchTool(
  root: string,
  options: CustomToolOptions = {},
): ToolDefinition<typeof roleSwitchParameters> {
  return {
    name: "switch_role",
    label: "Switch Role",
    description: "Switch the active interactive chat to another role or back to Hermit.",
    promptSnippet: `Use switch_role only when the user explicitly asks to change the active role, or when first-role bootstrap is complete and control should move into the new role. Use "${HERMIT_ROLE_ID}" to return to the base system prompt.`,
    promptGuidelines: [
      "Do not pretend the switch already happened. Call switch_role when the active role really needs to change.",
      `Use "${HERMIT_ROLE_ID}" to return to the base Hermit system prompt.`,
      "Before switching into a non-Hermit role, make sure that role already exists on disk and is ready to load.",
    ],
    parameters: roleSwitchParameters,
    async execute(_toolCallId, params) {
      const requestedRoleId = normalizeRoleId(params.roleId);
      if (!requestedRoleId) {
        throw new Error("Role ID cannot be empty.");
      }
      if (!isHermitRoleId(requestedRoleId)) {
        await loadRole(root, requestedRoleId);
      }
      options.onRoleSwitchRequest?.({
        roleId: requestedRoleId,
        ...(params.reason ? { reason: params.reason } : {}),
      });
      return {
        content: [
          {
            type: "text",
            text: isHermitRoleId(requestedRoleId)
              ? `Role switch requested: ${HERMIT_ROLE_ID}.`
              : `Role switch requested: ${requestedRoleId}.`,
          },
        ],
        details: {
          roleId: requestedRoleId,
          ...(params.reason ? { reason: params.reason } : {}),
        },
      };
    },
  };
}

export function createTelegramSendTool(
  config: TelegramBridgeConfig,
  sender: TelegramMessageSender = sendTelegramMessage,
): ToolDefinition<typeof telegramSendParameters> {
  return {
    name: "send_telegram_message",
    label: "Send Telegram Message",
    description: "Send a short reply back to the configured Telegram chat.",
    promptSnippet:
      "Use send_telegram_message when replying to a message that was queued from Telegram. A normal assistant reply in Hermit does not reach Telegram.",
    promptGuidelines: [
      "Use send_telegram_message for Telegram-originated requests instead of pretending your normal chat reply was sent externally.",
      "Keep Telegram replies shorter and more direct than normal desktop chat because they appear in a chat app.",
      "If the Telegram request needs longer work, send a brief acknowledgment and next step instead of a long essay.",
    ],
    parameters: telegramSendParameters,
    async execute(_toolCallId, params) {
      const result = await sender(config, params.message);
      return {
        content: [
          {
            type: "text",
            text: `Telegram message sent to chat ${result.chatId}.`,
          },
        ],
        details: result,
      };
    },
  };
}

export function createEntityRecordTool(root: string, role: RoleDefinition, entity: RoleEntityDefinition): ToolDefinition<TSchema> {
  const parameters = buildRoleEntityParameters(entity);
  return {
    name: `create_${entity.key}_record`,
    label: `Create ${entity.label} Record`,
    description: `Create a ${entity.label.toLowerCase()} record using the selected role's deterministic templates.`,
    promptSnippet: `Use create_${entity.key}_record when you have enough information for a new ${entity.label.toLowerCase()}.`,
    promptGuidelines: [
      "Use this tool instead of inventing IDs by hand.",
      "Leave missing facts explicit instead of pretending they are known.",
    ],
    parameters,
    async execute(_toolCallId, params) {
      const result = await createRoleEntityRecord(role, entity.key, params as Record<string, unknown>, {
        sourceRefs: ["agent onboarding"],
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        details: result,
      };
    },
  };
}

export function createCustomTools(root: string, role: RoleDefinition, options: CustomToolOptions = {}): Array<ToolDefinition<any>> {
  const tools: Array<ToolDefinition<any>> = [
    createEntityLookupTool(root, role),
    createWebSearchTool(),
    ...role.entities.map((entity) => createEntityRecordTool(root, role, entity)),
  ];
  const telegram = resolveTelegramToolOptions(options);
  if (telegram) {
    tools.push(createTelegramSendTool(telegram.config, telegram.sender));
  }

  if (options.onRoleSwitchRequest) {
    tools.push(createRoleSwitchTool(root, options));
  }

  return tools;
}

export function createHermitTools(root: string, options: CustomToolOptions = {}): Array<ToolDefinition<any>> {
  const tools: Array<ToolDefinition<any>> = [createWebSearchTool()];
  const telegram = resolveTelegramToolOptions(options);
  if (telegram) {
    tools.push(createTelegramSendTool(telegram.config, telegram.sender));
  }
  if (options.onRoleSwitchRequest) {
    tools.push(createRoleSwitchTool(root, options));
  }
  return tools;
}
