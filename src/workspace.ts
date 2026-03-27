import matter from "gray-matter";
import { promises as fs } from "node:fs";
import path from "node:path";
import slugifyImport from "slugify";

const slugify = slugifyImport as unknown as (
  value: string,
  options?: { lower?: boolean; strict?: boolean; trim?: boolean },
) => string;

import { ENTITY_SEQUENCE_WIDTH, HERMIT_ROLE_ID, HERMIT_ROLE_ROOT, SHARED_ROOT_DIRECTORIES } from "./constants.js";
import { fileExists, formatErrorMessage, isMissingPathError } from "./fs-utils.js";
import { resolveFrameworkRoot, resolveSharedPromptTemplateCandidates } from "./runtime-paths.js";
import { getRootPaths, getRolePaths, listRoleIds } from "./roles.js";
import { renderBulletList, renderTemplate, renderTemplateString, renderYamlList } from "./template-library.js";
import type {
  EntityRecord,
  RoleDefinition,
  RoleEntityDefinition,
  WorkspaceInitializationState,
} from "./types.js";

export interface WorkspacePaths {
  root: string;
  entitiesDir: string;
  agentsDir: string;
  skillsDir: string;
  inboxDir: string;
  roleDir?: string;
  agentsFile?: string;
  manifestFile?: string;
  sharedPromptsDir?: string;
  rolePromptsDir?: string;
  sharedSkillsDir?: string;
  roleSkillsDir?: string;
  entityDefsDir?: string;
  agentDir?: string;
  sessionsDir?: string;
}

interface CreateEntityOptions {
  force?: boolean;
  sourceRefs?: string[];
}

export function getWorkspacePaths(root: string, role?: RoleDefinition): WorkspacePaths {
  const shared = getRootPaths(root);
  if (!role) {
    return shared;
  }

  const rolePaths = getRolePaths(root, role.id);
  return {
    ...shared,
    roleDir: rolePaths.roleDir,
    agentsFile: rolePaths.agentsFile,
    manifestFile: rolePaths.manifestFile,
    sharedPromptsDir: rolePaths.sharedPromptsDir,
    rolePromptsDir: rolePaths.rolePromptsDir,
    sharedSkillsDir: rolePaths.sharedSkillsDir,
    roleSkillsDir: rolePaths.roleSkillsDir,
    entityDefsDir: rolePaths.entityDefsDir,
    agentDir: rolePaths.agentDir,
    sessionsDir: rolePaths.sessionsDir,
  };
}

export function makeSlug(value: string): string {
  return slugify(value, {
    lower: true,
    strict: true,
    trim: true,
  });
}

async function getSharedPromptTemplatePath(workspaceRoot: string, relativePath: string, frameworkRoot = resolveFrameworkRoot()): Promise<string> {
  for (const candidate of resolveSharedPromptTemplateCandidates(workspaceRoot, relativePath, frameworkRoot)) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return resolveSharedPromptTemplateCandidates(workspaceRoot, relativePath, frameworkRoot).at(-1)
    ?? path.join(frameworkRoot, "prompts", relativePath);
}

function joinFieldValues(input: Record<string, unknown>, fieldNames: string[]): string {
  return fieldNames
    .map((fieldName) => String(input[fieldName] ?? ""))
    .join(" ")
    .trim();
}

async function renderSharedPromptTemplate(
  workspaceRoot: string,
  relativeTemplatePath: string,
  values: Record<string, string>,
  frameworkRoot = resolveFrameworkRoot(),
): Promise<string> {
  return renderTemplate(await getSharedPromptTemplatePath(workspaceRoot, relativeTemplatePath, frameworkRoot), values);
}

function buildFieldContext(input: Record<string, unknown>): Record<string, string> {
  const context: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      context[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      const stringValues = value.map((entry) => String(entry));
      context[key] = stringValues.join(", ");
      context[`${key}BulletList`] = renderBulletList(stringValues, "- None.");
      context[`${key}YamlList`] = renderYamlList(stringValues);
    }
  }

  return context;
}

