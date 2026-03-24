import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const DEFAULT_FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_WORKSPACE_DIRNAME = "workspace";
const LEGACY_WORKSPACE_DIRECTORIES = ["entities", "entity-defs", "agents", "inbox"] as const;
const execFileAsync = promisify(execFile);
const DEFAULT_WORKSPACE_GITIGNORE = `# Hermit transient runtime state
.hermit/sessions/
.hermit/telemetry/
.hermit/state/

# Role session history
agents/*/.role-agent/sessions/
agents/*/.role-agent/heartbeat-sessions/
`;

function normalizeAbsolutePath(value: string): string {
  return path.resolve(value);
}

export function assertSplitWorkspaceLayout(workspaceRoot: string, frameworkRoot = resolveFrameworkRoot()): void {
  if (normalizeAbsolutePath(workspaceRoot) === normalizeAbsolutePath(frameworkRoot)) {
    throw new Error(
      "Hermit requires a separate workspace repo. Do not use the framework checkout itself as the workspace; run from the Hermit checkout and let it use ./workspace automatically, or point HERMIT_WORKSPACE_ROOT at another workspace repo.",
    );
  }
}

export function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of paths) {
    const normalized = normalizeAbsolutePath(value);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function resolveFrameworkRoot(): string {
  const override = process.env.HERMIT_FRAMEWORK_ROOT?.trim();
  return override ? normalizeAbsolutePath(override) : DEFAULT_FRAMEWORK_ROOT;
}

export function resolveDefaultWorkspaceRoot(frameworkRoot = resolveFrameworkRoot()): string {
  return path.join(frameworkRoot, DEFAULT_WORKSPACE_DIRNAME);
}

export function resolveWorkspaceRootFromCwd(cwd: string, frameworkRoot = resolveFrameworkRoot()): string {
  const override = process.env.HERMIT_WORKSPACE_ROOT?.trim();
  if (override) {
    return normalizeAbsolutePath(override);
  }

  const normalizedCwd = normalizeAbsolutePath(cwd);
  const normalizedFrameworkRoot = normalizeAbsolutePath(frameworkRoot);
  const defaultWorkspaceRoot = resolveDefaultWorkspaceRoot(normalizedFrameworkRoot);

  if (normalizedCwd === normalizedFrameworkRoot || normalizedCwd.startsWith(`${normalizedFrameworkRoot}${path.sep}`)) {
    return defaultWorkspaceRoot;
  }

  const segments = normalizedCwd.split(path.sep);
  const agentsIndex = segments.lastIndexOf("agents");
  if (agentsIndex !== -1 && agentsIndex < segments.length - 1) {
    const rootSegments = segments.slice(0, agentsIndex);
    return normalizeAbsolutePath(rootSegments.length === 0 ? path.sep : rootSegments.join(path.sep));
  }

  return normalizedCwd;
}

async function initializeGitRepository(root: string): Promise<void> {
  try {
    await execFileAsync("git", ["init", "--initial-branch=main", root], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    await execFileAsync("git", ["init", root], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function moveLegacyDirectoryWithGit(frameworkRoot: string, sourceName: string, targetName: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["-C", frameworkRoot, "mv", "--", sourceName, targetName], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return true;
  } catch {
    return false;
  }
}

async function untrackWorkspaceDirectory(frameworkRoot: string, targetName: string): Promise<void> {
  try {
    await execFileAsync("git", ["-C", frameworkRoot, "rm", "-r", "--cached", "--ignore-unmatch", "--", targetName], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    // Leave the moved files in place even if the outer repo cannot drop them from the index automatically.
  }
}

async function migrateLegacyWorkspaceDirectories(workspaceRoot: string, frameworkRoot: string): Promise<void> {
  const normalizedWorkspaceRoot = normalizeAbsolutePath(workspaceRoot);
  const normalizedFrameworkRoot = normalizeAbsolutePath(frameworkRoot);
  if (normalizedWorkspaceRoot !== resolveDefaultWorkspaceRoot(normalizedFrameworkRoot)) {
    return;
  }

  await fs.mkdir(normalizedWorkspaceRoot, { recursive: true });

  for (const directoryName of LEGACY_WORKSPACE_DIRECTORIES) {
    const sourcePath = path.join(normalizedFrameworkRoot, directoryName);
    const targetPath = path.join(normalizedWorkspaceRoot, directoryName);
    if (!(await pathExists(sourcePath)) || await pathExists(targetPath)) {
      continue;
    }

    const movedWithGit = await moveLegacyDirectoryWithGit(
      normalizedFrameworkRoot,
      directoryName,
      path.join(DEFAULT_WORKSPACE_DIRNAME, directoryName),
    );
    if (!movedWithGit) {
      await fs.rename(sourcePath, targetPath);
    } else {
      await untrackWorkspaceDirectory(normalizedFrameworkRoot, path.join(DEFAULT_WORKSPACE_DIRNAME, directoryName));
    }
  }
}

async function writeWorkspaceGitignore(root: string): Promise<void> {
  const gitignorePath = path.join(root, ".gitignore");
  try {
    await fs.access(gitignorePath);
  } catch {
    await fs.writeFile(gitignorePath, DEFAULT_WORKSPACE_GITIGNORE, "utf8");
  }
}

export async function ensureWorkspaceRepository(root: string, frameworkRoot = resolveFrameworkRoot()): Promise<void> {
  assertSplitWorkspaceLayout(root, frameworkRoot);
  await migrateLegacyWorkspaceDirectories(root, frameworkRoot);
  await fs.mkdir(root, { recursive: true });
  await writeWorkspaceGitignore(root);

  try {
    await fs.access(path.join(root, ".git"));
  } catch {
    await initializeGitRepository(root);
  }
}

export function resolveSharedPromptDirectories(
  workspaceRoot: string,
  frameworkRoot = resolveFrameworkRoot(),
): string[] {
  assertSplitWorkspaceLayout(workspaceRoot, frameworkRoot);
  return uniquePaths([path.join(frameworkRoot, "prompts"), path.join(workspaceRoot, "prompts")]);
}

export function resolveSharedSkillDirectories(
  workspaceRoot: string,
  frameworkRoot = resolveFrameworkRoot(),
): string[] {
  assertSplitWorkspaceLayout(workspaceRoot, frameworkRoot);
  return uniquePaths([path.join(frameworkRoot, "skills"), path.join(workspaceRoot, "skills")]);
}

export function resolveSharedPromptTemplateCandidates(
  workspaceRoot: string,
  relativePath: string,
  frameworkRoot = resolveFrameworkRoot(),
): string[] {
  assertSplitWorkspaceLayout(workspaceRoot, frameworkRoot);
  return uniquePaths([
    path.join(workspaceRoot, "prompts", relativePath),
    path.join(frameworkRoot, "prompts", relativePath),
  ]);
}

export function resolveCommonAncestor(left: string, right: string): string {
  const leftParts = normalizeAbsolutePath(left).split(path.sep).filter(Boolean);
  const rightParts = normalizeAbsolutePath(right).split(path.sep).filter(Boolean);
  const shared: string[] = [];
  const limit = Math.min(leftParts.length, rightParts.length);

  for (let index = 0; index < limit; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      break;
    }
    shared.push(leftParts[index]!);
  }

  if (shared.length === 0) {
    return path.parse(normalizeAbsolutePath(left)).root;
  }

  return path.join(path.parse(normalizeAbsolutePath(left)).root, ...shared);
}
