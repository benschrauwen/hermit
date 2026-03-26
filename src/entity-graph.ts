import matter from "gray-matter";
import { promises as fs } from "node:fs";
import path from "node:path";

import { formatErrorMessage } from "./fs-utils.js";
import type { EntityRecord, RoleDefinition, RoleEntityDefinition } from "./types.js";
import { scanEntities } from "./workspace.js";

export type EntityGraphDirection = "outgoing" | "incoming" | "both";

export interface EntityGraphNode extends EntityRecord {
  recordPath: string;
  frontmatter: Record<string, unknown>;
}

export interface EntityGraphEdge {
  id: string;
  type: string;
  sourceId: string;
  targetId: string;
  sourceType: string;
  targetType: string;
  sourceField: string;
  declaredOnType: string;
  reverse: boolean;
}

export interface EntityGraphBrokenReference {
  sourceId: string;
  sourceType: string;
  sourceField: string;
  edgeType: string;
  targetId: string;
  expectedTargetType: string;
  actualTargetType?: string;
  reason: "missing-target" | "wrong-target-type";
}

export interface EntityGraphNeighbor {
  node: EntityGraphNode;
  edge: EntityGraphEdge;
  direction: "outgoing" | "incoming";
}

export interface EntityGraphPath {
  nodeIds: string[];
  edges: EntityGraphEdge[];
}

export interface EntitySubgraph {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
}

export interface EntityGraph {
  nodes: EntityGraphNode[];
  edges: EntityGraphEdge[];
  brokenReferences: EntityGraphBrokenReference[];
  nodeById: Map<string, EntityGraphNode>;
  outgoing: Map<string, EntityGraphEdge[]>;
  incoming: Map<string, EntityGraphEdge[]>;
}

interface TraversalOptions {
  direction?: EntityGraphDirection;
  edgeTypes?: readonly string[];
}

interface TraversalStep {
  edge: EntityGraphEdge;
  nextNodeId: string;
  direction: "outgoing" | "incoming";
}

function normalizeFrontmatter(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

async function readGraphNode(entity: EntityRecord): Promise<EntityGraphNode> {
  const recordPath = path.join(entity.path, "record.md");
  try {
    const content = await fs.readFile(recordPath, "utf8");
    const parsed = matter(content);
    return {
      ...entity,
      recordPath,
      frontmatter: normalizeFrontmatter(parsed.data),
    };
  } catch (error) {
    throw new Error(`Failed to read entity graph node ${recordPath}: ${formatErrorMessage(error)}`);
  }
}

function normalizeReferenceTargets(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )];
}

