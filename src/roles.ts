import matter from "gray-matter";
import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  RoleDefinition,
  RoleEntityDefinition,
  RoleExplorerConfig,
  RoleFieldDefinition,
  RolePromptDefinition,
  RoleResolution,
  TranscriptIngestCapability,
} from "./types.js";

const ROLE_MANIFEST_FILE = "role.md";
const ROLE_AGENTS_FILE = "AGENTS.md";
const ROLE_AGENT_FILES = ["agent/record.md", "agent/inbox.md"] as const;

interface RoleManifestData {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  prompt_catalog?: unknown;
  required_prompts?: unknown;
  prompt_bundles?: unknown;
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

function parseFieldDefinitions(value: unknown): RoleFieldDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid role manifest field: entities[].fields");
  }

  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`Invalid role field definition at index ${index}`);
    }

    const record = entry as Record<string, unknown>;
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
    if (typeof record.defaultValue === "string" || Array.isArray(record.defaultValue)) {
      parsed.defaultValue = record.defaultValue as string | string[];
    }

    return parsed;
  });
}

function parseFileDefinitions(value: unknown): Array<{ path: string; template: string }> {
  if (!Array.isArray(value)) {
    throw new Error("Invalid role manifest field: entities[].files");
  }

  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`Invalid role file definition at index ${index}`);
    }

    const record = entry as Record<string, unknown>;
    return {
      path: asString(record.path, `entities[].files[${index}].path`),
      template: asString(record.template, `entities[].files[${index}].template`),
    };
  });
}

function parseEntityDefinitions(value: unknown): RoleEntityDefinition[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid role manifest field: entities");
  }

  return value.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`Invalid role entity definition at index ${index}`);
    }

    const record = entry as Record<string, unknown>;
    const idStrategy = asString(record.id_strategy, `entities[${index}].id_strategy`);
    if (idStrategy !== "prefixed-slug" && idStrategy !== "year-sequence-slug") {
      throw new Error(`Unsupported role entity ID strategy: ${idStrategy}`);
    }

    const parsed: RoleEntityDefinition = {
      key: asString(record.key, `entities[${index}].key`),
      label: asString(record.label, `entities[${index}].label`),
      type: asString(record.type, `entities[${index}].type`),
      createDirectory: asString(record.create_directory, `entities[${index}].create_directory`),
      idStrategy,
      idSourceFields: asStringArray(record.id_source_fields, `entities[${index}].id_source_fields`),
      nameTemplate: asString(record.name_template, `entities[${index}].name_template`),
      fields: parseFieldDefinitions(record.fields),
      files: parseFileDefinitions(record.files),
    };

    if (typeof record.id_prefix === "string") {
      parsed.idPrefix = record.id_prefix;
    }
    if (typeof record.status_field === "string") {
      parsed.statusField = record.status_field;
    }
    if (typeof record.owner_field === "string") {
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

    return parsed;
  });
}

function parsePromptBundles(value: unknown): Record<string, string[]> {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid role manifest field: prompt_bundles");
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, bundle]) => [key, asStringArray(bundle, `prompt_bundles.${key}`)]),
  );
}

function parsePromptCatalog(value: unknown): Record<string, RolePromptDefinition> {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid role manifest field: prompt_catalog");
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([id, entry]) => {
      if (typeof entry !== "object" || entry === null) {
        throw new Error(`Invalid prompt catalog entry: ${id}`);
      }

      const record = entry as Record<string, unknown>;
      const scope = asString(record.scope, `prompt_catalog.${id}.scope`);
      if (scope !== "shared" && scope !== "role") {
        throw new Error(`Unsupported prompt scope for ${id}: ${scope}`);
      }

      return [
        id,
        {
          id,
          scope,
          file: asString(record.file, `prompt_catalog.${id}.file`),
        } satisfies RolePromptDefinition,
      ];
    }),
  );
}

function parseTranscriptIngestCapability(value: unknown): TranscriptIngestCapability | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid role manifest field: transcript_ingest");
  }

  const record = value as Record<string, unknown>;
  return {
    entityType: asString(record.entity_type, "transcript_ingest.entity_type"),
    promptFile: asString(record.prompt_file, "transcript_ingest.prompt_file"),
    evidenceDirectory: asString(record.evidence_directory, "transcript_ingest.evidence_directory"),
    unmatchedDirectory: asString(record.unmatched_directory, "transcript_ingest.unmatched_directory"),
    activityLogFile: asString(record.activity_log_file, "transcript_ingest.activity_log_file"),
  };
}

