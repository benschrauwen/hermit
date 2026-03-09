import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DEFAULT_CHECKPOINT_PATH_ALLOWLIST = [
  "agents",
  "entities",
  "entity-defs",
  "prompts",
  "skills",
  "src",
  "tests",
  "docs",
  "README.md",
] as const;

type CheckpointPhase = "before" | "after";

export interface GitHeadSummary {
  branch?: string;
  headSha?: string;
  headShortSha?: string;
  headSubject?: string;
}

export interface RepoState extends GitHeadSummary {
  dirty: boolean;
  relevantChangedFiles: string[];
}

export interface CheckpointMetadata {
  commandName: string;
  roleId?: string;
  phase: CheckpointPhase;
  sessionId: string;
}

export interface CheckpointResult extends GitHeadSummary {
  checkpointSha: string;
  changedFiles: string[];
}

interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function isExecError(error: unknown): error is Error & { stdout?: string; stderr?: string; code?: number | string } {
  return error instanceof Error;
}

function normalizeStatusPath(value: string): string {
  const withoutRenamePrefix = value.includes(" -> ") ? value.split(" -> ").pop() ?? value : value;
  return withoutRenamePrefix.replace(/^"(.*)"$/, "$1");
}

function parseStatusOutput(output: string): string[] {
  const files = new Set<string>();

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }

    const candidate = normalizeStatusPath(line.slice(3).trim());
    if (candidate) {
      files.add(candidate);
    }
  }

  return [...files].sort();
}

function buildCheckpointMessage(metadata: CheckpointMetadata): [string, string] {
  const roleScope = metadata.roleId ?? "workspace";
  const subject = `chore(checkpoint): ${metadata.phase} ${metadata.commandName} ${roleScope}`;
  const trailers = [
    `Hermit-Command: ${metadata.commandName}`,
    ...(metadata.roleId ? [`Hermit-Role: ${metadata.roleId}`] : []),
    `Hermit-Phase: ${metadata.phase}`,
    `Hermit-Session: ${metadata.sessionId}`,
  ].join("\n");

  return [subject, trailers];
}

async function runGit(
  root: string,
  args: string[],
  options: { allowFailure?: boolean } = {},
): Promise<GitCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", root, ...args], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      stdout,
      stderr,
      exitCode: 0,
    };
  } catch (error) {
    if (options.allowFailure && isExecError(error)) {
      return {
        stdout: error.stdout ?? "",
        stderr: error.stderr ?? "",
        exitCode: typeof error.code === "number" ? error.code : 1,
      };
    }

    if (isExecError(error)) {
      const stderr = error.stderr?.trim();
      throw new Error(stderr ? `git ${args.join(" ")} failed: ${stderr}` : `git ${args.join(" ")} failed`);
    }

    throw error;
  }
}

async function isGitRepository(root: string): Promise<boolean> {
  const result = await runGit(root, ["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
  return result.exitCode === 0 && result.stdout.trim() === "true";
}

export async function getHeadSummary(root: string): Promise<GitHeadSummary | undefined> {
  if (!(await isGitRepository(root))) {
    return undefined;
  }

  const [branchResult, headResult, shortHeadResult, subjectResult] = await Promise.all([
    runGit(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true }),
    runGit(root, ["rev-parse", "--verify", "HEAD"], { allowFailure: true }),
    runGit(root, ["rev-parse", "--short", "HEAD"], { allowFailure: true }),
    runGit(root, ["log", "-1", "--pretty=%s"], { allowFailure: true }),
  ]);

  return {
    ...(branchResult.exitCode === 0 && branchResult.stdout.trim()
      ? { branch: branchResult.stdout.trim() }
      : {}),
    ...(headResult.exitCode === 0 && headResult.stdout.trim() ? { headSha: headResult.stdout.trim() } : {}),
    ...(shortHeadResult.exitCode === 0 && shortHeadResult.stdout.trim()
      ? { headShortSha: shortHeadResult.stdout.trim() }
      : {}),
    ...(subjectResult.exitCode === 0 && subjectResult.stdout.trim()
      ? { headSubject: subjectResult.stdout.trim() }
      : {}),
  };
}

export async function listRelevantChangedFiles(root: string): Promise<string[]> {
  if (!(await isGitRepository(root))) {
    return [];
  }

  const result = await runGit(root, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ...DEFAULT_CHECKPOINT_PATH_ALLOWLIST,
  ]);

  return parseStatusOutput(result.stdout);
}

export async function getRepoState(root: string): Promise<RepoState | undefined> {
  if (!(await isGitRepository(root))) {
    return undefined;
  }

  const [head, relevantChangedFiles] = await Promise.all([getHeadSummary(root), listRelevantChangedFiles(root)]);

  return {
    ...head,
    dirty: relevantChangedFiles.length > 0,
    relevantChangedFiles,
  };
}

export function shouldCheckpoint(state: Pick<RepoState, "dirty"> | undefined): boolean {
  return Boolean(state?.dirty);
}

export async function createCheckpoint(
  root: string,
  metadata: CheckpointMetadata,
): Promise<CheckpointResult | undefined> {
  if (!(await isGitRepository(root))) {
    return undefined;
  }

  const changedFiles = await listRelevantChangedFiles(root);
  if (changedFiles.length === 0) {
    return undefined;
  }

  await runGit(root, ["add", "--", ...changedFiles]);

  const [subject, trailers] = buildCheckpointMessage(metadata);
  await runGit(root, [
    "commit",
    "--quiet",
    "--only",
    "-m",
    subject,
    "-m",
    trailers,
    "--",
    ...changedFiles,
  ]);

  const head = await getHeadSummary(root);
  if (!head?.headSha) {
    throw new Error("Checkpoint commit succeeded but HEAD could not be resolved.");
  }

  return {
    ...head,
    checkpointSha: head.headSha,
    changedFiles,
  };
}
