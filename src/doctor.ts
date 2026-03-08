import matter from "gray-matter";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  REQUIRED_AGENT_FILES,
  REQUIRED_PROMPT_FILES,
  REQUIRED_ROOT_DIRECTORIES,
  REQUIRED_SUPPORTING_DIRECTORIES,
} from "./constants.js";
import { PromptLibrary } from "./prompt-library.js";
import { getWorkspacePaths, scanEntities } from "./workspace.js";

interface DoctorFinding {
  level: "error" | "warning" | "info";
  message: string;
}

const REQUIRED_RECORD_FIELDS = ["id", "type", "name", "updated_at"] as const;

function addMissingFrontmatterWarnings(findings: DoctorFinding[], recordPath: string, data: Record<string, unknown>): void {
  for (const field of REQUIRED_RECORD_FIELDS) {
    if (!data[field]) {
      findings.push({ level: "warning", message: `${recordPath} is missing frontmatter field: ${field}` });
    }
  }
}

function extractPlaceholderLines(content: string): string[] {
  return [...new Set(content.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^(?:-\s*)?Add\b/.test(line)))];
}

function addPlaceholderWarnings(findings: DoctorFinding[], filePath: string, content: string): void {
  for (const line of extractPlaceholderLines(content).slice(0, 3)) {
    findings.push({ level: "warning", message: `${filePath} still contains placeholder text: ${line}` });
  }
}

async function validateMarkdownRecord(findings: DoctorFinding[], recordPath: string): Promise<void> {
  try {
    const content = await fs.readFile(recordPath, "utf8");
    const parsed = matter(content);
    const data = parsed.data as Record<string, unknown>;
    addMissingFrontmatterWarnings(findings, recordPath, data);
    addPlaceholderWarnings(findings, recordPath, content);
  } catch {
    findings.push({ level: "warning", message: `${recordPath} is missing or unreadable.` });
  }
}

export async function runDoctor(root: string): Promise<boolean> {
  const findings: DoctorFinding[] = [];
  const paths = getWorkspacePaths(root);

  for (const relativePath of [...REQUIRED_ROOT_DIRECTORIES, ...REQUIRED_SUPPORTING_DIRECTORIES]) {
    try {
      const stat = await fs.stat(path.join(root, relativePath));
      if (!stat.isDirectory()) {
        findings.push({ level: "error", message: `${relativePath} exists but is not a directory.` });
      }
    } catch {
      findings.push({ level: "error", message: `Missing required directory: ${relativePath}` });
    }
  }

  try {
    await fs.access(paths.agentsFile);
  } catch {
    findings.push({ level: "error", message: "Missing AGENTS.md." });
  }

  try {
    const promptLibrary = await PromptLibrary.load(root);
    const missingLinks = promptLibrary.getMissingAgentLinks();
    for (const missingLink of missingLinks) {
      findings.push({ level: "error", message: `AGENTS.md is missing a link to ${missingLink}.` });
    }
  } catch (error) {
    findings.push({
      level: "error",
      message: error instanceof Error ? error.message : "Failed to load prompt library.",
    });
  }

  for (const promptFile of REQUIRED_PROMPT_FILES) {
    try {
      await fs.access(path.join(paths.promptsDir, promptFile));
    } catch {
      findings.push({ level: "error", message: `Missing prompt file: prompts/${promptFile}` });
    }
  }

  for (const agentFile of REQUIRED_AGENT_FILES) {
    try {
      await fs.access(path.join(root, agentFile));
    } catch {
      findings.push({ level: "error", message: `Missing required agent file: ${agentFile}` });
    }
  }

  const companyRecordPath = path.join(paths.companyDir, "record.md");
  try {
    await fs.access(companyRecordPath);
    await validateMarkdownRecord(findings, companyRecordPath);
  } catch {
    // Partial workspaces are allowed during onboarding.
  }

  const entities = await scanEntities(root);
  const seenIds = new Set<string>();

  for (const entity of entities) {
    if (seenIds.has(entity.id)) {
      findings.push({ level: "error", message: `Duplicate entity ID detected: ${entity.id}` });
    }
    seenIds.add(entity.id);

    const recordPath = path.join(entity.path, "record.md");
    await validateMarkdownRecord(findings, recordPath);

    if (entity.type === "deal") {
      for (const requiredFile of ["meddicc.md", "activity-log.md"]) {
        const requiredPath = path.join(entity.path, requiredFile);
        try {
          const content = await fs.readFile(requiredPath, "utf8");
          addPlaceholderWarnings(findings, requiredPath, content);
        } catch {
          findings.push({ level: "warning", message: `${requiredPath} is missing or unreadable.` });
        }
      }
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    findings.push({ level: "warning", message: "OPENAI_API_KEY is not set. Agent prompts and web search will not run." });
  }

  if (findings.length === 0) {
    console.log("doctor: workspace looks healthy");
    return true;
  }

  for (const finding of findings) {
    console.log(`${finding.level}: ${finding.message}`);
  }

  return findings.every((finding) => finding.level !== "error");
}
