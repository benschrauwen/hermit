export const DEAL_SEQUENCE_WIDTH = 4;
export const SHARED_ROOT_DIRECTORIES = ["entities", "agents", "entity-defs", "skills"] as const;

export const DEFAULT_MODEL = process.env.ROLE_AGENT_MODEL ?? "openai/gpt-5.4";

const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

function parseThinkingLevel(value: string | undefined): ThinkingLevel {
  return THINKING_LEVELS.find((level) => level === value) ?? "medium";
}

export const DEFAULT_THINKING_LEVEL = parseThinkingLevel(process.env.ROLE_AGENT_THINKING_LEVEL);