async function ensureDirectory(relativeTo: string, relativePaths: string[]): Promise<void> {
  await Promise.all(relativePaths.map((relativePath) => fs.mkdir(path.join(relativeTo, relativePath), { recursive: true })));
}

function renderNameTemplate(entity: RoleEntityDefinition, input: Record<string, unknown>): string {
  return renderTemplateString(
    entity.nameTemplate,
    Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value ?? "")])),
  );
}

async function listDirectoryNames(directory: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw new Error(`Failed to list entity directories in ${directory}: ${formatErrorMessage(error)}`);
  }
}

function cloneFieldDefaultValue(value: string | string[]): string | string[] {
  return Array.isArray(value) ? [...value] : value;
}

function isMissingFieldValue(value: unknown, fieldType: RoleEntityDefinition["fields"][number]["type"]): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (fieldType === "string-array") {
    return !Array.isArray(value) || value.length === 0;
  }
  return typeof value !== "string" || value.trim().length === 0;
}

function normalizeEntityFieldValue(
  entityKey: string,
  field: RoleEntityDefinition["fields"][number],
  value: unknown,
): string | string[] | undefined {
  if (isMissingFieldValue(value, field.type)) {
    if (field.defaultValue !== undefined) {
      return cloneFieldDefaultValue(field.defaultValue);
    }
    if (field.required) {
      throw new Error(`Missing required field "${field.key}" for entity ${entityKey}.`);
    }
    return undefined;
  }

  if (field.type === "string-array") {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
      throw new Error(`Field "${field.key}" for entity ${entityKey} must be a string array.`);
    }
    return [...value];
  }

  if (typeof value !== "string") {
    throw new Error(`Field "${field.key}" for entity ${entityKey} must be a string.`);
  }
  return value;
}

function resolveEntityInput(entity: RoleEntityDefinition, input: Record<string, unknown>): Record<string, string | string[]> {
  const resolved: Record<string, string | string[]> = {};
  for (const field of entity.fields) {
    const normalizedValue = normalizeEntityFieldValue(entity.key, field, input[field.key]);
    if (normalizedValue !== undefined) {
      resolved[field.key] = normalizedValue;
    }
  }
  return resolved;
}

async function getNextSequencedEntityNumber(role: RoleDefinition, entity: RoleEntityDefinition): Promise<number> {
  const year = new Date().getFullYear();
  const scanDirectories = entity.scanDirectories ?? [entity.createDirectory];
  const names = (await Promise.all(scanDirectories.map((directory) => listDirectoryNames(path.join(role.entitiesDir, directory))))).flat();
  const values = names
    .map((name) => {
      const match = name.match(/^([a-z]+)-(\d{4})-(\d{4})-/);
      if (!match) {
        return undefined;
      }

      return Number(match[2]) === year ? Number(match[3]) : undefined;
    })
    .filter((value): value is number => value !== undefined);

  return (values.length > 0 ? Math.max(...values) : 0) + 1;
}

async function makeRoleEntityId(role: RoleDefinition, entity: RoleEntityDefinition, input: Record<string, unknown>): Promise<string> {
  if (entity.idStrategy === "singleton") {
    return "";
  }

  const sourceValue = joinFieldValues(input, entity.idSourceFields);
  const slug = makeSlug(sourceValue);
  if (!slug) {
    throw new Error(`Entity ${entity.key} could not generate an ID because its source fields are empty.`);
  }
  const prefix = entity.idPrefix ?? entity.key;

  if (entity.idStrategy === "prefixed-slug") {
    return `${prefix}-${slug}`;
  }

  const year = new Date().getFullYear();
  const sequence = await getNextSequencedEntityNumber(role, entity);
  return `${prefix}-${year}-${String(sequence).padStart(ENTITY_SEQUENCE_WIDTH, "0")}-${slug}`;
}

async function renderEntityTemplate(
  role: RoleDefinition,
  relativeTemplatePath: string,
  values: Record<string, string>,
): Promise<string> {
  return renderTemplate(path.join(role.entityDefsDir, relativeTemplatePath), values);
}