function parseStringMap(value: unknown, fieldName: string): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid role manifest field: ${fieldName}`);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, asString(entry, `${fieldName}.${key}`)]),
  );
}

function parseNestedStringMap(value: unknown, fieldName: string): Record<string, Record<string, string>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid role manifest field: ${fieldName}`);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, parseStringMap(entry, `${fieldName}.${key}`)]),
  );
}

function parseExplorerConfig(value: unknown): RoleExplorerConfig | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid role manifest field: explorer");
  }

  const record = value as Record<string, unknown>;
  const renderers = record.renderers;
  if (renderers === undefined) {
    return {};
  }
  if (typeof renderers !== "object" || renderers === null || Array.isArray(renderers)) {
    throw new Error("Invalid role manifest field: explorer.renderers");
  }

  const rendererRecord = renderers as Record<string, unknown>;
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
  companyDir: string;
  peopleDir: string;
  rolesDir: string;
} {
  return {
    root,
    companyDir: path.join(root, "company"),
    peopleDir: path.join(root, "people"),
    rolesDir: path.join(root, "roles"),
  };
}

export function getRolePaths(root: string, roleId: string): {
  roleDir: string;
  agentsFile: string;
  manifestFile: string;
  sharedPromptsDir: string;
  rolePromptsDir: string;
  templatesDir: string;
  agentDir: string;
  sessionsDir: string;
} {
  const roleDir = path.join(getRootPaths(root).rolesDir, roleId);
  return {
    roleDir,
    agentsFile: path.join(roleDir, ROLE_AGENTS_FILE),
    manifestFile: path.join(roleDir, ROLE_MANIFEST_FILE),
    sharedPromptsDir: path.join(root, "prompts"),
    rolePromptsDir: path.join(roleDir, "prompts"),
    templatesDir: path.join(roleDir, "templates"),
    agentDir: path.join(roleDir, "agent"),
    sessionsDir: path.join(roleDir, ".role-agent", "sessions"),
  };
}

export function resolveRoleLocalPath(role: RoleDefinition, relativePath: string): string {
  const resolvedPath = path.resolve(role.roleDir, relativePath);
  const relativeToRoleDir = path.relative(role.roleDir, resolvedPath);
  if (relativeToRoleDir.startsWith("..") || path.isAbsolute(relativeToRoleDir)) {
    throw new Error(`Role ${role.id} references a path outside its role directory: ${relativePath}`);
  }
  return resolvedPath;
}

export function getPromptDefinition(role: RoleDefinition, promptId: string): RolePromptDefinition {
  const prompt = role.promptCatalog[promptId];
  if (!prompt) {
    throw new Error(`Role ${role.id} references unknown prompt: ${promptId}`);
  }

  return prompt;
}

export function getPromptFilePath(role: RoleDefinition, promptId: string): string {
  const prompt = getPromptDefinition(role, promptId);
  return prompt.scope === "shared"
    ? path.join(role.sharedPromptsDir, prompt.file)
    : path.join(role.rolePromptsDir, prompt.file);
}

export function getPromptLinkPath(role: RoleDefinition, promptId: string): string {
  return path.relative(role.roleDir, getPromptFilePath(role, promptId)).split(path.sep).join("/");
}

export async function listRoleIds(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(getRootPaths(root).rolesDir, { withFileTypes: true });
    const roleIds = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          try {
            await fs.access(path.join(getRootPaths(root).rolesDir, entry.name, ROLE_MANIFEST_FILE));
            return entry.name;
          } catch {
            return undefined;
          }
        }),
    );

    return roleIds.filter((roleId): roleId is string => roleId !== undefined).sort();
  } catch {
    return [];
  }
}

