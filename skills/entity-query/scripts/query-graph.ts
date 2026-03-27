#!/usr/bin/env -S node --import tsx
import process from "node:process";

import { buildEntityGraph, type EntityGraph } from "../../../src/entity-graph.js";
import {
  collectEntitySubgraph,
  findEntityGraphPath,
  getEntityGraphNeighbors,
  type EntityGraphDirection,
} from "./graph-traversal.ts";
import { resolveRole } from "../../../src/roles.js";
import {
  getNumberFlag,
  getStringFlag,
  parseArgs,
  printJson,
  resolveWorkspaceRoot,
} from "./entity-lib.ts";

type GraphQueryName = "summary" | "neighbors" | "subgraph" | "path" | "broken";
type GraphOutputFormat = "text" | "json";

function parseCsvFlag(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const values = value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  return values.length > 0 ? values : undefined;
}

function getDirectionFlag(value: string | undefined, fallback: EntityGraphDirection): EntityGraphDirection {
  if (!value) {
    return fallback;
  }
  if (value === "incoming" || value === "outgoing" || value === "both") {
    return value;
  }
  throw new Error(`Unsupported direction "${value}". Use incoming, outgoing, or both.`);
}

function requireFlag(value: string | undefined, flagName: string): string {
  if (!value) {
    throw new Error(`--${flagName} is required for this graph query.`);
  }
  return value;
}

function serializeGraph(graph: EntityGraph): Record<string, unknown> {
  return {
    nodes: graph.nodes,
    edges: graph.edges,
    brokenReferences: graph.brokenReferences,
  };
}

function countBy<T extends string>(values: T[]): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function printSummary(graph: EntityGraph, roleId: string): void {
  console.log(`Role: ${roleId}`);
  console.log(`Nodes: ${graph.nodes.length}`);
  console.log(`Edges: ${graph.edges.length}`);
  console.log(`Broken references: ${graph.brokenReferences.length}`);
  console.log("");
  console.log("Node types");
  for (const item of countBy(graph.nodes.map((node) => node.type))) {
    console.log(`- ${item.key}: ${item.count}`);
  }
  console.log("");
  console.log("Edge types");
  for (const item of countBy(graph.edges.map((edge) => edge.type))) {
    console.log(`- ${item.key}: ${item.count}`);
  }
}

function printNeighbors(
  graph: EntityGraph,
  entityId: string,
  direction: EntityGraphDirection,
  edgeTypes: string[] | undefined,
): void {
  const neighbors = getEntityGraphNeighbors(graph, entityId, { direction, edgeTypes });
  console.log(`Entity: ${entityId}`);
  console.log(`Matched neighbors: ${neighbors.length}`);
  if (neighbors.length === 0) {
    return;
  }
  console.log("direction\tedge_type\trelated_id\trelated_type\trelated_name");
  for (const neighbor of neighbors) {
    console.log(
      [
        neighbor.direction,
        neighbor.edge.type,
        neighbor.node.id,
        neighbor.node.type,
        neighbor.node.name,
      ].join("\t"),
    );
  }
}

function printSubgraphResult(
  graph: EntityGraph,
  entityId: string,
  depth: number,
  direction: EntityGraphDirection,
  edgeTypes: string[] | undefined,
): void {
  const subgraph = collectEntitySubgraph(graph, [entityId], { depth, direction, edgeTypes });
  console.log(`Seed: ${entityId}`);
  console.log(`Depth: ${depth}`);
  console.log(`Nodes: ${subgraph.nodes.length}`);
  console.log(`Edges: ${subgraph.edges.length}`);
  console.log("");
  console.log("Nodes");
  for (const node of subgraph.nodes) {
    console.log(`- ${node.id} [${node.type}] ${node.name}`);
  }
  if (subgraph.edges.length === 0) {
    return;
  }
  console.log("");
  console.log("Edges");
  for (const edge of subgraph.edges) {
    console.log(`- ${edge.sourceId} -[${edge.type}]-> ${edge.targetId}`);
  }
}

function printPathResult(
  graph: EntityGraph,
  fromId: string,
  toId: string,
  maxDepth: number,
  direction: EntityGraphDirection,
  edgeTypes: string[] | undefined,
): void {
  const pathResult = findEntityGraphPath(graph, fromId, toId, { maxDepth, direction, edgeTypes });
  if (!pathResult) {
    console.log(`No path found from ${fromId} to ${toId}.`);
    return;
  }
  console.log(`Path from ${fromId} to ${toId} (${pathResult.edges.length} hops)`);
  for (let index = 0; index < pathResult.edges.length; index += 1) {
    const edge = pathResult.edges[index];
    if (!edge) {
      continue;
    }
    console.log(`${index + 1}. ${edge.sourceId} -[${edge.type}]-> ${edge.targetId}`);
  }
}

