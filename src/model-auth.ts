import type { Model } from "@mariozechner/pi-ai";
import { getEnvApiKey } from "@mariozechner/pi-ai";
import { AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

import { DEFAULT_FALLBACK_MODELS, DEFAULT_MODEL } from "./constants.js";
import { normalizeProviderEnvironment } from "./provider-env.js";

/** Standard models per provider, in preference order. Used when no model is configured. */
const STANDARD_MODELS_PER_PROVIDER: Record<string, readonly string[]> = {
  openai: ["gpt-5.4"],
  anthropic: ["claude-opus-4-6"],
  google: ["gemini-3.1-pro"],
};

const PROVIDER_PRIORITY = [
  "anthropic",
  "openai",
  "google",
] as const;

export interface ModelReference {
  raw: string;
  provider: string;
  modelId: string;
}

export interface ResolvedAgentModel {
  model: Model<any>;
  selectionSource: "preferred" | "fallback" | "best-available";
  requestedModel?: ModelReference;
}

export interface ModelConfigurationDiagnostic {
  level: "info" | "warning";
  message: string;
}

function formatModelReference(model: ModelReference): string {
  return `${model.provider}/${model.modelId}`;
}

function formatCredentialHint(provider: string): string {
  switch (provider) {
    case "openai":
    case "openai-codex":
    case "github-copilot":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "google":
    case "google-antigravity":
      return "GEMINI_API_KEY or GOOGLE_API_KEY";
    case "google-gemini-cli":
      return "GEMINI_API_KEY";
    case "google-vertex":
      return "Google Vertex credentials";
    case "amazon-bedrock":
      return "AWS Bedrock credentials";
    case "azure-openai-responses":
      return "Azure OpenAI credentials";
    case "mistral":
      return "MISTRAL_API_KEY";
    case "groq":
      return "GROQ_API_KEY";
    case "xai":
      return "XAI_API_KEY";
    case "openrouter":
      return "OPENROUTER_API_KEY";
    case "cerebras":
      return "CEREBRAS_API_KEY";
    default:
      return `${provider} credentials`;
  }
}

function describeCredentialConfiguration(authStorage: AuthStorage, provider: string): string {
  normalizeProviderEnvironment();

  if (authStorage.has(provider)) {
    return `stored ${provider} credentials`;
  }

  if (getEnvApiKey(provider)) {
    return `${formatCredentialHint(provider)} from the environment`;
  }

  return formatCredentialHint(provider);
}

function formatProviderList(providers: readonly string[]): string {
  return providers.map((provider) => formatCredentialHint(provider)).join(", ");
}

function selectBestAvailableModel(available: readonly Model<any>[]): Model<any> | undefined {
  const byKey = new Map<string, Model<any>>();
  for (const m of available) {
    byKey.set(`${m.provider}/${m.id}`, m);
  }

  for (const provider of PROVIDER_PRIORITY) {
    const modelIds = STANDARD_MODELS_PER_PROVIDER[provider];
    if (!modelIds) continue;
    for (const modelId of modelIds) {
      const model = byKey.get(`${provider}/${modelId}`);
      if (model) return model;
    }
  }

  return available[0];
}

export function parseModelReference(modelName: string): ModelReference {
  const normalized = modelName.trim();
  if (!normalized) {
    throw new Error("Model reference cannot be empty.");
  }

  if (normalized.includes("/")) {
    const [provider = "openai", ...rest] = normalized.split("/");
    const modelId = rest.join("/");
    return {
      raw: normalized,
      provider,
      modelId,
    };
  }

  return {
    raw: normalized,
    provider: "openai",
    modelId: normalized,
  };
}

export function collectModelPreferences(
  preferredModel = DEFAULT_MODEL,
  fallbackModels: readonly string[] = DEFAULT_FALLBACK_MODELS,
): ModelReference[] {
  const seen = new Set<string>();
  const rawModels = [preferredModel, ...fallbackModels].filter((value): value is string => typeof value === "string");
  const preferences: ModelReference[] = [];

  for (const rawModel of rawModels) {
    const parsed = parseModelReference(rawModel);
    const key = `${parsed.provider}/${parsed.modelId}`;
    if (parsed.modelId.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    preferences.push(parsed);
  }

  return preferences;
}

function buildModelResolutionError(
  authStorage: AuthStorage,
  modelRegistry: ModelRegistry,
  preferences: readonly ModelReference[],
): Error {
  const available = modelRegistry.getAvailable();
  const providerIssues = new Map<string, string>();
  const missingModelNames = new Set<string>();

  for (const preference of preferences) {
    const configuredModel = modelRegistry.find(preference.provider, preference.modelId);
    if (!configuredModel) {
      missingModelNames.add(formatModelReference(preference));
      continue;
    }

    if (!authStorage.hasAuth(preference.provider)) {
      providerIssues.set(
        preference.provider,
        `No credentials are configured for provider "${preference.provider}" (${describeCredentialConfiguration(authStorage, preference.provider)}).`,
      );
    }
  }

  const details: string[] = [];
  if (providerIssues.size > 0) {
    details.push(...providerIssues.values());
  }
  if (missingModelNames.size > 0) {
    details.push(`Unknown model preference(s): ${[...missingModelNames].join(", ")}.`);
  }
  if (available.length > 0) {
    details.push(
      `Configured available model(s): ${available.map((model) => `${model.provider}/${model.id}`).join(", ")}.`,
    );
  }

  const configuredProviders = [...new Set(modelRegistry.getAll().map((model) => model.provider).filter((provider) => authStorage.hasAuth(provider)))];

  if (preferences.length === 0) {
    return new Error(
      [
        "No configured model is available for Hermit.",
        configuredProviders.length > 0
          ? `Configured providers were detected, but no usable model could be resolved from them: ${configuredProviders.join(", ")}.`
          : `No provider credentials were found. Set one supported provider API key such as ${formatProviderList(["openai", "anthropic", "google", "openrouter"])}.`,
      ].join(" "),
    );
  }

  const configuredPreferences = preferences.map(formatModelReference).join(", ");
  return new Error(
    [
      `No configured model is available for Hermit. Current preference order: ${configuredPreferences}.`,
      ...details,
      "Configure credentials for one of those providers or adjust ROLE_AGENT_MODEL / ROLE_AGENT_FALLBACK_MODELS.",
    ].join(" "),
  );
}

export async function resolveProviderApiKeyForDirectSdk(
  authStorage: AuthStorage,
  provider: string,
): Promise<string | undefined> {
  normalizeProviderEnvironment();

  const storedCredential = authStorage.get(provider);
  if (provider === "anthropic" && storedCredential?.type === "oauth") {
    // Anthropic's standalone SDK expects a real API key, not the subscription OAuth token
    // that model execution can use. Prefer an explicit ANTHROPIC_API_KEY from env/keychain.
    return getEnvApiKey(provider);
  }

  return authStorage.getApiKey(provider);
}

export function resolveConfiguredModel(
  authStorage: AuthStorage,
  modelRegistry: ModelRegistry,
  preferredModel = DEFAULT_MODEL,
  fallbackModels: readonly string[] = DEFAULT_FALLBACK_MODELS,
): ResolvedAgentModel {
  const preferences = collectModelPreferences(preferredModel, fallbackModels);
  const available = modelRegistry.getAvailable();

  for (const [index, preference] of preferences.entries()) {
    const model = available.find((candidate) => candidate.provider === preference.provider && candidate.id === preference.modelId);
    if (model) {
      return {
        model,
        requestedModel: preference,
        selectionSource: index === 0 ? "preferred" : "fallback",
      };
    }
  }

  const bestAvailable = selectBestAvailableModel(available);
  if (bestAvailable) {
    return {
      model: bestAvailable,
      selectionSource: "best-available",
    };
  }

  throw buildModelResolutionError(authStorage, modelRegistry, preferences);
}

export function assertProviderAwareModelConfigured(): ResolvedAgentModel {
  normalizeProviderEnvironment();

  const authStorage = AuthStorage.create();
  const modelRegistry = new ModelRegistry(authStorage);
  return resolveConfiguredModel(authStorage, modelRegistry);
}

export function getProviderAwareModelDiagnostics(): ModelConfigurationDiagnostic[] {
  normalizeProviderEnvironment();

  const authStorage = AuthStorage.create();
  const modelRegistry = new ModelRegistry(authStorage);
  const preferences = collectModelPreferences();

  try {
    const resolved = resolveConfiguredModel(authStorage, modelRegistry);
    const selectedName = `${resolved.model.provider}/${resolved.model.id}`;
    const preferredName = preferences[0] ? formatModelReference(preferences[0]) : selectedName;

    if (resolved.selectionSource === "preferred") {
      return [
        {
          level: "info",
          message: `Using configured model ${selectedName}.`,
        },
      ];
    }

    if (resolved.selectionSource === "fallback") {
      return [
        {
          level: "warning",
          message: `Preferred model ${preferredName} is unavailable. Hermit will use fallback model ${selectedName}.`,
        },
      ];
    }

    if (preferences.length > 0) {
      return [
        {
          level: "warning",
          message: `None of the configured model preferences are available. Hermit will use the best available configured model ${selectedName}.`,
        },
      ];
    }

    return [
      {
        level: "info",
        message: `Auto-selected the best available configured model ${selectedName}. Set ROLE_AGENT_MODEL to pin a specific model.`,
      },
    ];
  } catch (error) {
    return [
      {
        level: "warning",
        message: error instanceof Error ? error.message : String(error),
      },
    ];
  }
}
