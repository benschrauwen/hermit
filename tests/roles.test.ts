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
    seedRoleWorkspace(root, ["sales"]);

    const role = await loadRole(root, "sales");
    expect(role.explorer?.renderers?.detail?.deal).toBe("renderers/deal-detail.mjs");
    await expect(validateRoleManifest(root, "sales")).resolves.toBeUndefined();
  });

  it("fails validation when an explorer renderer file is missing", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-explorer-missing-"));
    roots.push(root);
    seedRoleWorkspace(root, ["sales"]);

    const roleManifestPath = path.join(root, "agents", "sales", "role.md");
    replaceInFile(
      roleManifestPath,
      "deal: renderers/deal-detail.mjs",
      "deal: renderers/missing-detail.mjs",
    );

    await expect(validateRoleManifest(root, "sales")).rejects.toThrow(
      "Role sales is missing explorer detail renderer: renderers/missing-detail.mjs",
    );
  });
});
