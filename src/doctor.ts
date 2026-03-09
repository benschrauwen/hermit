import matter from "gray-matter";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import { SHARED_COMPANY_FILES, SHARED_ROOT_DIRECTORIES } from "./constants.js";
import { PromptLibrary } from "./prompt-library.js";
import { loadRole, validateRoleManifest } from "./roles.js";
import { getWorkspacePaths, scanEntities } from "./workspace.js";

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

function addMissingFrontmatterWarnings(findings: DoctorFinding[], recordPath: string, data: Record<string, unknown>): void {
  for (const field of REQUIRED_RECORD_FIELDS) {
    if (!data[field]) {
      findings.push({ level: "warning", kind: "general", message: `${recordPath} is missing frontmatter field: ${field}` });
    }
  }
}

function extractPlaceholderLines(content: string): string[] {
  return [...new Set(content.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^(?:-\s*)?Add\b/.test(line)))];
}

function addPlaceholderWarnings(findings: DoctorFinding[], filePath: string, content: string): void {
  for (const line of extractPlaceholderLines(content).slice(0, 3)) {
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

async function validateMarkdownRecord(findings: DoctorFinding[], recordPath: string): Promise<void> {
  try {
    const content = await fs.readFile(recordPath, "utf8");
    const parsed = matter(content);
    const data = parsed.data as Record<string, unknown>;
    addMissingFrontmatterWarnings(findings, recordPath, data);
    addPlaceholderWarnings(findings, recordPath, content);
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
  const role = await loadRole(root, roleId);
  const paths = getWorkspacePaths(root, role);

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
    try {
      await fs.access(agentFilePath);
      await validateMarkdownRecord(findings, agentFilePath);
    } catch {
      addGeneralFinding(
        findings,
        "error",
        `Missing required agent file: ${path.relative(root, agentFilePath)}`,
      );
    }
  }

  for (const companyFile of SHARED_COMPANY_FILES) {
    const companyPath = path.join(paths.companyDir, companyFile);
    try {
      await fs.access(companyPath);
      if (companyFile === "record.md") {
        await validateMarkdownRecord(findings, companyPath);
      } else {
        const content = await fs.readFile(companyPath, "utf8");
        addPlaceholderWarnings(findings, companyPath, content);
      }
    } catch {
      if (companyFile === "record.md") {
        // Partial workspaces are allowed during onboarding.
      } else {
        addGeneralFinding(findings, "warning", `${companyPath} is missing or unreadable.`);
      }
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
    await validateMarkdownRecord(findings, recordPath);

    const entityDefinition = role.entities.find((definition) => definition.type === entity.type);
    if (entityDefinition) {
      for (const requiredFile of entityDefinition.files.filter((file) => file.path !== "record.md")) {
        const requiredPath = path.join(entity.path, requiredFile.path);
        try {
          const content = await fs.readFile(requiredPath, "utf8");
          addPlaceholderWarnings(findings, requiredPath, content);
        } catch {
          addGeneralFinding(findings, "warning", `${requiredPath} is missing or unreadable.`);
        }
      }
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    addGeneralFinding(findings, "warning", "OPENAI_API_KEY is not set. Agent prompts and web search will not run.");
  }

  if (findings.length === 0) {
    console.log("doctor: workspace looks healthy");
    return true;
  }

  printFindings(root, findings);
  return findings.every((finding) => finding.level !== "error");
}
