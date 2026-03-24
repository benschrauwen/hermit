import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { assertSplitWorkspaceLayout, resolveFrameworkRoot, uniquePaths } from "./runtime-paths.js";

const execFileAsync = promisify(execFile);

type CheckpointPhase = "before" | "after";
export type CheckpointOutcome = "success" | "aborted" | "failed";

export interface GitHeadSummary {
  branch?: string;
  headSha?: string;
  headShortSha?: string;
  headSubject?: string;
}

export interface RepoState extends GitHeadSummary {
  dirty: boolean;
  changedFiles: string[];
}

export interface CheckpointMetadata {
  commandName: string;
  roleId?: string;
  phase: CheckpointPhase;
  sessionId: string;
  outcome?: CheckpointOutcome;
}

export interface CheckpointResult extends GitHeadSummary {
  checkpointSha: string;
  changedFiles: string[];
}

export interface GitCommandResult {
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
  const subjectSuffix = metadata.phase === "after" && metadata.outcome ? ` ${metadata.outcome}` : "";
  const subject = `chore(checkpoint): ${metadata.phase} ${metadata.commandName} ${roleScope}${subjectSuffix}`;
  const trailers = [
    `Hermit-Command: ${metadata.commandName}`,
    ...(metadata.roleId ? [`Hermit-Role: ${metadata.roleId}`] : []),
    `Hermit-Phase: ${metadata.phase}`,
    ...(metadata.phase === "after" && metadata.outcome ? [`Hermit-Outcome: ${metadata.outcome}`] : []),
    `Hermit-Session: ${metadata.sessionId}`,
  ].join("\n");

  return [subject, trailers];
}

export async function runGitCommand(
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

export async function isGitRepository(root: string): Promise<boolean> {
  const result = await runGitCommand(root, ["rev-parse", "--show-toplevel"], { allowFailure: true });
  if (result.exitCode !== 0) {
    return false;
  }

  return path.resolve(result.stdout.trim()) === path.resolve(root);
}

export function listCheckpointRoots(workspaceRoot: string, frameworkRoot = resolveFrameworkRoot()): string[] {
  assertSplitWorkspaceLayout(workspaceRoot, frameworkRoot);
  return uniquePaths([workspaceRoot, frameworkRoot]);
}

export async function getHeadSummary(root: string): Promise<GitHeadSummary | undefined> {
  if (!(await isGitRepository(root))) {
    return undefined;
  }

  const [branchResult, headResult, shortHeadResult, subjectResult] = await Promise.all([
    runGitCommand(root, ["symbolic-ref", "--quiet", "--short", "HEAD"], { allowFailure: true }),
    runGitCommand(root, ["rev-parse", "--verify", "HEAD"], { allowFailure: true }),
    runGitCommand(root, ["rev-parse", "--short", "HEAD"], { allowFailure: true }),
    runGitCommand(root, ["log", "-1", "--pretty=%s"], { allowFailure: true }),
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

export async function listChangedFiles(root: string): Promise<string[]> {
  if (!(await isGitRepository(root))) {
    return [];
  }

  const result = await runGitCommand(root, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);

  return parseStatusOutput(result.stdout);
}

export async function getRepoState(root: string): Promise<RepoState | undefined> {
  if (!(await isGitRepository(root))) {
    return undefined;
  }

  const [head, changedFiles] = await Promise.all([getHeadSummary(root), listChangedFiles(root)]);

  return {
    ...head,
    dirty: changedFiles.length > 0,
    changedFiles,
  };
}

export function shouldCheckpointAfterTurn(
  beforeState: Pick<RepoState, "dirty"> | undefined,
  afterState: Pick<RepoState, "dirty"> | undefined,
  outcome: CheckpointOutcome,
  enabled = true,
): boolean {
  if (!enabled || outcome === "aborted") {
    return false;
  }

  return !Boolean(beforeState?.dirty) && Boolean(afterState?.dirty);
}

export async function createCheckpoint(
  root: string,
  metadata: CheckpointMetadata,
): Promise<CheckpointResult | undefined> {
  if (!(await isGitRepository(root))) {
    return undefined;
  }

  const changedFiles = await listChangedFiles(root);
  if (changedFiles.length === 0) {
    return undefined;
  }

  await runGitCommand(root, ["add", "-A", "--", "."]);

  const [subject, trailers] = buildCheckpointMessage(metadata);
  await runGitCommand(root, [
    "commit",
    "--quiet",
    "-m",
    subject,
    "-m",
    trailers,
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
