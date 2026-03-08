import { describe, it, expect } from "vitest";
import {
  REQUIRED_PROMPT_FILES,
  PROMPT_BUNDLES,
  REQUIRED_ROOT_DIRECTORIES,
  REQUIRED_SUPPORTING_DIRECTORIES,
  DEAL_SEQUENCE_WIDTH,
} from "../src/constants.js";

describe("constants", () => {
  it("REQUIRED_PROMPT_FILES lists all expected prompt files", () => {
    expect(REQUIRED_PROMPT_FILES).toContain("00-core-persona.md");
    expect(REQUIRED_PROMPT_FILES).toContain("90-self-improvement.md");
    expect(REQUIRED_PROMPT_FILES.length).toBeGreaterThanOrEqual(10);
  });

  it("PROMPT_BUNDLES has an entry for every internal mode", () => {
    const modes = [
      "bootstrap",
      "product",
      "people",
      "pipeline",
      "deal",
      "transcript-ingest",
      "prompt-maintenance",
    ] as const;
    for (const mode of modes) {
      expect(PROMPT_BUNDLES[mode]).toBeDefined();
      expect(Array.isArray(PROMPT_BUNDLES[mode])).toBe(true);
    }
  });

  it("every file in PROMPT_BUNDLES is in REQUIRED_PROMPT_FILES", () => {
    for (const files of Object.values(PROMPT_BUNDLES)) {
      for (const file of files) {
        expect(REQUIRED_PROMPT_FILES).toContain(file);
      }
    }
  });

  it("REQUIRED_ROOT_DIRECTORIES includes company, people, product, deals, prompts", () => {
    expect(REQUIRED_ROOT_DIRECTORIES).toContain("company");
    expect(REQUIRED_ROOT_DIRECTORIES).toContain("people");
    expect(REQUIRED_ROOT_DIRECTORIES).toContain("product");
    expect(REQUIRED_ROOT_DIRECTORIES).toContain("deals");
    expect(REQUIRED_ROOT_DIRECTORIES).toContain("prompts");
    expect(REQUIRED_ROOT_DIRECTORIES).toContain("supporting-files");
  });

  it("REQUIRED_SUPPORTING_DIRECTORIES lists expected subdirs", () => {
    expect(REQUIRED_SUPPORTING_DIRECTORIES).toContain("supporting-files/inbox");
    expect(REQUIRED_SUPPORTING_DIRECTORIES).toContain(
      "supporting-files/unmatched-transcripts",
    );
  });

  it("DEAL_SEQUENCE_WIDTH is 4", () => {
    expect(DEAL_SEQUENCE_WIDTH).toBe(4);
  });
});
