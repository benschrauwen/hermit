import matter from "gray-matter";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { getProviderAwareModelDiagnostics } from "./model-auth.js";
import { SHARED_ROOT_DIRECTORIES } from "./constants.js";
import { PromptLibrary } from "./prompt-library.js";
import { loadRole, validateRoleManifest } from "./roles.js";
import { scanEntities } from "./workspace.js";

interface DoctorFinding {
  level: "error" | "warning" | "info";
  kind?: "general" | "placeholder";
  message: string;
  filePath?: string;
  placeholderLine?: string;
}

interface PlaceholderSummary {
  level: DoctorFinding["level"];
  placeholderLine: string;
  filePaths: string[];
}

const REQUIRED_RECORD_FIELDS = ["id", "type", "name", "updated_at"] as const;
const MAX_PLACEHOLDER_EXAMPLES = 3;
const UNRESOLVED_TEMPLATE_PATTERN = /\{\{[^}]+\}\}/;
const GENERIC_PLACEHOLDER_LINE_PATTERNS = [/^(?:-\s*)?Add next step\.?$/i, /^(?:-\s*)?Add notes\.?$/i, /^(?:-\s*)?Add activity\.?$/i];
const ENTITY_DEFS_FRONTMATTER_EXAMPLE = `---
entities:
  - key: company
    label: Company
    type: company
    create_directory: companies
    id_strategy: singleton
    name_template: "{{name}}"
    fields:
      - key: name
        label: Name
        type: string
        description: Official company name.
        required: true
    files:
      - path: record.md
        template: company/record.md
---`;

function addMissingFrontmatterWarnings(findings: DoctorFinding[], recordPath: string, data: Record<string, unknown>): void {
  for (const field of REQUIRED_RECORD_FIELDS) {
    if (!data[field]) {
      findings.push({ level: "warning", kind: "general", message: `${recordPath} is missing frontmatter field: ${field}` });
    }
  }
}

function extractTemplatePlaceholderCandidates(content: string): string[] {
  return [
    ...new Set(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => /^(?:-\s*)?Add\b/.test(line)),
    ),
  ];
}

function extractPlaceholderLines(content: string, templatePlaceholderCandidates: readonly string[] = []): string[] {
  const templateCandidateSet = new Set(templatePlaceholderCandidates);
  return [
    ...new Set(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) =>
          UNRESOLVED_TEMPLATE_PATTERN.test(line)
          || templateCandidateSet.has(line)
          || GENERIC_PLACEHOLDER_LINE_PATTERNS.some((pattern) => pattern.test(line))
        ),
    ),
  ];
}

async function loadTemplatePlaceholderCandidates(
  templatePath: string | undefined,
  cache: Map<string, string[]>,
): Promise<string[]> {
  if (!templatePath) {
    return [];
  }

  const cached = cache.get(templatePath);
  if (cached) {
    return cached;
  }

  try {
    const templateContent = await fs.readFile(templatePath, "utf8");
    const placeholderCandidates = extractTemplatePlaceholderCandidates(templateContent);
    cache.set(templatePath, placeholderCandidates);
    return placeholderCandidates;
  } catch {
    cache.set(templatePath, []);
    return [];
  }
}

function addPlaceholderWarnings(
  findings: DoctorFinding[],
  filePath: string,
  content: string,
  templatePlaceholderCandidates: readonly string[] = [],
): void {
  for (const line of extractPlaceholderLines(content, templatePlaceholderCandidates).slice(0, 3)) {
    findings.push({
      level: "warning",
      kind: "placeholder",
      message: `${filePath} still contains placeholder text: ${line}`,
      filePath,
      placeholderLine: line,
    });
  }
}

function addGeneralFinding(findings: DoctorFinding[], level: DoctorFinding["level"], message: string): void {
  findings.push({ level, kind: "general", message });
}

