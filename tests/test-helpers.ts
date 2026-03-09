import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.join(__dirname, "..");

export function seedRoleWorkspace(root: string, roleIds: string[] = ["sales"]): void {
  mkdirSync(path.join(root, "entities"), { recursive: true });
  mkdirSync(path.join(root, "agents"), { recursive: true });
  mkdirSync(path.join(root, "prompts"), { recursive: true });
  mkdirSync(path.join(root, "skills"), { recursive: true });

  cpSync(path.join(repoRoot, "prompts"), path.join(root, "prompts"), {
    recursive: true,
  });
  cpSync(path.join(repoRoot, "skills"), path.join(root, "skills"), {
    recursive: true,
  });
  cpSync(path.join(repoRoot, "entity-defs"), path.join(root, "entity-defs"), {
    recursive: true,
  });

  for (const roleId of roleIds) {
    const sourceRoleDir = path.join(repoRoot, "agents", roleId);
    const targetRoleDir = path.join(root, "agents", roleId);
    mkdirSync(targetRoleDir, { recursive: true });
    cpSync(path.join(sourceRoleDir, "role.md"), path.join(targetRoleDir, "role.md"));
    cpSync(path.join(sourceRoleDir, "AGENTS.md"), path.join(targetRoleDir, "AGENTS.md"));
    cpSync(path.join(sourceRoleDir, "prompts"), path.join(targetRoleDir, "prompts"), {
      recursive: true,
    });
    if (existsSync(path.join(sourceRoleDir, "skills"))) {
      cpSync(path.join(sourceRoleDir, "skills"), path.join(targetRoleDir, "skills"), {
        recursive: true,
      });
    }
  }
}

export function writeCompanyRecord(root: string): void {
  mkdirSync(path.join(root, "entities", "company"), { recursive: true });
  writeFileSync(
    path.join(root, "entities", "company", "record.md"),
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
