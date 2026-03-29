const GOOGLE_API_KEY_ENV = "GOOGLE_API_KEY";
const GEMINI_API_KEY_ENV = "GEMINI_API_KEY";

function getTrimmedEnvValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function normalizeProviderEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const googleApiKey = getTrimmedEnvValue(env, GOOGLE_API_KEY_ENV);
  const geminiApiKey = getTrimmedEnvValue(env, GEMINI_API_KEY_ENV);

  if (googleApiKey && !geminiApiKey) {
    env[GEMINI_API_KEY_ENV] = googleApiKey;
  }

  if (geminiApiKey && !googleApiKey) {
    env[GOOGLE_API_KEY_ENV] = geminiApiKey;
  }
}
