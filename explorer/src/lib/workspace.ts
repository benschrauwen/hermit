/**
 * Resolves the Hermit workspace root (repo root with agents/, entities/, etc.).
 * Use WORKSPACE_ROOT env when running from the framework repo; otherwise
 * defaults to a sibling workspace path when cwd is explorer.
 */
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  EntityRecord,
  RoleDefinition,
  RoleEntityDefinition,
  RoleExplorerConfig,
} from "../../../src/types.js";

export type { EntityRecord, RoleDefinition, RoleEntityDefinition, RoleExplorerConfig };

export function getWorkspaceRoot(): string {
  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }
  const cwd = process.cwd();
  const dir = path.basename(cwd);
  if (dir === "explorer") {
    return path.resolve(cwd, "..", "workspace");
  }
  return path.resolve(cwd, "workspace");
}

export function getFrameworkRoot(): string {
  if (process.env.FRAMEWORK_ROOT) {
    return path.resolve(process.env.FRAMEWORK_ROOT);
  }
  const cwd = process.cwd();
  const dir = path.basename(cwd);
  if (dir === "explorer") {
    return path.resolve(cwd, "..");
  }
  return cwd;
}

type RolesModule = Pick<typeof import("../../../src/roles.js"), "listRoleIds" | "loadRole" | "loadEntityDefs">;
type WorkspaceModule = Pick<
  typeof import("../../../src/workspace.js"),
  "scanEntities" | "findEntityById" | "findEntitiesByType" | "scanEntitiesByDefinition" | "countEntitiesByDefinition"
>;

const rolesModuleCache = new Map<string, { version: string; pending: Promise<RolesModule> }>();
const workspaceModuleCache = new Map<string, { version: string; pending: Promise<WorkspaceModule> }>();

export function importWithNode(specifier: string): Promise<unknown> {
  return new Function("moduleSpecifier", "return import(moduleSpecifier);")(specifier) as Promise<unknown>;
}

async function loadVersionedModule<TModule>(
  cache: Map<string, { version: string; pending: Promise<TModule> }>,
  absolutePath: string,
  missingMessage: string,
): Promise<TModule> {
  if (!existsSync(absolutePath)) {
    throw new Error(missingMessage);
  }

  const stat = await fs.stat(absolutePath);
  const version = String(stat.mtimeMs);
  const cached = cache.get(absolutePath);
  if (cached && cached.version === version) {
    return cached.pending;
  }

  const importUrl = new URL(pathToFileURL(absolutePath).href);
  importUrl.searchParams.set("v", version);
  const pending = importWithNode(importUrl.href).then((mod) => mod as TModule);
  cache.set(absolutePath, { version, pending });
  return pending;
}

async function loadRolesModule(_root: string): Promise<RolesModule> {
  const rolesPath = path.resolve(getFrameworkRoot(), "src", "roles.ts");
  return loadVersionedModule(
    rolesModuleCache,
    rolesPath,
    `Framework source not found at ${rolesPath}. Run the explorer from the Hermit framework checkout so it can load TypeScript sources via tsx.`
  );
}

async function loadWorkspaceModule(_root: string): Promise<WorkspaceModule> {
  const workspacePath = path.resolve(getFrameworkRoot(), "src", "workspace.ts");
  return loadVersionedModule(
    workspaceModuleCache,
    workspacePath,
    `Framework source not found at ${workspacePath}. Run the explorer from the Hermit framework checkout so it can load TypeScript sources via tsx.`
  );
}

export async function listRoleIds(root: string): Promise<string[]> {
  const mod = await loadRolesModule(root);
  return mod.listRoleIds(root);
}

export async function loadRole(root: string, roleId: string): Promise<RoleDefinition> {
  const mod = await loadRolesModule(root);
  return mod.loadRole(root, roleId);
}

export async function loadEntityDefs(root: string): Promise<{
  entities: RoleEntityDefinition[];
  explorer?: RoleExplorerConfig;
}> {
  const mod = await loadRolesModule(root);
  return mod.loadEntityDefs(root);
}

export async function scanEntities(root: string, role: RoleDefinition): Promise<EntityRecord[]> {
  const mod = await loadWorkspaceModule(root);
  return mod.scanEntities(root, role);
}

export async function findEntityById(
  root: string,
  role: RoleDefinition,
  entityId: string
): Promise<EntityRecord | undefined> {
  const mod = await loadWorkspaceModule(root);
  return mod.findEntityById(root, role, entityId);
}

export async function findEntitiesByType(
  root: string,
  role: RoleDefinition,
  entityType: string
): Promise<EntityRecord[]> {
  const mod = await loadWorkspaceModule(root);
  return mod.findEntitiesByType(root, role, entityType);
}

export async function scanEntitiesByDefinition(root: string, entity: RoleEntityDefinition): Promise<EntityRecord[]> {
  const mod = await loadWorkspaceModule(root);
  return mod.scanEntitiesByDefinition(root, entity);
}

export async function countEntitiesByDefinition(root: string, entity: RoleEntityDefinition): Promise<number> {
  const mod = await loadWorkspaceModule(root);
  return mod.countEntitiesByDefinition(root, entity);
}
