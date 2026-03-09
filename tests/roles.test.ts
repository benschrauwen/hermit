import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadRole, validateRoleManifest } from "../src/roles.js";
import { seedRoleWorkspace } from "./test-helpers.js";

function replaceInFile(filePath: string, oldText: string, newText: string): void {
  const original = readFileSync(filePath, "utf8");
  writeFileSync(filePath, original.replace(oldText, newText));
}

describe("roles explorer renderers", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("parses optional explorer renderer config from the role manifest", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-explorer-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    const role = await loadRole(root, "role-a");
    expect(role.explorer?.renderers?.detail?.case).toBe("renderers/case-detail.mjs");
    await expect(validateRoleManifest(root, "role-a")).resolves.toBeUndefined();
  });

  it("fails validation when an explorer renderer file is missing", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-explorer-missing-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    const entityDefsPath = path.join(root, "entity-defs", "entities.md");
    replaceInFile(
      entityDefsPath,
      "case: renderers/case-detail.mjs",
      "case: renderers/missing-detail.mjs",
    );

    await expect(validateRoleManifest(root, "role-a")).rejects.toThrow(
      "Role role-a is missing explorer detail renderer: renderers/missing-detail.mjs",
    );
  });

  it("fails validation when a shared agent scaffold template is missing", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-agent-template-missing-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    rmSync(path.join(root, "prompts", "templates", "agent", "record.md"));

    await expect(validateRoleManifest(root, "role-a")).rejects.toThrow(
      "Role role-a is missing shared agent template: prompts/templates/agent/record.md",
    );
  });
});
