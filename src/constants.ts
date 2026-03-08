export const DEAL_SEQUENCE_WIDTH = 4;
export const SHARED_ROOT_DIRECTORIES = ["company", "people", "roles"] as const;
export const SHARED_COMPANY_FILES = ["record.md", "strategy.md", "gtm.md"] as const;

export const DEFAULT_MODEL = process.env.ROLE_AGENT_MODEL ?? "openai/gpt-5.4";
export const DEFAULT_WEB_SEARCH_MODEL = process.env.ROLE_AGENT_WEB_SEARCH_MODEL ?? DEFAULT_MODEL;
export const DEFAULT_THINKING_LEVEL = process.env.ROLE_AGENT_THINKING_LEVEL ?? "medium";