export async function loadRole(root: string, roleId: string): Promise<RoleDefinition> {
  const paths = getRolePaths(root, roleId);
  const raw = await fs.readFile(paths.manifestFile, "utf8");
  const parsed = matter(raw);
  const data = parsed.data as RoleManifestData;

  const transcriptIngest = parseTranscriptIngestCapability(data.transcript_ingest);
  const promptCatalog = parsePromptCatalog(data.prompt_catalog);
  const explorer = parseExplorerConfig(data.explorer);
  return {
    id: asString(data.id, "id"),
    name: asString(data.name, "name"),
    description: asString(data.description, "description"),
    root,
    roleDir: paths.roleDir,
    agentsFile: paths.agentsFile,
    manifestFile: paths.manifestFile,
    sharedPromptsDir: paths.sharedPromptsDir,
    rolePromptsDir: paths.rolePromptsDir,
    templatesDir: paths.templatesDir,
    agentDir: paths.agentDir,
    sessionsDir: paths.sessionsDir,
    promptCatalog,
    requiredPromptIds: asStringArray(data.required_prompts, "required_prompts"),
    promptBundles: parsePromptBundles(data.prompt_bundles),
    roleDirectories: asStringArray(data.role_directories, "role_directories"),
    agentFiles: [...ROLE_AGENT_FILES],
    entities: parseEntityDefinitions(data.entities),
    ...(transcriptIngest ? { transcriptIngest } : {}),
    ...(explorer ? { explorer } : {}),
  };
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
    throw new Error("No roles are configured. Add a role under roles/<role-id>/role.md.");
  }

  throw new Error(`Multiple roles are configured (${roleIds.join(", ")}). Re-run with --role <id>.`);
}

export function inferRootAndRoleFromCwd(cwd: string): { root: string; roleId?: string } {
  const normalized = path.resolve(cwd);
  const segments = normalized.split(path.sep);
  const rolesIndex = segments.lastIndexOf("roles");
  if (rolesIndex === -1 || rolesIndex === segments.length - 1) {
    return { root: normalized };
  }

  const roleId = segments[rolesIndex + 1];
  const rootSegments = segments.slice(0, rolesIndex);
  const root = rootSegments.length === 0 ? path.sep : rootSegments.join(path.sep);
  return roleId ? { root, roleId } : { root };
}

export async function ensureRoleTemplatesExist(role: RoleDefinition): Promise<void> {
  const files = [
    ...role.requiredPromptIds.map((promptId) => getPromptFilePath(role, promptId)),
    ...role.entities.flatMap((entity) => entity.files.map((file) => path.join(role.templatesDir, file.template))),
  ];
  if (role.transcriptIngest) {
    files.push(getPromptFilePath(role, role.transcriptIngest.promptFile));
  }

  await Promise.all(
    files.map(async (filePath) => {
      await fs.access(filePath);
    }),
  );
}

export async function validateRoleManifest(root: string, roleId: string): Promise<void> {
  const role = await loadRole(root, roleId);
  const allPromptIds = new Set(Object.keys(role.promptCatalog));
  const entityTypes = new Set(role.entities.map((entity) => entity.type));
  for (const promptId of role.requiredPromptIds) {
    if (!allPromptIds.has(promptId)) {
      throw new Error(`Role ${roleId} requires unknown prompt ${promptId}.`);
    }
  }
  for (const bundle of Object.values(role.promptBundles)) {
    for (const promptId of bundle) {
      if (!allPromptIds.has(promptId)) {
        throw new Error(`Role ${roleId} references unknown prompt ${promptId} in a bundle.`);
      }
      if (!role.requiredPromptIds.includes(promptId)) {
        throw new Error(`Role ${roleId} references prompt ${promptId} in a bundle but not in required_prompts.`);
      }
    }
  }
  if (role.transcriptIngest && !allPromptIds.has(role.transcriptIngest.promptFile)) {
    throw new Error(`Role ${roleId} references unknown transcript prompt ${role.transcriptIngest.promptFile}.`);
  }
  if (role.transcriptIngest && !role.requiredPromptIds.includes(role.transcriptIngest.promptFile)) {
    throw new Error(
      `Role ${roleId} references transcript prompt ${role.transcriptIngest.promptFile} but it is not in required_prompts.`,
    );
  }

  const detailRenderers = role.explorer?.renderers?.detail ?? {};
  for (const [entityType, rendererPath] of Object.entries(detailRenderers)) {
    if (!entityTypes.has(entityType)) {
      throw new Error(`Role ${roleId} references explorer detail renderer for unknown entity type ${entityType}.`);
    }
    try {
      await fs.access(resolveRoleLocalPath(role, rendererPath));
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
        await fs.access(resolveRoleLocalPath(role, rendererPath));
      } catch {
        throw new Error(`Role ${roleId} is missing explorer file renderer: ${rendererPath}`);
      }
    }
  }
}
