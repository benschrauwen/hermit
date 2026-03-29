import { getEnvApiKey } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeProviderEnvironment } from "../src/provider-env.js";

describe("provider environment normalization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats GOOGLE_API_KEY as an alias for Google model auth", () => {
    vi.stubEnv("GOOGLE_API_KEY", "google-key");
    vi.stubEnv("GEMINI_API_KEY", "");

    normalizeProviderEnvironment();

    expect(process.env.GEMINI_API_KEY).toBe("google-key");
    expect(getEnvApiKey("google")).toBe("google-key");
  });

  it("mirrors GEMINI_API_KEY back to GOOGLE_API_KEY for compatibility", () => {
    vi.stubEnv("GOOGLE_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "gemini-key");

    normalizeProviderEnvironment();

    expect(process.env.GOOGLE_API_KEY).toBe("gemini-key");
    expect(getEnvApiKey("google")).toBe("gemini-key");
  });
});