async function validateEntityDefsFile(findings: DoctorFinding[], root: string): Promise<void> {
  const entityDefsPath = path.join(root, "entity-defs", "entities.md");

  try {
    const raw = await fs.readFile(entityDefsPath, "utf8");
    const parsed = matter(raw);
    const data = parsed.data as { entities?: unknown };
    const hasBodyContent = parsed.content.trim().length > 0;
    const entities = Array.isArray(data.entities) ? data.entities : undefined;

    if (hasBodyContent && (!entities || entities.length === 0)) {
      addGeneralFinding(
        findings,
        "error",
        `entity-defs/entities.md must define an \`entities:\` list in YAML frontmatter. This usually means the file was written as a bare YAML list or markdown body instead of frontmatter. Expected shape:\n${ENTITY_DEFS_FRONTMATTER_EXAMPLE}`,
      );
    }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? (error as NodeJS.ErrnoException).code : undefined;
    if (code !== "ENOENT") {
      addGeneralFinding(findings, "warning", `${entityDefsPath} is missing or unreadable.`);
    }
  }
}

async function validateMarkdownRecord(
  findings: DoctorFinding[],
  recordPath: string,
  templatePlaceholderCandidates: readonly string[] = [],
): Promise<void> {
  try {
    const content = await fs.readFile(recordPath, "utf8");
    const parsed = matter(content);
    const data = parsed.data as Record<string, unknown>;
    addMissingFrontmatterWarnings(findings, recordPath, data);
    addPlaceholderWarnings(findings, recordPath, content, templatePlaceholderCandidates);
  } catch {
    addGeneralFinding(findings, "warning", `${recordPath} is missing or unreadable.`);
  }
}

function summarizePlaceholderFindings(root: string, findings: DoctorFinding[]): PlaceholderSummary[] {
  const grouped = new Map<string, PlaceholderSummary>();

  for (const finding of findings) {
    if (finding.kind !== "placeholder" || !finding.placeholderLine || !finding.filePath) {
      continue;
    }

    const key = `${finding.level}:${finding.placeholderLine}`;
    const existing = grouped.get(key);
    const relativePath = path.relative(root, finding.filePath) || finding.filePath;

    if (existing) {
      existing.filePaths.push(relativePath);
      continue;
    }

    grouped.set(key, {
      level: finding.level,
      placeholderLine: finding.placeholderLine,
      filePaths: [relativePath],
    });
  }

  return [...grouped.values()].sort((left, right) => {
    if (right.filePaths.length !== left.filePaths.length) {
      return right.filePaths.length - left.filePaths.length;
    }

    return left.placeholderLine.localeCompare(right.placeholderLine);
  });
}

function printFindings(root: string, findings: DoctorFinding[]): void {
  const nonPlaceholderFindings = findings.filter((finding) => finding.kind !== "placeholder");
  const placeholderSummaries = summarizePlaceholderFindings(root, findings);

  for (const finding of nonPlaceholderFindings) {
    console.log(`${finding.level}: ${finding.message}`);
  }

  for (const summary of placeholderSummaries) {
    const count = summary.filePaths.length;
    const noun = count === 1 ? "file" : "files";
    const verb = count === 1 ? "contains" : "contain";
    console.log(`${summary.level}: ${count} ${noun} still ${verb} placeholder text: ${summary.placeholderLine}`);

    for (const examplePath of summary.filePaths.slice(0, MAX_PLACEHOLDER_EXAMPLES)) {
      console.log(`info: example placeholder path: ${examplePath}`);
    }

    const omittedCount = count - Math.min(count, MAX_PLACEHOLDER_EXAMPLES);
    if (omittedCount > 0) {
      console.log(`info: ${omittedCount} additional placeholder ${omittedCount === 1 ? "file" : "files"} omitted for this line.`);
    }
  }
}

