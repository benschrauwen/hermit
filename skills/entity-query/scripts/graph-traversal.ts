import type { EntityGraph, EntityGraphEdge, EntityGraphNode } from "../../../src/entity-graph.js";

export type EntityGraphDirection = "outgoing" | "incoming" | "both";

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

interface TraversalOptions {
  direction?: EntityGraphDirection;
  edgeTypes?: readonly string[];
}

interface TraversalStep {
  edge: EntityGraphEdge;
  nextNodeId: string;
  direction: "outgoing" | "incoming";
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
