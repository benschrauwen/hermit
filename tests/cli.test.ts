import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(testsDir, "..");
const cliEntrypoint = path.join(workspaceRoot, "src", "cli.ts");

function runCliHelp(args: string[]): string {
  return execFileSync("node", ["--import", "tsx", cliEntrypoint, ...args, "--help"], {
    cwd: workspaceRoot,
    encoding: "utf8",
  });
}

describe("cli help", () => {
  it("exposes the git checkpoint opt-out on supported session commands", { timeout: 15_000 }, () => {
    expect(runCliHelp(["start"])).toContain("--no-git-checkpoints");
    expect(runCliHelp(["ask"])).toContain("--no-git-checkpoints");
  });

  it("documents the start command heartbeat interval", { timeout: 15_000 }, () => {
    expect(runCliHelp(["start"])).toContain("--interval <duration>");
  });
});
