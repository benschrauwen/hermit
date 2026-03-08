import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.join(__dirname, "..");

export function seedRoleWorkspace(root: string, roleIds: string[] = ["sales"]): void {
  mkdirSync(path.join(root, "company"), { recursive: true });
  mkdirSync(path.join(root, "people"), { recursive: true });
  mkdirSync(path.join(root, "roles"), { recursive: true });
  mkdirSync(path.join(root, "prompts"), { recursive: true });
  mkdirSync(path.join(root, "templates"), { recursive: true });

  cpSync(path.join(repoRoot, "prompts"), path.join(root, "prompts"), {
    recursive: true,
  });
  cpSync(path.join(repoRoot, "templates", "shared"), path.join(root, "templates", "shared"), {
    recursive: true,
  });

  for (const roleId of roleIds) {
    const sourceRoleDir = path.join(repoRoot, "roles", roleId);
    const targetRoleDir = path.join(root, "roles", roleId);
    mkdirSync(targetRoleDir, { recursive: true });
    cpSync(path.join(sourceRoleDir, "role.md"), path.join(targetRoleDir, "role.md"));
    cpSync(path.join(sourceRoleDir, "AGENTS.md"), path.join(targetRoleDir, "AGENTS.md"));
    cpSync(path.join(sourceRoleDir, "prompts"), path.join(targetRoleDir, "prompts"), {
      recursive: true,
    });
    cpSync(path.join(sourceRoleDir, "templates"), path.join(targetRoleDir, "templates"), {
      recursive: true,
    });
    if (existsSync(path.join(sourceRoleDir, "explorer"))) {
      cpSync(path.join(sourceRoleDir, "explorer"), path.join(targetRoleDir, "explorer"), {
        recursive: true,
      });
    }
  }
}

export function writeCompanyRecord(root: string): void {
  writeFileSync(
    path.join(root, "company", "record.md"),
    `---
id: company
type: company
name: Acme
updated_at: 2026-03-08T12:00:00.000Z
---

## Summary

Acme summary.
`,
  );
}
