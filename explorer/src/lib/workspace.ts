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

function getWorkspaceRootScore(candidate: string): number {
  let score = 0;

  if (existsSync(path.join(candidate, "agents"))) score += 1;
  if (existsSync(path.join(candidate, "entities"))) score += 1;
  if (existsSync(path.join(candidate, "entity-defs"))) score += 1;
  if (existsSync(path.join(candidate, "src"))) score += 1;

  if (existsSync(path.join(candidate, "entity-defs", "entities.md"))) score += 4;
  if (existsSync(path.join(candidate, "src", "roles.ts"))) score += 3;
  if (existsSync(path.join(candidate, "src", "workspace.ts"))) score += 3;
  if (existsSync(path.join(candidate, "entities", "site", "record.md"))) score += 2;
  if (existsSync(path.join(candidate, "agents", "website", "role.md"))) score += 2;

  return score;
}

function searchUpForWorkspaceRoot(startDir: string): { root?: string; score: number } {
  let current = path.resolve(startDir);
  let best: { root?: string; score: number } = { score: -1 };

  while (true) {
    const score = getWorkspaceRootScore(current);
    if (score > best.score) {
      best = { root: current, score };
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return best;
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

  let best: { root?: string; score: number } = { score: -1 };

  for (const candidate of candidates) {
    const found = searchUpForWorkspaceRoot(candidate);
    if (found.score > best.score) {
      best = found;
    }
  }

  if (best.root && best.score >= 8) {
    return best.root;
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
