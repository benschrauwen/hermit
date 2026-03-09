/**
 * Resolves the leadership workspace root (repo root with agents/, entities/, etc.).
 * Use WORKSPACE_ROOT env when running explorer from repo root; otherwise
 * defaults to parent of explorer dir when cwd is explorer.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function getWorkspaceRoot(): string {
  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }
  const cwd = process.cwd();
  const dir = path.basename(cwd);
  if (dir === "explorer") {
    return path.resolve(cwd, "..");
  }
  return cwd;
}


export interface EntityRecord {
  id: string;
  type: string;
  name: string;
  path: string;
  scope: "shared" | "role";
  roleId?: string;
  status?: string;
  owner?: string;
}

export interface RoleEntityDefinition {
  key: string;
  label: string;
  type: string;
  createDirectory: string;
  scanDirectories?: string[];
  excludeDirectoryNames?: string[];
  idStrategy: "prefixed-slug" | "year-sequence-slug" | "singleton";
  idPrefix?: string;
  idSourceFields: string[];
  nameTemplate: string;
  statusField?: string;
  ownerField?: string;
  includeInInitialization?: boolean;
  extraDirectories?: string[];
  fields: Array<{ key: string; label: string; type: string }>;
  files: Array<{ path: string; template: string }>;
}

export interface RoleExplorerRendererConfig {
  detail?: Record<string, string>;
  files?: Record<string, Record<string, string>>;
}

export interface RoleExplorerConfig {
  renderers?: RoleExplorerRendererConfig;
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  roleDir: string;
  entities: RoleEntityDefinition[];
  explorer?: RoleExplorerConfig;
}

type RolesModule = {
  listRoleIds: (root: string) => Promise<string[]>;
  loadRole: (root: string, roleId: string) => Promise<RoleDefinition>;
  loadEntityDefs: (root: string) => Promise<{
    entities: RoleEntityDefinition[];
    explorer?: RoleExplorerConfig;
  }>;
};
type WorkspaceModule = {
  scanEntities: (root: string, role: RoleDefinition) => Promise<EntityRecord[]>;
  findEntityById: (root: string, role: RoleDefinition, entityId: string) => Promise<EntityRecord | undefined>;
  findEntitiesByType: (root: string, role: RoleDefinition, entityType: string) => Promise<EntityRecord[]>;
};

let rolesMod: RolesModule | null = null;
let workspaceMod: WorkspaceModule | null = null;

function importWithNode(specifier: string): Promise<unknown> {
  return new Function("moduleSpecifier", "return import(moduleSpecifier);")(specifier) as Promise<unknown>;
}

async function loadRolesModule(root: string): Promise<RolesModule> {
  if (rolesMod) return rolesMod;
  const rolesPath = path.resolve(root, "dist", "roles.js");
  if (!existsSync(rolesPath)) {
    throw new Error(
      `Workspace dist not found at ${rolesPath}. Run "bun run build" from the workspace root.`
    );
  }
  const mod = await importWithNode(pathToFileURL(rolesPath).href);
  rolesMod = mod as RolesModule;
  return rolesMod;
}

async function loadWorkspaceModule(root: string): Promise<WorkspaceModule> {
  if (workspaceMod) return workspaceMod;
  const workspacePath = path.resolve(root, "dist", "workspace.js");
  if (!existsSync(workspacePath)) {
    throw new Error(
      `Workspace dist not found at ${workspacePath}. Run "bun run build" from the workspace root.`
    );
  }
  const mod = await importWithNode(pathToFileURL(workspacePath).href);
  workspaceMod = mod as WorkspaceModule;
  return workspaceMod;
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
