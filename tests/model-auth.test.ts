import { describe, expect, it } from "vitest";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

import { collectModelPreferences, parseModelReference, resolveConfiguredModel } from "../src/model-auth.js";

describe("provider-aware model resolution", () => {
  it("parses slashless model names as OpenAI models", () => {
    expect(parseModelReference("gpt-5.4")).toEqual({
      raw: "gpt-5.4",
      provider: "openai",
      modelId: "gpt-5.4",
    });
  });

  it("collects preferred and fallback models in order", () => {
    expect(collectModelPreferences("openai/gpt-5.4", ["anthropic/claude-sonnet-4-6"])).toEqual([
      {
        raw: "openai/gpt-5.4",
        provider: "openai",
        modelId: "gpt-5.4",
      },
      {
        raw: "anthropic/claude-sonnet-4-6",
        provider: "anthropic",
        modelId: "claude-sonnet-4-6",
      },
    ]);
  });

  it("uses a configured fallback model when the preferred provider has no auth", () => {
    const authStorage = AuthStorage.inMemory({
      anthropic: {
        type: "api_key",
        key: "test-key",
      },
    });
    const modelRegistry = new ModelRegistry(authStorage);

    const resolved = resolveConfiguredModel(
      authStorage,
      modelRegistry,
      "openai/gpt-5.4",
      ["anthropic/claude-sonnet-4-6"],
    );

    expect(resolved.selectionSource).toBe("fallback");
    expect(resolved.model.provider).toBe("anthropic");
    expect(resolved.model.id).toBe("claude-sonnet-4-6");
  });

  it("falls back to the first available configured model when preferences do not match", () => {
    const authStorage = AuthStorage.inMemory({
      anthropic: {
        type: "api_key",
        key: "test-key",
      },
    });
    const modelRegistry = new ModelRegistry(authStorage);

    const resolved = resolveConfiguredModel(
      authStorage,
      modelRegistry,
      "openai/not-a-real-model",
      ["google/missing-model"],
    );

    expect(resolved.selectionSource).toBe("best-available");
    expect(resolved.model.provider).toBe("anthropic");
  });

  it("auto-selects the best available configured model when no override is set", () => {
    const authStorage = AuthStorage.inMemory({
      openai: {
        type: "api_key",
        key: "openai-key",
      },
      anthropic: {
        type: "api_key",
        key: "anthropic-key",
      },
    });
    const modelRegistry = new ModelRegistry(authStorage);

    const resolved = resolveConfiguredModel(authStorage, modelRegistry, undefined, []);

    expect(resolved.selectionSource).toBe("best-available");
    expect([
      "openai/gpt-5.4-pro",
      "openai/gpt-5.4",
      "anthropic/claude-opus-4-6",
      "anthropic/claude-sonnet-4-6",
    ]).toContain(`${resolved.model.provider}/${resolved.model.id}`);
  });
});
