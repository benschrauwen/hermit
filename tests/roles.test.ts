import { describe, it, expect, afterEach } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  loadRole,
  readLastUsedChatRole,
  resolveChatSession,
  validateRoleManifest,
  writeLastUsedChatRole,
} from "../src/roles.js";
import { repoRoot, seedRoleWorkspace } from "./test-helpers.js";

function replaceInFile(filePath: string, oldText: string, newText: string): void {
  const original = readFileSync(filePath, "utf8");
  writeFileSync(filePath, original.replace(oldText, newText));
}

describe("loadRole", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("defaults missing role_directories to an empty list", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-default-dirs-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    replaceInFile(
      path.join(root, "agents", "role-a", "role.md"),
      "role_directories:\n  - notes\n",
      "",
    );

    const role = await loadRole(root, "role-a");
    expect(role.roleDirectories).toEqual([]);
    await expect(validateRoleManifest(root, "role-a")).resolves.toBeUndefined();
  });

  it("allows singleton entities to omit id_source_fields", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-singleton-no-id-source-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    replaceInFile(
      path.join(root, "entity-defs", "entities.md"),
      "  - key: item\n    label: Item\n    type: item\n    create_directory: items\n    id_strategy: prefixed-slug\n    id_prefix: itm\n    id_source_fields:\n      - title\n    name_template: \"{{title}}\"\n",
      "  - key: item\n    label: Item\n    type: item\n    create_directory: items\n    id_strategy: singleton\n    name_template: \"Item\"\n",
    );

    const role = await loadRole(root, "role-a");
    expect(role.entities[0]?.idStrategy).toBe("singleton");
    expect(role.entities[0]?.idSourceFields).toEqual([]);
    await expect(validateRoleManifest(root, "role-a")).resolves.toBeUndefined();
  });

  it("requires id_source_fields for non-singleton entities", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-non-singleton-id-source-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    replaceInFile(
      path.join(root, "entity-defs", "entities.md"),
      "    id_source_fields:\n      - title\n",
      "",
    );

    await expect(loadRole(root, "role-a")).rejects.toThrow(
      "entities[0].id_source_fields is required when id_strategy is prefixed-slug or year-sequence-slug",
    );
  });

  it("rejects relationship target types that are not defined", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-relationship-target-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    replaceInFile(
      path.join(root, "entity-defs", "entities.md"),
      `    files:
      - path: record.md
        template: item/record.md
      - path: notes.md
        template: item/notes.md
`,
      `    relationships:
      - source_field: title
        target_type: missing-type
        edge_type: related_to
    files:
      - path: record.md
        template: item/record.md
      - path: notes.md
        template: item/notes.md
`,
    );

    await expect(validateRoleManifest(root, "role-a")).rejects.toThrow(
      "Role role-a relationship item.title references unknown target type missing-type.",
    );
  });

  it("requires the manifest id to match the role directory name", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-id-mismatch-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    replaceInFile(
      path.join(root, "agents", "role-a", "role.md"),
      "id: role-a",
      "id: sales",
    );

    await expect(loadRole(root, "role-a")).rejects.toThrow(
      'Role manifest ID mismatch for agents/role-a/role.md: expected id "role-a" but found "sales".',
    );
  });
});

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
    expect(role.explorer?.renderers?.home).toBe("renderers/home.mjs");
    expect(role.explorer?.renderers?.detail?.case).toBe("renderers/case-detail.mjs");
    expect(role.explorer?.renderers?.lists?.item).toBe("renderers/item-list.mjs");
    expect(role.explorer?.renderers?.pages?.["training-calendar"]).toBe("renderers/training-calendar.mjs");
    await expect(validateRoleManifest(root, "role-a")).resolves.toBeUndefined();
  });

  it("fails validation when an explorer detail renderer file is missing", async () => {
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

  it("fails validation when an explorer home renderer file is missing", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-explorer-home-missing-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    const entityDefsPath = path.join(root, "entity-defs", "entities.md");
    replaceInFile(
      entityDefsPath,
      "home: renderers/home.mjs",
      "home: renderers/missing-home.mjs",
    );

    await expect(validateRoleManifest(root, "role-a")).rejects.toThrow(
      "Role role-a is missing explorer home renderer: renderers/missing-home.mjs",
    );
  });

  it("fails validation when a shared agent scaffold template is missing", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-agent-template-missing-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);
    const frameworkRoot = mkdtempSync(path.join(tmpdir(), "roles-framework-"));
    roots.push(frameworkRoot);
    cpSync(path.join(repoRoot, "prompts"), path.join(frameworkRoot, "prompts"), { recursive: true });

    const originalFrameworkRoot = process.env.HERMIT_FRAMEWORK_ROOT;
    process.env.HERMIT_FRAMEWORK_ROOT = frameworkRoot;
    try {
      rmSync(path.join(root, "prompts", "templates", "agent", "record.md"));
      rmSync(path.join(frameworkRoot, "prompts", "templates", "agent", "record.md"));

      await expect(validateRoleManifest(root, "role-a")).rejects.toThrow(
        "Role role-a is missing shared agent template: prompts/templates/agent/record.md",
      );
    } finally {
      if (originalFrameworkRoot === undefined) {
        delete process.env.HERMIT_FRAMEWORK_ROOT;
      } else {
        process.env.HERMIT_FRAMEWORK_ROOT = originalFrameworkRoot;
      }
    }
  });
});

describe("resolveChatSession", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("starts Hermit chat in bootstrap mode when no roles exist", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-chat-bootstrap-"));
    roots.push(root);

    const resolved = await resolveChatSession(root);
    expect(resolved).toEqual({
      kind: "hermit",
      root,
      bootstrapMode: true,
    });
  });

  it("defaults to Hermit when no role is selected and roles already exist", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-chat-explicit-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    await expect(resolveChatSession(root)).resolves.toEqual({
      kind: "hermit",
      root,
      bootstrapMode: false,
    });
  });

  it("still accepts an inferred role from the current directory", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-chat-inferred-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    const resolved = await resolveChatSession(root, { inferredRoleId: "role-a" });
    expect(resolved.kind).toBe("role");
    if (resolved.kind !== "role") {
      throw new Error("Expected a role-backed chat session.");
    }
    expect(resolved.role.id).toBe("role-a");
  });

  it("uses the last chat role when one is stored", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-chat-last-role-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);
    await writeLastUsedChatRole(root, "role-a");

    const resolved = await resolveChatSession(root, { lastRoleId: await readLastUsedChatRole(root) });
    expect(resolved.kind).toBe("role");
    if (resolved.kind !== "role") {
      throw new Error("Expected a role-backed chat session.");
    }
    expect(resolved.role.id).toBe("role-a");
  });

  it("stores and reloads Hermit as the last chat role", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "roles-chat-last-hermit-"));
    roots.push(root);
    seedRoleWorkspace(root, ["role-a"]);

    await writeLastUsedChatRole(root, "Hermit");
    expect(await readLastUsedChatRole(root)).toBe("Hermit");
  });
});
