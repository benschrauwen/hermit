import matter from "gray-matter";
import { promises as fs } from "node:fs";
import path from "node:path";

import { HERMIT_ROLE_ID } from "./constants.js";
import { fileExists, getErrorCode } from "./fs-utils.js";
import { resolveFrameworkRoot, resolveSharedPromptTemplateCandidates, resolveWorkspaceRootFromCwd } from "./runtime-paths.js";
import type {
  RoleDefinition,
  RoleEntityDefinition,
  RoleEntityRelationshipDefinition,
  RoleExplorerConfig,
  RoleFieldDefinition,
  RoleResolution,
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
  explorer?: unknown;
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid role manifest field: ${field}`);
  }
  return value;
}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string" || v.length === 0)) {
    throw new Error(`Invalid role manifest field: ${field}`);
  }
  return [...value];
}

function assertObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid role manifest field: ${field}`);
  }
  return value as Record<string, unknown>;
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  return value === undefined ? undefined : assertStringArray(value, field);
}

function optionalFieldRef(record: Record<string, unknown>, key: string, validKeys: ReadonlySet<string>, context: string): string | undefined {
  const value = record[key];
  if (typeof value !== "string") return undefined;
  if (!validKeys.has(value)) {
    throw new Error(`${context}.${key} references unknown field ${value}`);
  }
  return value;
}

function spread<K extends string>(key: K, value: string | undefined): { [P in K]: string } | Record<string, never> {
  return value !== undefined ? ({ [key]: value } as { [P in K]: string }) : {};
}