async function ensureAgentFiles(
  workspaceRoot: string,
  agentRoot: string,
  values: {
    roleId: string;
    roleName: string;
    roleAgentName: string;
    roleInboxName: string;
    roleDescription: string;
    roleRoot: string;
  },
): Promise<void> {
  const agentFiles = [
    {
      relativePath: "record.md",
      template: "templates/agent/record.md",
    },
    {
      relativePath: "inbox.md",
      template: "templates/agent/inbox.md",
    },
  ] as const;

  await fs.mkdir(agentRoot, { recursive: true });

  await Promise.all(
    agentFiles.map(async (file) => {
      const filePath = path.join(agentRoot, file.relativePath);
      if (!(await fileExists(filePath))) {
        await fs.writeFile(
          filePath,
          await renderSharedPromptTemplate(workspaceRoot, file.template, {
            ...values,
            updatedAt: new Date().toISOString(),
            sourceRefsYaml: renderYamlList(["workspace default scaffold"]),
          }),
          "utf8",
        );
      }
    }),
  );
}

export async function writeFileSafely(filePath: string, content: string, force = false): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  if (!force && await fileExists(filePath)) {
    throw new Error(`Refusing to overwrite existing file: ${filePath}`);
  }

  await fs.writeFile(filePath, content, "utf8");
}

export async function ensureWorkspaceScaffold(root: string, role?: RoleDefinition): Promise<void> {
  await ensureDirectory(root, [...SHARED_ROOT_DIRECTORIES]);
  await ensureAgentFiles(root, path.join(root, HERMIT_ROLE_ROOT, "agent"), {
    roleId: HERMIT_ROLE_ID,
    roleName: HERMIT_ROLE_ID,
    roleAgentName: `${HERMIT_ROLE_ID} Agent`,
    roleInboxName: `${HERMIT_ROLE_ID} Agent Inbox`,
    roleDescription: "Stewardship of the Hermit framework, runtime, prompts, docs, and workspace operating model.",
    roleRoot: HERMIT_ROLE_ROOT,
  });

  if (!role) {
    return;
  }

  const entityDirectories = new Set<string>();
  for (const entity of role.entities) {
    entityDirectories.add(entity.createDirectory);
    for (const scanDir of entity.scanDirectories ?? []) {
      entityDirectories.add(scanDir);
    }
  }
  await ensureDirectory(role.entitiesDir, [...entityDirectories]);

  await ensureDirectory(role.roleDir, [
    "agent",
    "prompts",
    "skills",
    ".role-agent/sessions",
    ".role-agent/heartbeat-sessions",
    ...role.roleDirectories,
  ]);

  const roleRootRelative = path.relative(root, role.roleDir) || ".";
  await ensureAgentFiles(role.root, path.join(role.roleDir, "agent"), {
    roleId: role.id,
    roleName: role.name,
    roleAgentName: `${role.name} Agent`,
    roleInboxName: `${role.name} Agent Inbox`,
    roleDescription: role.description,
    roleRoot: roleRootRelative,
  });
}

export async function getWorkspaceInitializationState(root: string, role?: RoleDefinition): Promise<WorkspaceInitializationState> {
  if (!role) {
    const [sharedEntities, roleIds] = await Promise.all([
      scanDirectoryForEntities(getWorkspacePaths(root).entitiesDir, "shared"),
      listRoleIds(root),
    ]);
    return {
      initialized: sharedEntities.length > 0 || roleIds.length > 0,
      sharedEntityCount: sharedEntities.length,
      roleEntityCount: 0,
      roleEntityCounts: {},
    };
  }

  const [sharedEntities, roleEntities] = await Promise.all([scanSharedEntities(root, role), scanRoleEntities(role)]);
  const roleEntityCounts = Object.fromEntries(
    role.entities.map((entity) => [entity.key, roleEntities.filter((record) => record.type === entity.type).length]),
  );
  const roleEntityCount = role.entities
    .filter((entity) => entity.includeInInitialization !== false)
    .reduce((count, entity) => count + (roleEntityCounts[entity.key] ?? 0), 0);

  return {
    initialized: sharedEntities.length > 0 || roleEntityCount > 0,
    sharedEntityCount: sharedEntities.length,
    roleEntityCount,
    roleEntityCounts,
  };
}

