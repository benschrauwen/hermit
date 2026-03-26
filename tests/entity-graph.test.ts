import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  buildEntityGraph,
  collectEntitySubgraph,
  findEntityGraphPath,
  getEntityGraphNeighbors,
} from "../src/entity-graph.js";
import { loadRole } from "../src/roles.js";
import { seedRoleWorkspace } from "./test-helpers.js";

function replaceInFile(filePath: string, oldText: string, newText: string): void {
  const original = readFileSync(filePath, "utf8");
  writeFileSync(filePath, original.replace(oldText, newText));
}

function writeEntityRecord(root: string, relativeEntityDir: string, content: string): void {
  const entityDir = path.join(root, relativeEntityDir);
  mkdirSync(entityDir, { recursive: true });
  writeFileSync(path.join(entityDir, "record.md"), content);
}

describe("entity graph", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("builds on-demand edges, reverse edges, and broken-reference diagnostics", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "entity-graph-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    const entityDefsPath = path.join(root, "entity-defs", "entities.md");
    replaceInFile(
      entityDefsPath,
      `      - key: nextStep
        label: Next Step
        type: string
        description: Next concrete step.
    files:
      - path: record.md
        template: item/record.md
      - path: notes.md
        template: item/notes.md
`,
      `      - key: nextStep
        label: Next Step
        type: string
        description: Next concrete step.
      - key: relatedCaseId
        label: Related Case
        type: string
        description: Linked case ID.
    relationships:
      - source_field: relatedCaseId
        target_type: case
        edge_type: references_case
        reverse_edge_type: referenced_by_item
    files:
      - path: record.md
        template: item/record.md
      - path: notes.md
        template: item/notes.md
`,
    );
    replaceInFile(
      entityDefsPath,
      `      - key: nextStep
        label: Next Step
        type: string
        description: Next concrete step.
    files:
      - path: record.md
        template: issue/record.md
`,
      `      - key: nextStep
        label: Next Step
        type: string
        description: Next concrete step.
      - key: blockedByIds
        label: Blocked By
        type: string-array
        description: Linked item IDs that block this issue.
    relationships:
      - source_field: blockedByIds
        target_type: item
        edge_type: blocked_by
        reverse_edge_type: blocks
    files:
      - path: record.md
        template: issue/record.md
`,
    );

    const role = await loadRole(root, "role-a");

    const caseId = "cs-2026-0001-acme-expansion";
    const itemId = "itm-widget";
    const issueId = "iss-stabilize-deployment";
    const wrongItemId = "itm-mislinked";

    writeEntityRecord(
      root,
      path.join("entities", "cases", "active", caseId),
      `---
id: ${caseId}
type: case
name: Acme - Expansion
updated_at: 2026-03-26T12:00:00.000Z
---

## Summary

Expansion motion.
`,
    );
    writeEntityRecord(
      root,
      path.join("entities", "items", itemId),
      `---
id: ${itemId}
type: item
name: Widget
relatedCaseId: ${caseId}
updated_at: 2026-03-26T12:05:00.000Z
---

## Summary

Primary linked item.
`,
    );
    writeEntityRecord(
      root,
      path.join("entities", "items", wrongItemId),
      `---
id: ${wrongItemId}
type: item
name: Mislinked Item
relatedCaseId: ${issueId}
updated_at: 2026-03-26T12:07:00.000Z
---

## Summary

Points at the wrong entity type.
`,
    );
    writeEntityRecord(
      root,
      path.join("entities", "issues", issueId),
      `---
id: ${issueId}
type: issue
name: Stabilize Deployment
blockedByIds:
  - ${itemId}
  - itm-missing
updated_at: 2026-03-26T12:10:00.000Z
---

## Next Step

- Review blockers.
`,
    );

    const graph = await buildEntityGraph(root, role);

    expect(graph.nodes.map((node) => node.id)).toEqual(
      expect.arrayContaining([caseId, itemId, issueId, wrongItemId]),
    );
    expect(graph.edges.map((edge) => edge.type)).toEqual(
      expect.arrayContaining(["references_case", "referenced_by_item", "blocked_by", "blocks"]),
    );
    expect(graph.brokenReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: issueId,
          edgeType: "blocked_by",
          targetId: "itm-missing",
          reason: "missing-target",
        }),
        expect.objectContaining({
          sourceId: wrongItemId,
          edgeType: "references_case",
          targetId: issueId,
          reason: "wrong-target-type",
          actualTargetType: "issue",
        }),
      ]),
    );

    const reverseNeighbors = getEntityGraphNeighbors(graph, caseId, {
      direction: "outgoing",
      edgeTypes: ["referenced_by_item"],
    });
    expect(reverseNeighbors).toHaveLength(1);
    expect(reverseNeighbors[0]?.node.id).toBe(itemId);
    expect(reverseNeighbors[0]?.edge.type).toBe("referenced_by_item");

    const pathResult = findEntityGraphPath(graph, issueId, caseId, { direction: "outgoing", maxDepth: 4 });
    expect(pathResult?.nodeIds).toEqual([issueId, itemId, caseId]);
    expect(pathResult?.edges.map((edge) => edge.type)).toEqual(["blocked_by", "references_case"]);

    const subgraph = collectEntitySubgraph(graph, [issueId], { direction: "outgoing", depth: 2 });
    expect(subgraph.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([issueId, itemId, caseId]));
    expect(subgraph.edges.map((edge) => edge.type)).toEqual(expect.arrayContaining(["blocked_by", "references_case"]));
  });
});
