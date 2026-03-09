import { Type, type TSchema } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

import { createRoleEntityRecord, scanEntities } from "./workspace.js";
import type { RoleDefinition, RoleEntityDefinition, RoleFieldDefinition } from "./types.js";

const entityLookupParameters = Type.Object({
  query: Type.String({ description: "ID or entity name to search for." }),
  type: Type.Optional(Type.String({ description: "Optional type filter." })),
  limit: Type.Optional(Type.Number({ description: "Maximum number of matches to return." })),
});


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
    ...role.entities.map((entity) => createEntityRecordTool(root, role, entity)),
  ];

  return tools;
}
