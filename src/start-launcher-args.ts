function isTruthyNpmFlag(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "" || normalized === "true" || normalized === "1";
}

const CONTINUE_ENV_KEY = "npm_config_continue";

export function resolveStartLauncherArgs(
  rawArgs: string[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const args = [...rawArgs];

  if (!args.includes("--continue") && isTruthyNpmFlag(env[CONTINUE_ENV_KEY])) {
    args.push("--continue");
  }

  return args;
}

export function resolveStartLauncherEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...env,
    [CONTINUE_ENV_KEY]: undefined,
  };
}
