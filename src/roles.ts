import matter from "gray-matter";
import { promises as fs } from "node:fs";
import path from "node:path";

import { HERMIT_ROLE_ID } from "./constants.js";
import { getErrorCode } from "./fs-utils.js";
import type {
  RoleDefinition,
  RoleEntityDefinition,
  RoleExplorerConfig,
  RoleFieldDefinition,
  RoleResolution,
  TranscriptIngestCapability,
} from "./types.js";

const ROLE_MANIFEST_FILE = "role.md";
const ROLE_AGENTS_FILE = "AGENTS.md";
const ROLE_AGENT_FILES = ["agent/record.md", "agent/inbox.md"] as const;
const SHARED_AGENT_TEMPLATE_DIR = path.join("templates", "agent");
const LAST_USED_CHAT_ROLE_FILE = path.join(".hermit", "state", "last-role.txt");

interface RoleManifestData {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  role_directories?: unknown;
  entities?: unknown;
  transcript_ingest?: unknown;
  explorer?: unknown;
}

function asString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid role manifest field: ${fieldName}`);
  }

  return value;
}

function asStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`Invalid role manifest field: ${fieldName}`);
  }

  return [...value];
}

function asOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return asStringArray(value, fieldName);
}

function asObject(value: unknown, errorMessage: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(errorMessage);
  }

  return value as Record<string, unknown>;
}

function parseFieldDefinitions(value: unknown): RoleFieldDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid role manifest field: entities[].fields");
  }

  return value.map((entry, index) => {
    const record = asObject(entry, `Invalid role field definition at index ${index}`);
    const type = asString(record.type, `entities[].fields[${index}].type`);
    if (type !== "string" && type !== "string-array") {
      throw new Error(`Unsupported role field type: ${type}`);
    }

    const parsed: RoleFieldDefinition = {
      key: asString(record.key, `entities[].fields[${index}].key`),
      label: asString(record.label, `entities[].fields[${index}].label`),
      type,
      description: asString(record.description, `entities[].fields[${index}].description`),
    };

    if (typeof record.required === "boolean") {
      parsed.required = record.required;
    }
    if (record.defaultValue !== undefined) {
      if (type === "string") {
        if (typeof record.defaultValue !== "string") {
          throw new Error(`Invalid defaultValue for string field ${parsed.key}. Expected a string.`);
        }
        parsed.defaultValue = record.defaultValue;
      } else {
        if (
          !Array.isArray(record.defaultValue)
          || record.defaultValue.some((entry) => typeof entry !== "string")
        ) {
          throw new Error(`Invalid defaultValue for string-array field ${parsed.key}. Expected a string array.`);
        }
        parsed.defaultValue = [...record.defaultValue];
      }
    }

    return parsed;
  });
}

function parseFileDefinitions(value: unknown): Array<{ path: string; template: string }> {
  if (!Array.isArray(value)) {
    throw new Error("Invalid role manifest field: entities[].files");
  }

  return value.map((entry, index) => {
    const record = asObject(entry, `Invalid role file definition at index ${index}`);
    return {
      path: asString(record.path, `entities[].files[${index}].path`),
      template: asString(record.template, `entities[].files[${index}].template`),
    };
  });
}

const ENTITIES_FILE = "entities.md";

export interface EntityDefsLoadResult {
  entities: RoleEntityDefinition[];
  explorer?: RoleExplorerConfig;
}

export async function loadEntityDefs(root: string): Promise<EntityDefsLoadResult> {
  const entityDefsDir = path.join(root, "entity-defs");
  const filePath = path.join(entityDefsDir, ENTITIES_FILE);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = matter(raw);
    const data = parsed.data as { entities?: unknown; explorer?: unknown };
    const entities = data.entities ? parseEntityDefinitions(data.entities) : [];
    const explorer = data.explorer ? parseExplorerConfig(data.explorer) : undefined;
    return { entities, ...(explorer ? { explorer } : {}) };
  } catch (err) {
    if (getErrorCode(err) === "ENOENT") {
      return { entities: [] };
    }
    throw err;
  }
}

function parseEntityDefinitions(value: unknown): RoleEntityDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid role manifest field: entities");
  }

  return value.map((entry, index) => {
    const record = asObject(entry, `Invalid role entity definition at index ${index}`);
    const idStrategy = asString(record.id_strategy, `entities[${index}].id_strategy`);
    if (idStrategy !== "prefixed-slug" && idStrategy !== "year-sequence-slug" && idStrategy !== "singleton") {
      throw new Error(`Unsupported role entity ID strategy: ${idStrategy}`);
    }

    const idSourceFields = asOptionalStringArray(record.id_source_fields, `entities[${index}].id_source_fields`);
    if (idStrategy !== "singleton" && (!idSourceFields || idSourceFields.length === 0)) {
      throw new Error(
        `entities[${index}].id_source_fields is required when id_strategy is prefixed-slug or year-sequence-slug`,
      );
    }

    const fields = parseFieldDefinitions(record.fields);
    const fieldKeys = new Set(fields.map((field) => field.key));
    const parsed: RoleEntityDefinition = {
      key: asString(record.key, `entities[${index}].key`),
      label: asString(record.label, `entities[${index}].label`),
      type: asString(record.type, `entities[${index}].type`),
      createDirectory: asString(record.create_directory, `entities[${index}].create_directory`),
      idStrategy,
      idSourceFields: idSourceFields ?? [],
      nameTemplate: asString(record.name_template, `entities[${index}].name_template`),
      fields,
      files: parseFileDefinitions(record.files),
    };

    if (typeof record.id_prefix === "string") {
      parsed.idPrefix = record.id_prefix;
    }
    if (typeof record.status_field === "string") {
      if (!fieldKeys.has(record.status_field)) {
        throw new Error(`entities[${index}].status_field references unknown field ${record.status_field}`);
      }
      parsed.statusField = record.status_field;
    }
    if (typeof record.owner_field === "string") {
      if (!fieldKeys.has(record.owner_field)) {
        throw new Error(`entities[${index}].owner_field references unknown field ${record.owner_field}`);
      }
      parsed.ownerField = record.owner_field;
    }
    if (typeof record.include_in_initialization === "boolean") {
      parsed.includeInInitialization = record.include_in_initialization;
    }
    if (Array.isArray(record.extra_directories)) {
      parsed.extraDirectories = asStringArray(record.extra_directories, `entities[${index}].extra_directories`);
    }
    if (Array.isArray(record.scan_directories)) {
      parsed.scanDirectories = asStringArray(record.scan_directories, `entities[${index}].scan_directories`);
    }
    if (Array.isArray(record.exclude_directory_names)) {
      parsed.excludeDirectoryNames = asStringArray(
        record.exclude_directory_names,
        `entities[${index}].exclude_directory_names`,
      );
    }
    for (const fieldName of parsed.idSourceFields) {
      if (!fieldKeys.has(fieldName)) {
        throw new Error(`entities[${index}].id_source_fields references unknown field ${fieldName}`);
      }
    }

    return parsed;
  });
}

function parseTranscriptIngestCapability(value: unknown): TranscriptIngestCapability | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = asObject(value, "Invalid role manifest field: transcript_ingest");
  return {
    entityType: asString(record.entity_type, "transcript_ingest.entity_type"),
    commandPrompt: asString(record.command_prompt, "transcript_ingest.command_prompt"),
    systemPrompts: asOptionalStringArray(record.system_prompts, "transcript_ingest.system_prompts") ?? [],
    evidenceDirectory: asString(record.evidence_directory, "transcript_ingest.evidence_directory"),
    unmatchedDirectory: asString(record.unmatched_directory, "transcript_ingest.unmatched_directory"),
    activityLogFile: asString(record.activity_log_file, "transcript_ingest.activity_log_file"),
  };
}

function parseStringMap(value: unknown, fieldName: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(asObject(value, `Invalid role manifest field: ${fieldName}`)).map(([key, entry]) => [
      key,
      asString(entry, `${fieldName}.${key}`),
    ]),
  );
}

function parseNestedStringMap(value: unknown, fieldName: string): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(asObject(value, `Invalid role manifest field: ${fieldName}`)).map(([key, entry]) => [
      key,
      parseStringMap(entry, `${fieldName}.${key}`),
    ]),
  );
}

function parseExplorerConfig(value: unknown): RoleExplorerConfig | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = asObject(value, "Invalid role manifest field: explorer");
  const renderers = record.renderers;
  if (renderers === undefined) {
    return {};
  }

  const rendererRecord = asObject(renderers, "Invalid role manifest field: explorer.renderers");
  const parsedRenderers: NonNullable<RoleExplorerConfig["renderers"]> = {};

  if (rendererRecord.detail !== undefined) {
    parsedRenderers.detail = parseStringMap(rendererRecord.detail, "explorer.renderers.detail");
  }
  if (rendererRecord.files !== undefined) {
    parsedRenderers.files = parseNestedStringMap(rendererRecord.files, "explorer.renderers.files");
  }

  return { renderers: parsedRenderers };
}

export function getRootPaths(root: string): {
  root: string;
  entitiesDir: string;
  agentsDir: string;
  skillsDir: string;
  inboxDir: string;
} {
  const entitiesDir = path.join(root, "entities");
  return {
    root,
    entitiesDir,
    agentsDir: path.join(root, "agents"),
    skillsDir: path.join(root, "skills"),
    inboxDir: path.join(root, "inbox"),
  };
}

export function getRolePaths(root: string, roleId: string): {
  roleDir: string;
  entitiesDir: string;
  agentsFile: string;
  manifestFile: string;
  sharedPromptsDir: string;
  rolePromptsDir: string;
  sharedSkillsDir: string;
  roleSkillsDir: string;
  entityDefsDir: string;
  agentDir: string;
  sessionsDir: string;
} {
  const rootPaths = getRootPaths(root);
  const roleDir = path.join(rootPaths.agentsDir, roleId);
  return {
    roleDir,
    entitiesDir: rootPaths.entitiesDir,
    agentsFile: path.join(roleDir, ROLE_AGENTS_FILE),
    manifestFile: path.join(roleDir, ROLE_MANIFEST_FILE),
    sharedPromptsDir: path.join(root, "prompts"),
    rolePromptsDir: path.join(roleDir, "prompts"),
    sharedSkillsDir: rootPaths.skillsDir,
    roleSkillsDir: path.join(roleDir, "skills"),
    entityDefsDir: path.join(root, "entity-defs"),
    agentDir: path.join(roleDir, "agent"),
    sessionsDir: path.join(roleDir, ".role-agent", "sessions"),
  };
}

export function resolveEntityDefsLocalPath(role: RoleDefinition, relativePath: string): string {
  const resolvedPath = path.resolve(role.entityDefsDir, relativePath);
  const relativeToEntityDefsDir = path.relative(role.entityDefsDir, resolvedPath);
  if (relativeToEntityDefsDir.startsWith("..") || path.isAbsolute(relativeToEntityDefsDir)) {
    throw new Error(`Role ${role.id} references a path outside the entity-defs directory: ${relativePath}`);
  }
  return resolvedPath;
}

export async function listRoleIds(root: string): Promise<string[]> {
  const agentsDir = getRootPaths(root).agentsDir;
  try {
    const entries = await fs.readdir(agentsDir, { withFileTypes: true });
    const roleIds = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            await fs.access(path.join(agentsDir, entry.name, ROLE_MANIFEST_FILE));
            return entry.name;
          } catch {
            return undefined;
          }
        }),
    );

    return roleIds.filter((roleId): roleId is string => roleId !== undefined).sort();
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function assertRoleDirectoryMatchesManifestId(roleDirectoryId: string, manifestRoleId: string): void {
  if (manifestRoleId !== roleDirectoryId) {
    throw new Error(
      `Role manifest ID mismatch for agents/${roleDirectoryId}/role.md: expected id "${roleDirectoryId}" but found "${manifestRoleId}".`,
    );
  }
}

export function validateRoleDirectoryIdentity(roleDirectoryId: string, role: Pick<RoleDefinition, "id">): void {
  assertRoleDirectoryMatchesManifestId(roleDirectoryId, role.id);
}

export async function loadRole(root: string, roleId: string): Promise<RoleDefinition> {
  const paths = getRolePaths(root, roleId);
  const raw = await fs.readFile(paths.manifestFile, "utf8");
  const parsed = matter(raw);
  const data = parsed.data as RoleManifestData;

  const manifestRoleId = asString(data.id, "id");
  assertRoleDirectoryMatchesManifestId(roleId, manifestRoleId);

  const transcriptIngest = parseTranscriptIngestCapability(data.transcript_ingest);
  const entityDefs = await loadEntityDefs(root);
  return {
    id: manifestRoleId,
    name: asString(data.name, "name"),
    description: asString(data.description, "description"),
    root,
    roleDir: paths.roleDir,
    entitiesDir: paths.entitiesDir,
    agentsFile: paths.agentsFile,
    manifestFile: paths.manifestFile,
    sharedPromptsDir: paths.sharedPromptsDir,
    rolePromptsDir: paths.rolePromptsDir,
    sharedSkillsDir: paths.sharedSkillsDir,
    roleSkillsDir: paths.roleSkillsDir,
    entityDefsDir: paths.entityDefsDir,
    agentDir: paths.agentDir,
    sessionsDir: paths.sessionsDir,
    roleDirectories: asOptionalStringArray(data.role_directories, "role_directories") ?? [],
    agentFiles: [...ROLE_AGENT_FILES],
    entities: entityDefs.entities,
    ...(transcriptIngest ? { transcriptIngest } : {}),
    ...(entityDefs.explorer ? { explorer: entityDefs.explorer } : {}),
  };
}

export function normalizeRoleId(roleId: string): string {
  return roleId.trim().toLowerCase() === HERMIT_ROLE_ID.toLowerCase() ? HERMIT_ROLE_ID : roleId.trim();
}

export function isHermitRoleId(roleId: string): boolean {
  return normalizeRoleId(roleId) === HERMIT_ROLE_ID;
}

export function resolveLastUsedChatRolePath(root: string): string {
  return path.join(root, LAST_USED_CHAT_ROLE_FILE);
}

export async function readLastUsedChatRole(root: string): Promise<string | undefined> {
  try {
    const raw = await fs.readFile(resolveLastUsedChatRolePath(root), "utf8");
    const roleId = normalizeRoleId(raw);
    if (!roleId) {
      return undefined;
    }
    if (isHermitRoleId(roleId)) {
      return HERMIT_ROLE_ID;
    }
    await loadRole(root, roleId);
    return roleId;
  } catch {
    return undefined;
  }
}

export async function writeLastUsedChatRole(root: string, roleId: string): Promise<void> {
  const normalizedRoleId = normalizeRoleId(roleId);
  if (!normalizedRoleId) {
    throw new Error("Role ID cannot be empty.");
  }
  if (!isHermitRoleId(normalizedRoleId)) {
    await loadRole(root, normalizedRoleId);
  }
  const filePath = resolveLastUsedChatRolePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${normalizedRoleId}\n`, "utf8");
}