function sortNodes(nodes: EntityGraphNode[]): EntityGraphNode[] {
  return [...nodes].sort(
    (left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
      || left.type.localeCompare(right.type)
      || left.id.localeCompare(right.id),
  );
}

function sortEdges(edges: EntityGraphEdge[]): EntityGraphEdge[] {
  return [...edges].sort(
    (left, right) =>
      left.sourceId.localeCompare(right.sourceId)
      || left.type.localeCompare(right.type)
      || left.targetId.localeCompare(right.targetId)
      || left.sourceField.localeCompare(right.sourceField)
      || Number(left.reverse) - Number(right.reverse),
  );
}

function sortBrokenReferences(references: EntityGraphBrokenReference[]): EntityGraphBrokenReference[] {
  return [...references].sort(
    (left, right) =>
      left.sourceId.localeCompare(right.sourceId)
      || left.edgeType.localeCompare(right.edgeType)
      || left.targetId.localeCompare(right.targetId)
      || left.reason.localeCompare(right.reason),
  );
}

function getDuplicateEntityIds(entities: EntityRecord[]): string[] {
  const counts = new Map<string, number>();
  for (const entity of entities) {
    counts.set(entity.id, (counts.get(entity.id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort((left, right) => left.localeCompare(right));
}

function addIndexedEdge(
  index: Map<string, EntityGraphEdge[]>,
  nodeId: string,
  edge: EntityGraphEdge,
): void {
  index.set(nodeId, sortEdges([...(index.get(nodeId) ?? []), edge]));
}

function indexEdges(edges: EntityGraphEdge[]): {
  outgoing: Map<string, EntityGraphEdge[]>;
  incoming: Map<string, EntityGraphEdge[]>;
} {
  const outgoing = new Map<string, EntityGraphEdge[]>();
  const incoming = new Map<string, EntityGraphEdge[]>();
  for (const edge of edges) {
    addIndexedEdge(outgoing, edge.sourceId, edge);
    addIndexedEdge(incoming, edge.targetId, edge);
  }
  return { outgoing, incoming };
}

function edgeTypeMatches(edge: EntityGraphEdge, edgeTypeFilter?: ReadonlySet<string>): boolean {
  return !edgeTypeFilter || edgeTypeFilter.has(edge.type);
}

function getEdgeTypeFilter(edgeTypes?: readonly string[]): ReadonlySet<string> | undefined {
  if (!edgeTypes || edgeTypes.length === 0) {
    return undefined;
  }
  const normalized = edgeTypes
    .map((edgeType) => edgeType.trim())
    .filter((edgeType) => edgeType.length > 0);
  return normalized.length > 0 ? new Set(normalized) : undefined;
}

function getTraversalSteps(
  graph: EntityGraph,
  entityId: string,
  options: TraversalOptions = {},
): TraversalStep[] {
  const direction = options.direction ?? "both";
  const edgeTypeFilter = getEdgeTypeFilter(options.edgeTypes);
  const steps: TraversalStep[] = [];

  if (direction === "outgoing" || direction === "both") {
    for (const edge of graph.outgoing.get(entityId) ?? []) {
      if (edgeTypeMatches(edge, edgeTypeFilter)) {
        steps.push({ edge, nextNodeId: edge.targetId, direction: "outgoing" });
      }
    }
  }
  if (direction === "incoming" || direction === "both") {
    for (const edge of graph.incoming.get(entityId) ?? []) {
      if (edgeTypeMatches(edge, edgeTypeFilter)) {
        steps.push({ edge, nextNodeId: edge.sourceId, direction: "incoming" });
      }
    }
  }

  return steps.sort(
    (left, right) =>
      left.nextNodeId.localeCompare(right.nextNodeId)
      || left.edge.type.localeCompare(right.edge.type)
      || left.direction.localeCompare(right.direction),
  );
}

function getDefinitionByType(role: RoleDefinition): Map<string, RoleEntityDefinition> {
  return new Map(role.entities.map((entity) => [entity.type, entity]));
}

export async function buildEntityGraph(root: string, role: RoleDefinition): Promise<EntityGraph> {
  const entityRecords = await scanEntities(root, role);
  const duplicateIds = getDuplicateEntityIds(entityRecords);
  if (duplicateIds.length > 0) {
    throw new Error(`Cannot build entity graph with duplicate entity IDs: ${duplicateIds.join(", ")}`);
  }

  const nodes = sortNodes(await Promise.all(entityRecords.map((entity) => readGraphNode(entity))));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const definitionByType = getDefinitionByType(role);
  const edges: EntityGraphEdge[] = [];
  const brokenReferences: EntityGraphBrokenReference[] = [];

  for (const node of nodes) {
    const definition = definitionByType.get(node.type);
    if (!definition?.relationships?.length) {
      continue;
    }

    for (const relationship of definition.relationships) {
      for (const targetId of normalizeReferenceTargets(node.frontmatter[relationship.sourceField])) {
        const targetNode = nodeById.get(targetId);
        if (!targetNode) {
          brokenReferences.push({
            sourceId: node.id,
            sourceType: node.type,
            sourceField: relationship.sourceField,
            edgeType: relationship.edgeType,
            targetId,
            expectedTargetType: relationship.targetType,
            reason: "missing-target",
          });
          continue;
        }
        if (targetNode.type !== relationship.targetType) {
          brokenReferences.push({
            sourceId: node.id,
            sourceType: node.type,
            sourceField: relationship.sourceField,
            edgeType: relationship.edgeType,
            targetId,
            expectedTargetType: relationship.targetType,
            actualTargetType: targetNode.type,
            reason: "wrong-target-type",
          });
          continue;
        }

        edges.push({
          id: `${node.id}:${relationship.edgeType}:${relationship.sourceField}:${targetId}:forward`,
          type: relationship.edgeType,
          sourceId: node.id,
          targetId,
          sourceType: node.type,
          targetType: targetNode.type,
          sourceField: relationship.sourceField,
          declaredOnType: node.type,
          reverse: false,
        });

        if (relationship.reverseEdgeType) {
          edges.push({
            id: `${targetId}:${relationship.reverseEdgeType}:${relationship.sourceField}:${node.id}:reverse`,
            type: relationship.reverseEdgeType,
            sourceId: targetId,
            targetId: node.id,
            sourceType: targetNode.type,
            targetType: node.type,
            sourceField: relationship.sourceField,
            declaredOnType: node.type,
            reverse: true,
          });
        }
      }
    }
  }

  const sortedEdges = sortEdges(edges);
  const indexedEdges = indexEdges(sortedEdges);

  return {
    nodes,
    edges: sortedEdges,
    brokenReferences: sortBrokenReferences(brokenReferences),
    nodeById,
    outgoing: indexedEdges.outgoing,
    incoming: indexedEdges.incoming,
  };
}

export function getEntityGraphNeighbors(
  graph: EntityGraph,
  entityId: string,
  options: TraversalOptions = {},
): EntityGraphNeighbor[] {
  return getTraversalSteps(graph, entityId, options)
    .map((step) => {
      const node = graph.nodeById.get(step.nextNodeId);
      return node ? { node, edge: step.edge, direction: step.direction } : undefined;
    })
    .filter((neighbor): neighbor is EntityGraphNeighbor => neighbor !== undefined)
    .sort(
      (left, right) =>
        left.node.name.localeCompare(right.node.name, undefined, { sensitivity: "base" })
        || left.edge.type.localeCompare(right.edge.type)
        || left.direction.localeCompare(right.direction),
    );
}

export function collectEntitySubgraph(
  graph: EntityGraph,
  seedIds: readonly string[],
  options: TraversalOptions & { depth?: number } = {},
): EntitySubgraph {
  const depth = Math.max(0, options.depth ?? 1);
  const seeds = [...new Set(seedIds.filter((entityId) => graph.nodeById.has(entityId)))];
  const visitedNodes = new Set(seeds);
  const includedEdges = new Map<string, EntityGraphEdge>();
  const queue = seeds.map((entityId) => ({ entityId, depth: 0 }));

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth >= depth) {
      continue;
    }

    for (const step of getTraversalSteps(graph, current.entityId, options)) {
      includedEdges.set(step.edge.id, step.edge);
      if (visitedNodes.has(step.nextNodeId)) {
        continue;
      }
      visitedNodes.add(step.nextNodeId);
      queue.push({ entityId: step.nextNodeId, depth: current.depth + 1 });
    }
  }

  return {
    nodes: sortNodes([...visitedNodes].flatMap((entityId) => {
      const node = graph.nodeById.get(entityId);
      return node ? [node] : [];
    })),
    edges: sortEdges([...includedEdges.values()]),
  };
}

export function findEntityGraphPath(
  graph: EntityGraph,
  fromId: string,
  toId: string,
  options: TraversalOptions & { maxDepth?: number } = {},
): EntityGraphPath | undefined {
  if (!graph.nodeById.has(fromId) || !graph.nodeById.has(toId)) {
    return undefined;
  }

  const maxDepth = Math.max(0, options.maxDepth ?? 6);
  const visited = new Set<string>([fromId]);
  const queue: Array<{ entityId: string; nodeIds: string[]; edges: EntityGraphEdge[] }> = [
    { entityId: fromId, nodeIds: [fromId], edges: [] },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    if (current.entityId === toId) {
      return {
        nodeIds: current.nodeIds,
        edges: current.edges,
      };
    }
    if (current.edges.length >= maxDepth) {
      continue;
    }

    for (const step of getTraversalSteps(graph, current.entityId, options)) {
      if (visited.has(step.nextNodeId)) {
        continue;
      }
      visited.add(step.nextNodeId);
      queue.push({
        entityId: step.nextNodeId,
        nodeIds: [...current.nodeIds, step.nextNodeId],
        edges: [...current.edges, step.edge],
      });
    }
  }

  return undefined;
}