async function readEntityRecord(
  recordPath: string,
  scope: "shared" | "role",
  roleId?: string,
): Promise<EntityRecord[]> {
  try {
    const content = await fs.readFile(recordPath, "utf8");
    const parsed = matter(content);
    const data = parsed.data as Record<string, unknown>;
    const entityPath = path.dirname(recordPath);

    return [
      {
        id: String(data.id ?? path.basename(entityPath)),
        type: String(data.type ?? "unknown"),
        name: String(data.name ?? path.basename(entityPath)),
        path: entityPath,
        scope,
        ...(roleId ? { roleId } : {}),
        ...(data.status ? { status: String(data.status) } : {}),
        ...(data.owner ? { owner: String(data.owner) } : {}),
      } satisfies EntityRecord,
    ];
  } catch (error) {
    throw new Error(`Failed to read entity record ${recordPath}: ${formatErrorMessage(error)}`);
  }
}

async function scanDirectoryForEntities(
  directory: string,
  scope: "shared" | "role",
  roleId?: string,
  options: { excludeDirectoryNames?: readonly string[] } = {},
): Promise<EntityRecord[]> {
  try {
    const recordPath = path.join(directory, "record.md");
    if (await fileExists(recordPath)) {
      return readEntityRecord(recordPath, scope, roleId);
    }

    const entries = await fs.readdir(directory, { withFileTypes: true });
    const entityGroups = await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isDirectory() || (options.excludeDirectoryNames ?? []).includes(entry.name)) {
          return [];
        }

        const childDirectory = path.join(directory, entry.name);
        return scanDirectoryForEntities(childDirectory, scope, roleId, options);
      }),
    );

    return entityGroups.flat();
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw new Error(`Failed to scan entities in ${directory}: ${formatErrorMessage(error)}`);
  }
}

function dedupeEntitiesByPath(entities: EntityRecord[]): EntityRecord[] {
  return [...new Map(entities.map((entity) => [entity.path, entity])).values()];
}

function getRoleEntityRootNames(role: RoleDefinition): Set<string> {
  return new Set(
    role.entities
      .flatMap((entity) => [entity.createDirectory, ...(entity.scanDirectories ?? [])])
      .map((directory) => directory.split(path.sep)[0])
      .filter((directory): directory is string => Boolean(directory)),
  );
}

async function getSharedEntityDirectories(root: string, role: RoleDefinition): Promise<string[]> {
  const entitiesDir = getWorkspacePaths(root).entitiesDir;
  const excludedRootNames = getRoleEntityRootNames(role);

  try {
    const entries = await fs.readdir(entitiesDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !excludedRootNames.has(entry.name))
      .map((entry) => path.join(entitiesDir, entry.name));
  } catch (error) {
    if (isMissingPathError(error)) {
      return [];
    }
    throw new Error(`Failed to list shared entity directories in ${entitiesDir}: ${formatErrorMessage(error)}`);
  }
}

async function scanSharedEntities(root: string, role: RoleDefinition): Promise<EntityRecord[]> {
  const directories = await getSharedEntityDirectories(root, role);
  const entities = await Promise.all(directories.map((directory) => scanDirectoryForEntities(directory, "shared")));
  return entities.flat();
}

async function scanRoleEntities(role: RoleDefinition): Promise<EntityRecord[]> {
  const entities = await Promise.all(
    role.entities.flatMap((entity) =>
      (entity.scanDirectories ?? [entity.createDirectory]).map((directory) =>
        scanDirectoryForEntities(
          path.join(role.entitiesDir, directory),
          "role",
          role.id,
          entity.excludeDirectoryNames ? { excludeDirectoryNames: entity.excludeDirectoryNames } : {},
        ),
      ),
    ),
  );

  return dedupeEntitiesByPath(entities.flat());
}