export async function resolveRole(root: string, explicitRoleId?: string): Promise<RoleResolution> {
  if (explicitRoleId) {
    return { root, role: await loadRole(root, explicitRoleId) };
  }

  const roleIds = await listRoleIds(root);
  if (roleIds.length === 1) {
    const [onlyRoleId] = roleIds;
    if (!onlyRoleId) {
      throw new Error("Failed to resolve the only configured role.");
    }
    return { root, role: await loadRole(root, onlyRoleId) };
  }

  if (roleIds.length === 0) {
    throw new Error("No roles are configured. Add a role under agents/<role-id>/role.md.");
  }

  throw new Error(`Multiple roles are configured (${roleIds.join(", ")}). Re-run with --role <id>.`);
}

export type ChatSessionResolution =
  | {
      kind: "role";
      root: string;
      role: RoleDefinition;
    }
  | {
      kind: "hermit";
      root: string;
      bootstrapMode: boolean;
    };

export async function resolveChatSession(root: string, options: {
  explicitRoleId?: string;
  inferredRoleId?: string;
  lastRoleId?: string;
} = {}): Promise<ChatSessionResolution> {
  const roleId = normalizeRoleId(options.explicitRoleId ?? options.inferredRoleId ?? options.lastRoleId ?? HERMIT_ROLE_ID);
  if (isHermitRoleId(roleId)) {
    return {
      kind: "hermit",
      root,
      bootstrapMode: (await listRoleIds(root)).length === 0,
    };
  }

  return {
    kind: "role",
    root,
    role: await loadRole(root, roleId),
  };
}

