import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.join(__dirname, "..");

function writeFile(root: string, relativePath: string, content: string): void {
  const absolutePath = path.join(root, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, content);
}

function writeEntityDefs(root: string): void {
  writeFile(
    root,
    "entity-defs/entities.md",
    `---
entities:
  - key: item
    label: Item
    type: item
    create_directory: items
    id_strategy: prefixed-slug
    id_prefix: itm
    id_source_fields:
      - title
    name_template: "{{title}}"
    status_field: status
    owner_field: owner
    fields:
      - key: title
        label: Title
        type: string
        description: Stable item name.
        required: true
      - key: summary
        label: Summary
        type: string
        description: Current summary.
      - key: owner
        label: Owner
        type: string
        description: Current owner.
      - key: status
        label: Status
        type: string
        description: Current status.
        defaultValue: active
      - key: nextStep
        label: Next Step
        type: string
        description: Next concrete step.
    files:
      - path: record.md
        template: item/record.md
      - path: notes.md
        template: item/notes.md
  - key: case
    label: Case
    type: case
    create_directory: cases/active
    scan_directories:
      - cases/active
      - cases/archive
    id_strategy: year-sequence-slug
    id_prefix: cs
    id_source_fields:
      - account
      - title
    name_template: "{{account}} - {{title}}"
    status_field: status
    owner_field: owner
    extra_directories:
      - transcripts
    fields:
      - key: account
        label: Account
        type: string
        description: Primary account or counterpart.
        required: true
      - key: title
        label: Title
        type: string
        description: Case title.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Current owner.
      - key: status
        label: Status
        type: string
        description: Current state.
        defaultValue: active
      - key: nextStep
        label: Next Step
        type: string
        description: Next concrete step.
    files:
      - path: record.md
        template: case/record.md
      - path: activity-log.md
        template: case/activity-log.md
  - key: issue
    label: Issue
    type: issue
    create_directory: issues
    id_strategy: prefixed-slug
    id_prefix: iss
    id_source_fields:
      - title
    name_template: "{{title}}"
    status_field: status
    owner_field: owner
    fields:
      - key: title
        label: Title
        type: string
        description: Issue title.
        required: true
      - key: owner
        label: Owner
        type: string
        description: Current owner.
      - key: status
        label: Status
        type: string
        description: Current state.
        defaultValue: active
      - key: nextStep
        label: Next Step
        type: string
        description: Next concrete step.
    files:
      - path: record.md
        template: issue/record.md
explorer:
  renderers:
    detail:
      case: renderers/case-detail.mjs
---
`,
  );

  writeFile(
    root,
    "entity-defs/item/record.md",
    `---
id: {{id}}
type: {{type}}
name: {{name}}
status: {{status}}
owner: {{owner}}
updated_at: {{updatedAt}}
source_refs:
{{sourceRefsYaml}}
---

## Summary

{{summary}}

## Next Step

- {{nextStep}}
`,
  );
  writeFile(root, "entity-defs/item/notes.md", "## Notes\n\n- Add notes.\n");
  writeFile(
    root,
    "entity-defs/case/record.md",
    `---
id: {{id}}
type: {{type}}
name: {{name}}
status: {{status}}
owner: {{owner}}
updated_at: {{updatedAt}}
source_refs:
{{sourceRefsYaml}}
---

## Summary

{{title}}

## Next Step

- {{nextStep}}
`,
  );
  writeFile(root, "entity-defs/case/activity-log.md", "## Activity Log\n\n- Add activity.\n");
  writeFile(
    root,
    "entity-defs/issue/record.md",
    `---
id: {{id}}
type: {{type}}
name: {{name}}
status: {{status}}
owner: {{owner}}
updated_at: {{updatedAt}}
source_refs:
{{sourceRefsYaml}}
---

## Next Step

- {{nextStep}}
`,
  );
  writeFile(root, "entity-defs/renderers/case-detail.mjs", "export default function render() { return '<div>case detail</div>'; }\n");
}

function writeRoleFiles(root: string, roleId: string): void {
  const roleName = roleId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");

  writeFile(
    root,
    path.join("agents", roleId, "role.md"),
    `---
id: ${roleId}
name: ${roleName}
description: Generic test role.
role_directories:
  - notes
transcript_ingest:
  entity_type: case
  command_prompt: 40-command-transcript-run.md
  system_prompts:
    - 23-mode-transcript-ingest.md
  evidence_directory: transcripts
  unmatched_directory: unmatched-transcripts
  activity_log_file: activity-log.md
---
`,
  );

  writeFile(
    root,
    path.join("agents", roleId, "AGENTS.md"),
    `# ${roleName} Role

Generic role fixture for runtime tests.

- [prompts/23-mode-transcript-ingest.md](prompts/23-mode-transcript-ingest.md)
- [prompts/40-command-transcript-run.md](prompts/40-command-transcript-run.md)
`,
  );
  writeFile(
    root,
    path.join("agents", roleId, "prompts", "23-mode-transcript-ingest.md"),
    "# Transcript Ingest\n\nPreserve the transcript as raw evidence.\n",
  );
  writeFile(
    root,
    path.join("agents", roleId, "prompts", "40-command-transcript-run.md"),
    "# Transcript Processing Request\n\nUse `{{transcriptPath}}`.\n",
  );
}

export function seedRoleWorkspace(root: string, roleIds: string[] = ["role-a"]): void {
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
  mkdirSync(path.join(root, "entity-defs"), { recursive: true });
  writeEntityDefs(root);

  for (const roleId of roleIds) {
    writeRoleFiles(root, roleId);
  }
}

export function writeSharedEntityRecord(root: string, options?: { directoryName?: string; id?: string; type?: string; name?: string }): void {
  const directoryName = options?.directoryName ?? "shared-context";
  mkdirSync(path.join(root, "entities", directoryName), { recursive: true });
  writeFileSync(
    path.join(root, "entities", directoryName, "record.md"),
    `---
id: ${options?.id ?? directoryName}
type: ${options?.type ?? "shared-context"}
name: ${options?.name ?? "Shared Context"}
updated_at: 2026-03-08T12:00:00.000Z
---

## Summary

Shared summary.
`,
  );
}