function filterEntitiesByType(entities: EntityRecord[], entityType: string): EntityRecord[] {
  return entities.filter((entity) => entity.type === entityType);
}

export async function scanEntities(root: string, role: RoleDefinition): Promise<EntityRecord[]> {
  const entities = [...(await scanSharedEntities(root, role)), ...(await scanRoleEntities(role))];
  return entities.sort((left, right) => left.name.localeCompare(right.name));
}

export async function scanEntitiesByDefinition(root: string, entity: RoleEntityDefinition): Promise<EntityRecord[]> {
  const entitiesDir = getWorkspacePaths(root).entitiesDir;
  if (entity.idStrategy === "singleton") {
    const recordPath = path.join(entitiesDir, entity.createDirectory, "record.md");
    if (!(await fileExists(recordPath))) {
      return [];
    }
    return readEntityRecord(recordPath, "shared");
  }

  const directories = entity.scanDirectories ?? [entity.createDirectory];
  const entityGroups = await Promise.all(
    directories.map((directory) =>
      scanDirectoryForEntities(
        path.join(entitiesDir, directory),
        "shared",
        undefined,
        entity.excludeDirectoryNames ? { excludeDirectoryNames: entity.excludeDirectoryNames } : {},
      ),
    ),
  );

  return dedupeEntitiesByPath(entityGroups.flat()).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

export async function countEntitiesByDefinition(root: string, entity: RoleEntityDefinition): Promise<number> {
  return (await scanEntitiesByDefinition(root, entity)).length;
}

export async function findEntityById(root: string, role: RoleDefinition, entityId: string): Promise<EntityRecord | undefined> {
  const entities = await scanEntities(root, role);
  return entities.find((entity) => entity.id === entityId);
}

export async function findEntitiesByType(root: string, role: RoleDefinition, entityType: string): Promise<EntityRecord[]> {
  return filterEntitiesByType(await scanEntities(root, role), entityType);
}

function buildRoleEntityPath(role: RoleDefinition, entity: RoleEntityDefinition, entityId: string): string {
  return path.join(role.entitiesDir, entity.createDirectory, entityId);
}

export async function createRoleEntityRecord(
  role: RoleDefinition,
  entityKey: string,
  input: Record<string, unknown>,
  options: CreateEntityOptions = {},
): Promise<{ id: string; path: string }> {
  const entity = role.entities.find((item) => item.key === entityKey);
  if (!entity) {
    throw new Error(`Unknown role entity key: ${entityKey}`);
  }

  const normalizedInput = resolveEntityInput(entity, input);
  const entityId = await makeRoleEntityId(role, entity, normalizedInput);
  const entityPath = buildRoleEntityPath(role, entity, entityId);
  const sourceRefs = options.sourceRefs ?? ["bootstrap questionnaire"];
  const entityName = renderNameTemplate(entity, normalizedInput);
  const status = entity.statusField ? String(normalizedInput[entity.statusField] ?? "") : "active";
  const owner = entity.ownerField ? String(normalizedInput[entity.ownerField] ?? "") : role.name;
  const values = {
    ...buildFieldContext(normalizedInput),
    id: entityId,
    type: entity.type,
    name: entityName,
    status: status || (entity.statusField ? "" : "active"),
    owner,
    updatedAt: new Date().toISOString(),
    sourceRefsYaml: renderYamlList(sourceRefs),
    entityDisplayName: entityName,
    sourceRef: sourceRefs[0] ?? "bootstrap questionnaire",
  };

  await ensureDirectory(entityPath, entity.extraDirectories ?? []);
  await Promise.all(
    entity.files.map(async (file) => {
      await writeFileSafely(
        path.join(entityPath, file.path),
        await renderEntityTemplate(role, file.template, values),
        options.force,
      );
    }),
  );

  return {
    id: entityId,
    path: entityPath,
  };
}