export function inferRootAndRoleFromCwd(cwd: string): { root: string; roleId?: string } {
  const normalized = path.resolve(cwd);
  const segments = normalized.split(path.sep);
  const agentsIndex = segments.lastIndexOf("agents");
  if (agentsIndex === -1 || agentsIndex === segments.length - 1) {
    return { root: normalized };
  }

  const roleId = segments[agentsIndex + 1];
  const rootSegments = segments.slice(0, agentsIndex);
  const root = rootSegments.length === 0 ? path.sep : rootSegments.join(path.sep);
  return roleId ? { root, roleId } : { root };
}

export async function ensureRoleTemplatesExist(role: RoleDefinition): Promise<void> {
  const requiredFiles: Array<{ filePath: string; errorMessage: string }> = [
    {
      filePath: path.join(role.sharedPromptsDir, SHARED_AGENT_TEMPLATE_DIR, "record.md"),
      errorMessage: `Role ${role.id} is missing shared agent template: prompts/templates/agent/record.md`,
    },
    {
      filePath: path.join(role.sharedPromptsDir, SHARED_AGENT_TEMPLATE_DIR, "inbox.md"),
      errorMessage: `Role ${role.id} is missing shared agent template: prompts/templates/agent/inbox.md`,
    },
    ...role.entities.flatMap((entity) =>
      entity.files.map((file) => ({
        filePath: path.join(role.entityDefsDir, file.template),
        errorMessage: `Role ${role.id} is missing entity template: ${file.template}`,
      })),
    ),
  ];

  if (role.transcriptIngest) {
    requiredFiles.push({
      filePath: path.join(role.rolePromptsDir, role.transcriptIngest.commandPrompt),
      errorMessage: `Role ${role.id} is missing transcript command prompt: ${role.transcriptIngest.commandPrompt}`,
    });
    for (const systemPrompt of role.transcriptIngest.systemPrompts) {
      requiredFiles.push({
        filePath: path.join(role.rolePromptsDir, systemPrompt),
        errorMessage: `Role ${role.id} is missing transcript system prompt: ${systemPrompt}`,
      });
    }
  }

  for (const { filePath, errorMessage } of requiredFiles) {
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(errorMessage);
    }
  }
}