function parseFieldDefinitions(value: unknown): RoleFieldDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid role manifest field: entities[].fields");
  }

  return value.map((entry, index) => {
    const f = `fields[${index}]`;
    const record = assertObject(entry, f);
    const type = assertString(record.type, `${f}.type`);
    if (type !== "string" && type !== "string-array") {
      throw new Error(`Unsupported role field type: ${type}`);
    }

    const key = assertString(record.key, `${f}.key`);
    const parsed: RoleFieldDefinition = {
      key,
      label: assertString(record.label, `${f}.label`),
      type,
      description: assertString(record.description, `${f}.description`),
    };

    if (typeof record.required === "boolean") parsed.required = record.required;
    if (record.defaultValue !== undefined) {
      if (type === "string" && typeof record.defaultValue === "string") {
        parsed.defaultValue = record.defaultValue;
      } else if (type === "string-array" && Array.isArray(record.defaultValue) && record.defaultValue.every((v) => typeof v === "string")) {
        parsed.defaultValue = [...record.defaultValue];
      } else {
        throw new Error(`Invalid defaultValue for ${type} field ${key}.`);
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
    const record = assertObject(entry, `files[${index}]`);
    return {
      path: assertString(record.path, `files[${index}].path`),
      template: assertString(record.template, `files[${index}].template`),
    };
  });
}

function parseRelationshipDefinitions(
  value: unknown,
  fieldKeys: ReadonlySet<string>,
  entityIndex: number,
): RoleEntityRelationshipDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid role manifest field: entities[${entityIndex}].relationships`);
  }

  return value.map((entry, i) => {
    const ctx = `entities[${entityIndex}].relationships[${i}]`;
    const record = assertObject(entry, ctx);
    const sourceField = assertString(record.source_field, `${ctx}.source_field`);
    if (!fieldKeys.has(sourceField)) {
      throw new Error(`${ctx}.source_field references unknown field ${sourceField}`);
    }

    return {
      sourceField,
      targetType: assertString(record.target_type, `${ctx}.target_type`),
      edgeType: assertString(record.edge_type, `${ctx}.edge_type`),
      ...(record.reverse_edge_type !== undefined
        ? { reverseEdgeType: assertString(record.reverse_edge_type, `${ctx}.reverse_edge_type`) }
        : {}),
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
    const ctx = `entities[${index}]`;
    const record = assertObject(entry, ctx);
    const idStrategy = assertString(record.id_strategy, `${ctx}.id_strategy`);
    if (idStrategy !== "prefixed-slug" && idStrategy !== "year-sequence-slug" && idStrategy !== "singleton") {
      throw new Error(`Unsupported role entity ID strategy: ${idStrategy}`);
    }

    const idSourceFields = optionalStringArray(record.id_source_fields, `${ctx}.id_source_fields`) ?? [];
    if (idStrategy !== "singleton" && idSourceFields.length === 0) {
      throw new Error(`${ctx}.id_source_fields is required when id_strategy is prefixed-slug or year-sequence-slug`);
    }

    const fields = parseFieldDefinitions(record.fields);
    const fieldKeys = new Set(fields.map((field) => field.key));

    for (const fieldName of idSourceFields) {
      if (!fieldKeys.has(fieldName)) {
        throw new Error(`${ctx}.id_source_fields references unknown field ${fieldName}`);
      }
    }

    return {
      key: assertString(record.key, `${ctx}.key`),
      label: assertString(record.label, `${ctx}.label`),
      type: assertString(record.type, `${ctx}.type`),
      createDirectory: assertString(record.create_directory, `${ctx}.create_directory`),
      idStrategy,
      idSourceFields,
      nameTemplate: assertString(record.name_template, `${ctx}.name_template`),
      fields,
      files: parseFileDefinitions(record.files),
      ...(typeof record.id_prefix === "string" ? { idPrefix: record.id_prefix } : {}),
      ...spread("statusField", optionalFieldRef(record, "status_field", fieldKeys, ctx)),
      ...spread("ownerField", optionalFieldRef(record, "owner_field", fieldKeys, ctx)),
      ...(typeof record.include_in_initialization === "boolean" ? { includeInInitialization: record.include_in_initialization } : {}),
      ...(Array.isArray(record.extra_directories) ? { extraDirectories: assertStringArray(record.extra_directories, `${ctx}.extra_directories`) } : {}),
      ...(Array.isArray(record.scan_directories) ? { scanDirectories: assertStringArray(record.scan_directories, `${ctx}.scan_directories`) } : {}),
      ...(Array.isArray(record.exclude_directory_names) ? { excludeDirectoryNames: assertStringArray(record.exclude_directory_names, `${ctx}.exclude_directory_names`) } : {}),
      ...(Array.isArray(record.relationships) ? { relationships: parseRelationshipDefinitions(record.relationships, fieldKeys, index) } : {}),
    };
  });
}

function parseStringMap(value: unknown, field: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(assertObject(value, field)).map(([k, v]) => [k, assertString(v, `${field}.${k}`)]),
  );
}

function parseNestedStringMap(value: unknown, field: string): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(assertObject(value, field)).map(([k, v]) => [k, parseStringMap(v, `${field}.${k}`)]),
  );
}

function parseExplorerConfig(value: unknown): RoleExplorerConfig | undefined {
  if (value === undefined) return undefined;
  const record = assertObject(value, "explorer");
  if (record.renderers === undefined) return {};

  const renderers = assertObject(record.renderers, "explorer.renderers");
  return {
    renderers: {
      ...(renderers.detail !== undefined ? { detail: parseStringMap(renderers.detail, "explorer.renderers.detail") } : {}),
      ...(renderers.files !== undefined ? { files: parseNestedStringMap(renderers.files, "explorer.renderers.files") } : {}),
    },
  };
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
  frameworkRoot: string;
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
  const frameworkRoot = resolveFrameworkRoot();
  const rootPaths = getRootPaths(root);
  const roleDir = path.join(rootPaths.agentsDir, roleId);
  return {
    frameworkRoot,
    roleDir,
    entitiesDir: rootPaths.entitiesDir,
    agentsFile: path.join(roleDir, ROLE_AGENTS_FILE),
    manifestFile: path.join(roleDir, ROLE_MANIFEST_FILE),
    sharedPromptsDir: path.join(frameworkRoot, "prompts"),
    rolePromptsDir: path.join(roleDir, "prompts"),
    sharedSkillsDir: path.join(frameworkRoot, "skills"),
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

  const manifestRoleId = assertString(data.id, "id");
  assertRoleDirectoryMatchesManifestId(roleId, manifestRoleId);

  const entityDefs = await loadEntityDefs(root);
  return {
    id: manifestRoleId,
    name: assertString(data.name, "name"),
    description: assertString(data.description, "description"),
    frameworkRoot: paths.frameworkRoot,
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
    roleDirectories: optionalStringArray(data.role_directories, "role_directories") ?? [],
    agentFiles: [...ROLE_AGENT_FILES],
    entities: entityDefs.entities,
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
  const root = resolveWorkspaceRootFromCwd(normalized);
  if (root === normalized) {
    const segments = normalized.split(path.sep);
    const agentsIndex = segments.lastIndexOf("agents");
    if (agentsIndex === -1 || agentsIndex === segments.length - 1) {
      return { root };
    }

    const roleId = segments[agentsIndex + 1];
    const rootSegments = segments.slice(0, agentsIndex);
    const inferredRoot = rootSegments.length === 0 ? path.sep : rootSegments.join(path.sep);
    return roleId ? { root: inferredRoot, roleId } : { root: inferredRoot };
  }

  const relative = path.relative(root, normalized);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return { root };
  }

  const segments = relative.split(path.sep);
  const agentsIndex = segments.indexOf("agents");
  if (agentsIndex === -1 || agentsIndex === segments.length - 1) {
    return { root };
  }

  const roleId = segments[agentsIndex + 1];
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

  for (const { filePath, errorMessage } of requiredFiles) {
    const candidatePaths = errorMessage.includes("shared agent template:")
      ? resolveSharedPromptTemplateCandidates(
          role.root,
          path.relative(path.join(role.frameworkRoot, "prompts"), filePath),
          role.frameworkRoot,
        )
      : [filePath];
    const exists = await Promise.all(candidatePaths.map((candidate) => fileExists(candidate))).then((results) => results.some(Boolean));
    if (!exists) {
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

  for (const entity of role.entities) {
    for (const relationship of entity.relationships ?? []) {
      if (!entityTypes.has(relationship.targetType)) {
        throw new Error(
          `Role ${roleId} relationship ${entity.type}.${relationship.sourceField} references unknown target type ${relationship.targetType}.`,
        );
      }
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
