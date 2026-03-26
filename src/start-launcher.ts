import { spawn, spawnSync } from "node:child_process";
import { constants as osConstants } from "node:os";
import process from "node:process";

import {
  HERMIT_TAILSCALE_NOTICE_ENV,
  HERMIT_TAILSCALE_URL_ENV,
  TAILSCALE_EXPLORER_TARGET,
  buildTailscaleExplorerUrl,
  hasAnyTailscaleServeConfig,
  hasExplorerServeConfig,
  parseTailscaleDnsNameFromStatusJson,
  parseTailscaleServeStatusJson,
} from "./tailscale.js";

interface CommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

interface ChildExitResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

interface StartEnvironment {
  childEnv: NodeJS.ProcessEnv;
  cleanup: () => void;
}

const SANDBOXED_START_SCRIPT = "start:session";

function runCommand(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10_000_000,
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(result.error instanceof Error ? { error: result.error } : {}),
  };
}

function extractFailureMessage(result: CommandResult): string | undefined {
  const fromError = result.error?.message?.trim();
  if (fromError) {
    return fromError;
  }

  const combined = [result.stderr, result.stdout]
    .flatMap((value) => value.split(/\r?\n/))
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return combined || undefined;
}

function resolveTailscaleStartEnvironment(): StartEnvironment {
  const childEnv: NodeJS.ProcessEnv = {};
  const statusResult = runCommand("tailscale", ["status", "--json"]);
  if (statusResult.error || statusResult.status !== 0) {
    return { childEnv, cleanup: () => undefined };
  }

  const dnsName = parseTailscaleDnsNameFromStatusJson(statusResult.stdout);
  if (!dnsName) {
    return { childEnv, cleanup: () => undefined };
  }

  const serveStatusResult = runCommand("tailscale", ["serve", "status", "--json"]);
  if (serveStatusResult.error || serveStatusResult.status !== 0) {
    childEnv[HERMIT_TAILSCALE_NOTICE_ENV] =
      "Tailscale is installed, but Hermit could not inspect Tailscale Serve automatically.";
    return { childEnv, cleanup: () => undefined };
  }

  const serveStatus = parseTailscaleServeStatusJson(serveStatusResult.stdout);
  if (!serveStatus) {
    childEnv[HERMIT_TAILSCALE_NOTICE_ENV] =
      "Tailscale is installed, but Hermit could not inspect Tailscale Serve automatically.";
    return { childEnv, cleanup: () => undefined };
  }

  if (hasExplorerServeConfig(serveStatus)) {
    childEnv[HERMIT_TAILSCALE_URL_ENV] = buildTailscaleExplorerUrl(dnsName);
    return { childEnv, cleanup: () => undefined };
  }

  if (hasAnyTailscaleServeConfig(serveStatus)) {
    childEnv[HERMIT_TAILSCALE_NOTICE_ENV] =
      "Tailscale Serve is already configured for another target, so Hermit left it unchanged.";
    return { childEnv, cleanup: () => undefined };
  }

  const serveStartResult = runCommand("tailscale", ["serve", "--yes", "--bg", TAILSCALE_EXPLORER_TARGET]);
  if (serveStartResult.error || serveStartResult.status !== 0) {
    childEnv[HERMIT_TAILSCALE_NOTICE_ENV] =
      "Tailscale is installed, but Hermit could not enable remote explorer access automatically.";
    return { childEnv, cleanup: () => undefined };
  }

  childEnv[HERMIT_TAILSCALE_URL_ENV] = buildTailscaleExplorerUrl(dnsName);

  let cleanedUp = false;
  return {
    childEnv,
    cleanup: () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      const stopResult = runCommand("tailscale", ["serve", "--yes", TAILSCALE_EXPLORER_TARGET, "off"]);
      if (stopResult.error || stopResult.status !== 0) {
        const reason = extractFailureMessage(stopResult);
        const detail = reason ? ` (${reason})` : "";
        process.stderr.write(`Hermit warning: failed to stop Tailscale Serve${detail}.\n`);
      }
    },
  };
}

async function runSandboxedStartScript(childEnv: NodeJS.ProcessEnv, forwardedArgs: string[]): Promise<ChildExitResult> {
  return new Promise<ChildExitResult>((resolve, reject) => {
    const child = spawn("npm", ["run", SANDBOXED_START_SCRIPT, "--", ...forwardedArgs], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...childEnv,
      },
      stdio: "inherit",
    });

    const forwardSignal = (signal: NodeJS.Signals) => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill(signal);
      }
    };

    const onSigint = () => {
      forwardSignal("SIGINT");
    };
    const onSigterm = () => {
      forwardSignal("SIGTERM");
    };

    process.on("SIGINT", onSigint);
    process.on("SIGTERM", onSigterm);

    const removeSignalHandlers = () => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
    };

    child.once("error", (error) => {
      removeSignalHandlers();
      reject(error instanceof Error ? error : new Error(String(error)));
    });

    child.once("exit", (code, signal) => {
      removeSignalHandlers();
      resolve({ code, signal });
    });
  });
}

function resolveExitCode(result: ChildExitResult): number {
  if (typeof result.code === "number") {
    return result.code;
  }

  if (result.signal) {
    return 128 + (osConstants.signals[result.signal] ?? 1);
  }

  return 1;
}

async function main(): Promise<void> {
  const startEnvironment = resolveTailscaleStartEnvironment();
  try {
    const exitResult = await runSandboxedStartScript(startEnvironment.childEnv, process.argv.slice(2));
    process.exitCode = resolveExitCode(exitResult);
  } finally {
    startEnvironment.cleanup();
  }
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
