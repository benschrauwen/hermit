export const ENTITY_SEQUENCE_WIDTH = 4;
export const SHARED_ROOT_DIRECTORIES = ["entities", "agents", "entity-defs", "skills", "inbox"] as const;
export const HERMIT_ROLE_ID = "Hermit";
export const HERMIT_ROLE_ROOT = ".hermit";

export const DEFAULT_MODEL = process.env.ROLE_AGENT_MODEL?.trim() || undefined;
export const DEFAULT_FALLBACK_MODELS = (process.env.ROLE_AGENT_FALLBACK_MODELS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

function parseThinkingLevel(value: string | undefined): ThinkingLevel {
  return THINKING_LEVELS.find((level) => level === value) ?? "medium";
}

export const DEFAULT_THINKING_LEVEL = parseThinkingLevel(process.env.ROLE_AGENT_THINKING_LEVEL);
