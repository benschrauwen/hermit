/**
 * Resolves the Hermit workspace root (repo root with agents/, entities/, etc.).
 * Prefer WORKSPACE_ROOT when provided. Otherwise search upward from likely runtime
 * locations until a directory containing the Hermit workspace markers is found.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  EntityRecord,
  RoleDefinition,
  RoleEntityDefinition,
  RoleExplorerConfig,
} from "../../../src/types.js";
import {
  listRoleIds as listRoleIdsFromWorkspace,
  loadRole as loadRoleFromWorkspace,
  loadEntityDefs as loadEntityDefsFromWorkspace,
} from "../../../src/roles.ts";
import {
  scanEntities as scanEntitiesFromWorkspace,
  findEntityById as findEntityByIdFromWorkspace,
  findEntitiesByType as findEntitiesByTypeFromWorkspace,
  scanEntitiesByDefinition as scanEntitiesByDefinitionFromWorkspace,
  countEntitiesByDefinition as countEntitiesByDefinitionFromWorkspace,
} from "../../../src/workspace.ts";

export type { EntityRecord, RoleDefinition, RoleEntityDefinition, RoleExplorerConfig };

export function importWithNode(specifier: string): Promise<unknown> {
  return new Function("moduleSpecifier", "return import(moduleSpecifier);")(specifier) as Promise<unknown>;
}

function isWorkspaceRoot(candidate: string): boolean {
  return ["agents", "entities", "entity-defs", "src"].every((entry) => existsSync(path.join(candidate, entry)));
}

function searchUpForWorkspaceRoot(startDir: string): string | undefined {
  let current = path.resolve(startDir);
  while (true) {
    if (isWorkspaceRoot(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function getWorkspaceRoot(): string {
  if (process.env.WORKSPACE_ROOT) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    moduleDir,
    path.resolve(moduleDir, ".."),
    path.resolve(moduleDir, "../.."),
    path.resolve(moduleDir, "../../.."),
    path.resolve(moduleDir, "../../../.."),
    path.resolve(moduleDir, "../../../../.."),
  ];

  for (const candidate of candidates) {
    const found = searchUpForWorkspaceRoot(candidate);
    if (found) {
      return found;
    }
  }

  return process.cwd();
}

export async function listRoleIds(root: string): Promise<string[]> {
  return listRoleIdsFromWorkspace(root);
}

export async function loadRole(root: string, roleId: string): Promise<RoleDefinition> {
  return loadRoleFromWorkspace(root, roleId);
}

export async function loadEntityDefs(root: string): Promise<{
  entities: RoleEntityDefinition[];
  explorer?: RoleExplorerConfig;
}> {
  return loadEntityDefsFromWorkspace(root);
}

export async function scanEntities(root: string, role: RoleDefinition): Promise<EntityRecord[]> {
  return scanEntitiesFromWorkspace(root, role);
}

export async function findEntityById(
  root: string,
  role: RoleDefinition,
  entityId: string
): Promise<EntityRecord | undefined> {
  return findEntityByIdFromWorkspace(root, role, entityId);
}

export async function findEntitiesByType(
  root: string,
  role: RoleDefinition,
  entityType: string
): Promise<EntityRecord[]> {
  return findEntitiesByTypeFromWorkspace(root, role, entityType);
}

export async function scanEntitiesByDefinition(root: string, entity: RoleEntityDefinition): Promise<EntityRecord[]> {
  return scanEntitiesByDefinitionFromWorkspace(root, entity);
}

export async function countEntitiesByDefinition(root: string, entity: RoleEntityDefinition): Promise<number> {
  return countEntitiesByDefinitionFromWorkspace(root, entity);
}
