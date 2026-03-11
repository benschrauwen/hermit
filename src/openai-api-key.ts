export const OPENAI_API_KEY_MISSING_MESSAGE =
  "OPENAI_API_KEY is not set. Set it in your environment or .env file before running Hermit.";

export function assertOpenAiApiKeyConfigured(): void {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error(OPENAI_API_KEY_MISSING_MESSAGE);
  }
}
