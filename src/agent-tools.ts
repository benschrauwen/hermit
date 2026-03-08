import { Type, type TSchema } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import OpenAI from "openai";

import { DEFAULT_WEB_SEARCH_MODEL } from "./constants.js";
import { scanEntities } from "./workspace.js";

const entityLookupParameters = Type.Object({
  query: Type.String({ description: "ID, account name, person name, or product name to search for." }),
  type: Type.Optional(Type.String({ description: "Optional type filter: person, product, or deal." })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of matches to return." })),
});

const webSearchParameters = Type.Object({
  query: Type.String({ description: "The search query to run." }),
  searchContextSize: Type.Optional(Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")])),
});

const computerUseParameters = Type.Object({
  objective: Type.String({ description: "The browser or desktop task to automate." }),
});

function requireOpenAIApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for GPT-5.4 and web search.");
  }

  return apiKey;
}

export function createEntityLookupTool(root: string): ToolDefinition<typeof entityLookupParameters> {
  return {
    name: "entity_lookup",
    label: "Entity Lookup",
    description: "Find people, products, and deals by ID or name from the workspace.",
    promptSnippet: "Use entity_lookup to resolve people, product, and deal IDs before editing files.",
    promptGuidelines: [
      "Use entity_lookup when an entity name or ID is ambiguous.",
      "Prefer canonical entity IDs and paths returned by entity_lookup when updating files.",
    ],
    parameters: entityLookupParameters,
    async execute(_toolCallId, params) {
      const entities = await scanEntities(root);
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

export function createWebSearchTool(): ToolDefinition<typeof webSearchParameters> {
  return {
    name: "web_search",
    label: "Web Search",
    description: "Run a live web search using the OpenAI Responses API and summarize the results.",
    promptSnippet: "Use web_search when you need current market, competitor, or industry information.",
    promptGuidelines: [
      "Use web_search for up-to-date information that is not already in workspace files.",
      "Prefer file-backed company, product, and deal context before reaching for web search.",
    ],
    parameters: webSearchParameters,
    async execute(_toolCallId, params) {
      const client = new OpenAI({ apiKey: requireOpenAIApiKey() });
      const response = await client.responses.create({
        model: DEFAULT_WEB_SEARCH_MODEL,
        input: params.query,
        include: ["web_search_call.action.sources", "web_search_call.results"],
        tools: [
          {
            type: "web_search_preview",
            search_context_size: params.searchContextSize ?? "medium",
          },
        ],
      });

      return {
        content: [
          {
            type: "text",
            text: response.output_text,
          },
        ],
        details: {
          responseId: response.id,
          model: DEFAULT_WEB_SEARCH_MODEL,
        },
      };
    },
  };
}

export function createComputerUseBoundaryTool(): ToolDefinition<typeof computerUseParameters> {
  return {
    name: "computer_use",
    label: "Computer Use",
    description: "Reserved integration boundary for future browser and computer automation.",
    promptSnippet: "computer_use may exist as a boundary, but do not depend on it unless it is explicitly enabled.",
    parameters: computerUseParameters,
    async execute() {
      return {
        content: [
          {
            type: "text",
            text: "Computer use is not enabled in v1. Use file tools, image input, or web_search instead.",
          },
        ],
        details: {
          available: false,
        },
      };
    },
  };
}

export function createCustomTools(root: string): Array<ToolDefinition<TSchema>> {
  const tools: Array<ToolDefinition<TSchema>> = [
    createEntityLookupTool(root) as unknown as ToolDefinition<TSchema>,
    createWebSearchTool() as unknown as ToolDefinition<TSchema>,
  ];

  if (process.env.SALES_AGENT_ENABLE_COMPUTER_USE === "true") {
    tools.push(createComputerUseBoundaryTool() as unknown as ToolDefinition<TSchema>);
  }

  return tools;
}
