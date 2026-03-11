import { afterEach, describe, expect, it } from "vitest";

import { assertOpenAiApiKeyConfigured, OPENAI_API_KEY_MISSING_MESSAGE } from "../src/openai-api-key.js";

describe("assertOpenAiApiKeyConfigured", () => {
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
      return;
    }

    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  });

  it("throws a clear error when OPENAI_API_KEY is missing", () => {
    delete process.env.OPENAI_API_KEY;

    expect(() => assertOpenAiApiKeyConfigured()).toThrow(OPENAI_API_KEY_MISSING_MESSAGE);
  });

  it("throws a clear error when OPENAI_API_KEY is blank", () => {
    process.env.OPENAI_API_KEY = "   ";

    expect(() => assertOpenAiApiKeyConfigured()).toThrow(OPENAI_API_KEY_MISSING_MESSAGE);
  });

  it("allows execution when OPENAI_API_KEY is present", () => {
    process.env.OPENAI_API_KEY = "test-key";

    expect(() => assertOpenAiApiKeyConfigured()).not.toThrow();
  });
});
