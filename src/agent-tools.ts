import OpenAI from "openai";
import { Type, type Static, type TSchema } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import { createRoleEntityRecord, scanEntities } from "./workspace.js";
import type { RoleDefinition, RoleEntityDefinition, RoleFieldDefinition } from "./types.js";

const entityLookupParameters = Type.Object({
  query: Type.String({ description: "ID or entity name to search for." }),
  type: Type.Optional(Type.String({ description: "Optional type filter." })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of matches to return." })),
});

const webSearchParameters = Type.Object({
  query: Type.String({ description: "Question or topic to search for on the web." }),
  allowedDomains: Type.Optional(
    Type.Array(Type.String({ description: "Optional allowed domain without protocol, for example openai.com." })),
  ),
  externalWebAccess: Type.Optional(
    Type.Boolean({ description: "Whether to allow live internet access. Defaults to true." }),
  ),
});

type WebSearchToolParams = Static<typeof webSearchParameters>;

interface WebSearchCitation {
  url: string;
  title?: string;
}

interface WebSearchResult {
  answer: string;
  citations: WebSearchCitation[];
}

export type WebSearchExecutor = (params: WebSearchToolParams) => Promise<WebSearchResult>;

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
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
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

async function executeOpenAIWebSearch(params: WebSearchToolParams): Promise<WebSearchResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Web search requires OpenAI credentials.");
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
  executor: WebSearchExecutor = executeOpenAIWebSearch,
): ToolDefinition<typeof webSearchParameters> {
  return {
    name: "web_search",
    label: "Web Search",
    description: "Search the web for current external information using OpenAI web search.",
    promptSnippet: "Use web_search when the task needs current external information that is not in the workspace.",
    promptGuidelines: [
      "Use web_search for recent facts, external documentation, or up-to-date API behavior.",
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
      const result = await createRoleEntityRecord(root, role, entity.key, params as Record<string, unknown>, {
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

export function createCustomTools(root: string, role: RoleDefinition): Array<ToolDefinition<any>> {
  const tools: Array<ToolDefinition<any>> = [
    createEntityLookupTool(root, role),
    createWebSearchTool(),
    ...role.entities.map((entity) => createEntityRecordTool(root, role, entity)),
  ];

  return tools;
}

export function createBootstrapTools(): Array<ToolDefinition<any>> {
  return [createWebSearchTool()];
}