export async function validateRoleManifest(root: string, roleId: string): Promise<void> {
  const role = await loadRole(root, roleId);
  const entityTypes = new Set(role.entities.map((entity) => entity.type));

  await fs.access(role.agentsFile);
  await fs.access(role.sharedPromptsDir);
  await ensureRoleTemplatesExist(role);

  if (role.transcriptIngest) {
    if (!entityTypes.has(role.transcriptIngest.entityType)) {
      throw new Error(
        `Role ${roleId} transcript_ingest references unknown entity type ${role.transcriptIngest.entityType}.`,
      );
    }
  }

  const detailRenderers = role.explorer?.renderers?.detail ?? {};
  for (const [entityType, rendererPath] of Object.entries(detailRenderers)) {
    if (!entityTypes.has(entityType)) {
      throw new Error(`Role ${roleId} references explorer detail renderer for unknown entity type ${entityType}.`);
    }
    try {
      await fs.access(resolveEntityDefsLocalPath(role, rendererPath));
    } catch {
      throw new Error(`Role ${roleId} is missing explorer detail renderer: ${rendererPath}`);
    }
  }

  const fileRenderers = role.explorer?.renderers?.files ?? {};
  for (const [entityType, rendererMap] of Object.entries(fileRenderers)) {
    if (!entityTypes.has(entityType)) {
      throw new Error(`Role ${roleId} references explorer file renderer for unknown entity type ${entityType}.`);
    }
    for (const rendererPath of Object.values(rendererMap)) {
      try {
        await fs.access(resolveEntityDefsLocalPath(role, rendererPath));
      } catch {
        throw new Error(`Role ${roleId} is missing explorer file renderer: ${rendererPath}`);
      }
    }
  }
}
