import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROMPT_BUNDLE,
  ONBOARDING_PROMPT_BUNDLE,
  REQUIRED_PROMPT_FILES,
  PROMPT_BUNDLES,
  REQUIRED_ROOT_DIRECTORIES,
  REQUIRED_SUPPORTING_DIRECTORIES,
  DEAL_SEQUENCE_WIDTH,
} from "../src/constants.js";

describe("constants", () => {
  it("REQUIRED_PROMPT_FILES lists all expected prompt files", () => {
    expect(REQUIRED_PROMPT_FILES).toContain("00-soul.md");
    expect(REQUIRED_PROMPT_FILES).toContain("15-routing.md");
    expect(REQUIRED_PROMPT_FILES).toContain("90-self-improvement.md");
    expect(REQUIRED_PROMPT_FILES.length).toBeGreaterThanOrEqual(10);
  });

  it("PROMPT_BUNDLES has entries for the normal and transcript session kinds", () => {
    expect(PROMPT_BUNDLES.default).toBeDefined();
    expect(PROMPT_BUNDLES["transcript-ingest"]).toBeDefined();
    expect(Array.isArray(PROMPT_BUNDLES.default)).toBe(true);
    expect(Array.isArray(PROMPT_BUNDLES["transcript-ingest"])).toBe(true);
  });

  it("every file in PROMPT_BUNDLES is in REQUIRED_PROMPT_FILES", () => {
    for (const files of Object.values(PROMPT_BUNDLES)) {
      for (const file of files) {
        expect(REQUIRED_PROMPT_FILES).toContain(file);
      }
    }
  });

  it("onboarding bundle includes onboarding guidance on top of the default bundle", () => {
    expect(ONBOARDING_PROMPT_BUNDLE).toContain("10-bootstrap.md");
    for (const file of DEFAULT_PROMPT_BUNDLE) {
      expect(ONBOARDING_PROMPT_BUNDLE).toContain(file);
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