function printBrokenReferences(graph: EntityGraph): void {
  console.log(`Broken references: ${graph.brokenReferences.length}`);
  if (graph.brokenReferences.length === 0) {
    return;
  }
  console.log("source_id\tsource_type\tedge_type\tsource_field\ttarget_id\texpected_type\treason\tactual_type");
  for (const reference of graph.brokenReferences) {
    console.log(
      [
        reference.sourceId,
        reference.sourceType,
        reference.edgeType,
        reference.sourceField,
        reference.targetId,
        reference.expectedTargetType,
        reference.reason,
        reference.actualTargetType ?? "",
      ].join("\t"),
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const workspaceRoot = resolveWorkspaceRoot(args);
  const query = (getStringFlag(args, "query", "summary") ?? "summary") as GraphQueryName;
  const format = (getStringFlag(args, "format", "text") ?? "text") as GraphOutputFormat;
  const edgeTypes = parseCsvFlag(getStringFlag(args, "edge-type"));
  const requestedRoleId = getStringFlag(args, "role");
  const { role } = await resolveRole(workspaceRoot, requestedRoleId);
  const graph = await buildEntityGraph(workspaceRoot, role);

  if (format === "json") {
    switch (query) {
      case "summary":
        printJson({
          roleId: role.id,
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
          brokenReferenceCount: graph.brokenReferences.length,
          nodesByType: countBy(graph.nodes.map((node) => node.type)),
          edgesByType: countBy(graph.edges.map((edge) => edge.type)),
        });
        return;
      case "neighbors":
        printJson({
          roleId: role.id,
          entityId: requireFlag(getStringFlag(args, "entity"), "entity"),
          neighbors: getEntityGraphNeighbors(graph, requireFlag(getStringFlag(args, "entity"), "entity"), {
            direction: getDirectionFlag(getStringFlag(args, "direction"), "both"),
            edgeTypes,
          }).map((neighbor) => ({
            direction: neighbor.direction,
            edge: neighbor.edge,
            node: neighbor.node,
          })),
        });
        return;
      case "subgraph": {
        const entityId = requireFlag(getStringFlag(args, "entity"), "entity");
        const depth = getNumberFlag(args, "depth", 2);
        const subgraph = collectEntitySubgraph(graph, [entityId], {
          depth,
          direction: getDirectionFlag(getStringFlag(args, "direction"), "both"),
          edgeTypes,
        });
        printJson({
          roleId: role.id,
          entityId,
          depth,
          ...subgraph,
        });
        return;
      }
      case "path": {
        const fromId = requireFlag(getStringFlag(args, "from"), "from");
        const toId = requireFlag(getStringFlag(args, "to"), "to");
        const maxDepth = getNumberFlag(args, "max-depth", 6);
        printJson({
          roleId: role.id,
          fromId,
          toId,
          path: findEntityGraphPath(graph, fromId, toId, {
            maxDepth,
            direction: getDirectionFlag(getStringFlag(args, "direction"), "outgoing"),
            edgeTypes,
          }),
        });
        return;
      }
      case "broken":
        printJson({
          roleId: role.id,
          brokenReferences: graph.brokenReferences,
        });
        return;
      default:
        printJson(serializeGraph(graph));
        return;
    }
  }

  switch (query) {
    case "summary":
      printSummary(graph, role.id);
      return;
    case "neighbors":
      printNeighbors(
        graph,
        requireFlag(getStringFlag(args, "entity"), "entity"),
        getDirectionFlag(getStringFlag(args, "direction"), "both"),
        edgeTypes,
      );
      return;
    case "subgraph":
      printSubgraphResult(
        graph,
        requireFlag(getStringFlag(args, "entity"), "entity"),
        getNumberFlag(args, "depth", 2),
        getDirectionFlag(getStringFlag(args, "direction"), "both"),
        edgeTypes,
      );
      return;
    case "path":
      printPathResult(
        graph,
        requireFlag(getStringFlag(args, "from"), "from"),
        requireFlag(getStringFlag(args, "to"), "to"),
        getNumberFlag(args, "max-depth", 6),
        getDirectionFlag(getStringFlag(args, "direction"), "outgoing"),
        edgeTypes,
      );
      return;
    case "broken":
      printBrokenReferences(graph);
      return;
    default:
      throw new Error(`Unsupported query "${query}". Use summary, neighbors, subgraph, path, or broken.`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
