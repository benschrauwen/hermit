import type { InternalMode } from "./types.js";

export const REQUIRED_PROMPT_FILES = [
  "00-core-persona.md",
  "05-file-rules.md",
  "10-bootstrap.md",
  "20-mode-product.md",
  "21-mode-people.md",
  "22-mode-pipeline.md",
  "23-mode-transcript-ingest.md",
  "24-mode-deal.md",
  "40-command-transcript-run.md",
  "90-self-improvement.md",
] as const;

export const PROMPT_BUNDLES: Record<InternalMode, readonly string[]> = {
  bootstrap: ["00-core-persona.md", "05-file-rules.md", "10-bootstrap.md"],
  product: ["00-core-persona.md", "05-file-rules.md", "20-mode-product.md"],
  people: ["00-core-persona.md", "05-file-rules.md", "21-mode-people.md"],
  pipeline: ["00-core-persona.md", "05-file-rules.md", "22-mode-pipeline.md"],
  deal: ["00-core-persona.md", "05-file-rules.md", "24-mode-deal.md"],
  "transcript-ingest": ["00-core-persona.md", "05-file-rules.md", "23-mode-transcript-ingest.md"],
  "prompt-maintenance": ["00-core-persona.md", "05-file-rules.md", "90-self-improvement.md"],
};

export const REQUIRED_ROOT_DIRECTORIES = [
  "company",
  "people",
  "product",
  "deals",
  "supporting-files",
  "prompts",
  ".sales-agent/sessions",
] as const;

export const REQUIRED_SUPPORTING_DIRECTORIES = [
  "supporting-files/inbox",
  "supporting-files/unmatched-transcripts",
  "supporting-files/reference",
];

export const DEAL_SEQUENCE_WIDTH = 4;
export const DEFAULT_MODEL = process.env.SALES_AGENT_MODEL ?? "openai/gpt-5.4";
export const DEFAULT_WEB_SEARCH_MODEL = process.env.SALES_AGENT_WEB_SEARCH_MODEL ?? DEFAULT_MODEL;
export const DEFAULT_THINKING_LEVEL = process.env.SALES_AGENT_THINKING_LEVEL ?? "medium";
