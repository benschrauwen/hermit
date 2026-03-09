import { promises as fs } from "node:fs";
import path from "node:path";

import { readEntityFrontmatter } from "./entity-content.js";
import type { EntityRecord, RoleEntityDefinition } from "./workspace.js";

export function getEntityTypeHref(entityDef: RoleEntityDefinition): string {
  if (entityDef.type === "company") {
    return "/company";
  }
  if (entityDef.type === "person") {
    return "/people";
  }
  return `/entities/${entityDef.type}`;
}

async function listEntityDirectories(
  directory: string,
  options: { excludeDirectoryNames?: readonly string[] } = {},
): Promise<string[]> {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          !(options.excludeDirectoryNames ?? []).includes(entry.name),
      )
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function dedupeByPath(entities: EntityRecord[]): EntityRecord[] {
  return [...new Map(entities.map((entity) => [entity.path, entity])).values()];
}

export async function scanGlobalEntitiesByDefinition(
  root: string,
  entityDef: RoleEntityDefinition,
): Promise<EntityRecord[]> {
  if (entityDef.idStrategy === "singleton") {
    return [];
  }

  const directories = entityDef.scanDirectories ?? [entityDef.createDirectory];
  const records = await Promise.all(
    directories.map(async (relativeDirectory) => {
      const absoluteDirectory = path.join(root, "entities", relativeDirectory);
      const names = await listEntityDirectories(absoluteDirectory, {
        excludeDirectoryNames: entityDef.excludeDirectoryNames,
      });

      return Promise.all(
        names.map(async (directoryName) => {
          const entityPath = path.join(absoluteDirectory, directoryName);
          const frontmatter = await readEntityFrontmatter(entityPath);
          return {
            id: String(frontmatter.id ?? directoryName),
            type: String(frontmatter.type ?? entityDef.type),
            name: String(frontmatter.name ?? directoryName),
            path: entityPath,
            scope: "shared",
            ...(entityDef.statusField && frontmatter[entityDef.statusField]
              ? { status: String(frontmatter[entityDef.statusField]) }
              : {}),
            ...(entityDef.ownerField && frontmatter[entityDef.ownerField]
              ? { owner: String(frontmatter[entityDef.ownerField]) }
              : {}),
          } satisfies EntityRecord;
        }),
      );
    }),
  );

  return dedupeByPath(records.flat()).sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
  );
}

export async function countGlobalEntitiesByDefinition(
  root: string,
  entityDef: RoleEntityDefinition,
): Promise<number> {
  if (entityDef.idStrategy === "singleton") {
    try {
      await fs.access(path.join(root, "entities", entityDef.createDirectory, "record.md"));
      return 1;
    } catch {
      return 0;
    }
  }

  return (await scanGlobalEntitiesByDefinition(root, entityDef)).length;
}
