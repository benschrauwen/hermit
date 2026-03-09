import { Type, type TSchema } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import OpenAI from "openai";

import { DEFAULT_WEB_SEARCH_MODEL } from "./constants.js";
import { createCompanyRecords, createPersonRecord, createRoleEntityRecord, scanEntities } from "./workspace.js";
import type { RoleDefinition, RoleEntityDefinition, RoleFieldDefinition } from "./types.js";

const entityLookupParameters = Type.Object({
  query: Type.String({ description: "ID or entity name to search for." }),
  type: Type.Optional(Type.String({ description: "Optional type filter." })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of matches to return." })),
});

const webSearchParameters = Type.Object({
  query: Type.String({ description: "The search query to run." }),
  searchContextSize: Type.Optional(Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")])),
});

const computerUseParameters = Type.Object({
  objective: Type.String({ description: "The browser or desktop task to automate." }),
});

const createCompanyRecordParameters = Type.Object({
  companyName: Type.String({ description: "Company name." }),
  companySummary: Type.String({ description: "Short company summary." }),
  businessModel: Type.String({ description: "How the company makes money or delivers value." }),
  operatingCadence: Type.String({ description: "How the business reviews priorities and execution." }),
  strategicPriorities: Type.String({ description: "Current strategic priorities." }),
  topCompetitors: Type.Optional(Type.Array(Type.String({ description: "Competitor name." }))),
});

const createPersonRecordParameters = Type.Object({
  name: Type.String({ description: "Person name." }),
  role: Type.String({ description: "Role or title." }),
  manager: Type.String({ description: "Manager name or owning leader." }),
  strengths: Type.String({ description: "Current strengths." }),
  coachingFocus: Type.String({ description: "Current coaching focus." }),
});

function requireOpenAIApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for GPT-5.4 and web search.");
  }

  return apiKey;
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

export function createEntityLookupTool(root: string, role: RoleDefinition): ToolDefinition<typeof entityLookupParameters> {
  return {
    name: "entity_lookup",
    label: "Entity Lookup",
    description: "Find shared people and role-specific entities by ID or name from the workspace.",
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

export function createCompanyRecordTool(root: string): ToolDefinition<typeof createCompanyRecordParameters> {
  return {
    name: "create_company_record",
    label: "Create Company Record",
    description: "Create the canonical company starter files using deterministic templates.",
    promptSnippet: "Use create_company_record when onboarding a workspace with company context.",
    promptGuidelines: [
      "Use this tool instead of hand-authoring company starter files during onboarding.",
      "Ask follow-up questions first when key company fields are unknown.",
    ],
    parameters: createCompanyRecordParameters,
    async execute(_toolCallId, params) {
      const result = await createCompanyRecords(root, {
        ...params,
        topCompetitors: params.topCompetitors ?? [],
      }, { sourceRefs: ["agent onboarding"] });

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

export function createPersonRecordTool(root: string): ToolDefinition<typeof createPersonRecordParameters> {
  return {
    name: "create_person_record",
    label: "Create Person Record",
    description: "Create a person record and development plan using deterministic templates.",
    promptSnippet: "Use create_person_record during onboarding when you have enough information for a new person.",
    promptGuidelines: [
      "Use this tool instead of inventing person IDs by hand.",
      "Keep unknowns explicit rather than guessing.",
    ],
    parameters: createPersonRecordParameters,
    async execute(_toolCallId, params) {
      const result = await createPersonRecord(root, params, { sourceRefs: ["agent onboarding"] });
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

export function createRoleEntityRecordTool(root: string, role: RoleDefinition, entity: RoleEntityDefinition): ToolDefinition<TSchema> {
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
    createCompanyRecordTool(root),
    createPersonRecordTool(root),
    ...role.entities.map((entity) => createRoleEntityRecordTool(root, role, entity)),
  ];

  return tools;
}