export async function runDoctor(root: string, roleId: string): Promise<boolean> {
  const findings: DoctorFinding[] = [];
  const templatePlaceholderCache = new Map<string, string[]>();
  for (const relativePath of SHARED_ROOT_DIRECTORIES) {
    try {
      const stat = await fs.stat(path.join(root, relativePath));
      if (!stat.isDirectory()) {
        addGeneralFinding(findings, "error", `${relativePath} exists but is not a directory.`);
      }
    } catch {
      addGeneralFinding(findings, "error", `Missing required directory: ${relativePath}`);
    }
  }

  await validateEntityDefsFile(findings, root);

  let role: Awaited<ReturnType<typeof loadRole>> | undefined;
  try {
    role = await loadRole(root, roleId);
  } catch (error) {
    addGeneralFinding(
      findings,
      "error",
      error instanceof Error ? error.message : `Failed to load role ${roleId}.`,
    );
  }

  if (!role) {
    for (const diagnostic of getProviderAwareModelDiagnostics()) {
      addGeneralFinding(findings, diagnostic.level, diagnostic.message);
    }
    printFindings(root, findings);
    return false;
  }

  try {
    await fs.access(role.agentsFile);
  } catch {
    addGeneralFinding(findings, "error", `Missing ${path.relative(root, role.agentsFile)}.`);
  }

  try {
    await validateRoleManifest(root, roleId);
    const promptLibrary = await PromptLibrary.load(role);
    const linkedFiles = promptLibrary.extractLinkedFiles();
    for (const linkedFile of linkedFiles) {
      const resolvedPath = path.resolve(role.roleDir, linkedFile);
      try {
        await fs.access(resolvedPath);
      } catch {
        addGeneralFinding(
          findings,
          "error",
          `${path.relative(root, role.agentsFile)} links to missing file: ${linkedFile}`,
        );
      }
    }
  } catch (error) {
    addGeneralFinding(
      findings,
      "error",
      error instanceof Error ? error.message : "Failed to load prompt library.",
    );
  }

  for (const agentFile of role.agentFiles) {
    const agentFilePath = path.join(role.roleDir, agentFile);
    const templatePath = path.join(role.sharedPromptsDir, "templates", "agent", path.basename(agentFilePath));
    const placeholderCandidates = await loadTemplatePlaceholderCandidates(templatePath, templatePlaceholderCache);
    try {
      await fs.access(agentFilePath);
      await validateMarkdownRecord(findings, agentFilePath, placeholderCandidates);
    } catch {
      addGeneralFinding(
        findings,
        "error",
        `Missing required agent file: ${path.relative(root, agentFilePath)}`,
      );
    }
  }

  const entities = await scanEntities(root, role);
  const seenIds = new Set<string>();

  for (const entity of entities) {
    if (seenIds.has(entity.id)) {
      addGeneralFinding(findings, "error", `Duplicate entity ID detected: ${entity.id}`);
    }
    seenIds.add(entity.id);

    const recordPath = path.join(entity.path, "record.md");
    const entityDefinition = role.entities.find((definition) => definition.type === entity.type);
    const recordTemplatePath = entityDefinition?.files.find((file) => file.path === "record.md")?.template;
    const recordPlaceholderCandidates = await loadTemplatePlaceholderCandidates(
      recordTemplatePath ? path.join(role.entityDefsDir, recordTemplatePath) : undefined,
      templatePlaceholderCache,
    );
    await validateMarkdownRecord(findings, recordPath, recordPlaceholderCandidates);

    if (entityDefinition) {
      for (const requiredFile of entityDefinition.files.filter((file) => file.path !== "record.md")) {
        const requiredPath = path.join(entity.path, requiredFile.path);
        try {
          const content = await fs.readFile(requiredPath, "utf8");
          const placeholderCandidates = await loadTemplatePlaceholderCandidates(
            path.join(role.entityDefsDir, requiredFile.template),
            templatePlaceholderCache,
          );
          addPlaceholderWarnings(findings, requiredPath, content, placeholderCandidates);
        } catch {
          addGeneralFinding(findings, "warning", `${requiredPath} is missing or unreadable.`);
        }
      }
    }
  }

  for (const diagnostic of getProviderAwareModelDiagnostics()) {
    addGeneralFinding(findings, diagnostic.level, diagnostic.message);
  }

  if (findings.length === 0) {
    console.log("doctor: workspace looks healthy");
    return true;
  }

  printFindings(root, findings);
  return findings.every((finding) => finding.level !== "error");
}

export async function printDoctorContext(root: string, roleId: string): Promise<void> {
  const role = await loadRole(root, roleId);
  const promptLibrary = await PromptLibrary.load(role);
  const breakdown = await promptLibrary.getSystemPromptBreakdown(
    {
      workspaceRoot: root,
      roleId: role.id,
      roleRoot: path.relative(root, role.roleDir) || ".",
    },
    [],
  );
  const totalChars = breakdown.reduce((sum, part) => sum + part.renderedChars, 0);

  console.log(`context: total rendered chars ${totalChars}`);
  for (const part of breakdown) {
    console.log(`context: ${part.kind} ${part.sourcePath} (${part.renderedChars} chars)`);
  }
}
