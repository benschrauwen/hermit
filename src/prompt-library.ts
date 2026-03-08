import { promises as fs } from "node:fs";
import path from "node:path";

import { PROMPT_BUNDLES, REQUIRED_PROMPT_FILES } from "./constants.js";
import type { InternalMode, PromptContext } from "./types.js";
import { getWorkspacePaths } from "./workspace.js";

export class PromptLibrary {
  private constructor(
    private readonly root: string,
    private readonly agentsContent: string,
    private readonly promptFiles: Map<string, string>,
  ) {}

  static async load(root: string): Promise<PromptLibrary> {
    const paths = getWorkspacePaths(root);
    const agentsContent = await fs.readFile(paths.agentsFile, "utf8");
    const promptFiles = new Map<string, string>();

    await Promise.all(
      REQUIRED_PROMPT_FILES.map(async (fileName) => {
        const content = await fs.readFile(path.join(paths.promptsDir, fileName), "utf8");
        promptFiles.set(fileName, content);
      }),
    );

    return new PromptLibrary(root, agentsContent, promptFiles);
  }

  getMissingAgentLinks(): string[] {
    const linkedFiles = new Set(this.extractLinkedPromptFiles());
    return REQUIRED_PROMPT_FILES.filter((fileName) => !linkedFiles.has(`prompts/${fileName}`));
  }

  renderBundle(mode: InternalMode, context: PromptContext): string {
    const fileNames = PROMPT_BUNDLES[mode];
    const renderedFiles = fileNames.map((fileName) => this.renderTemplate(this.requirePromptFile(fileName), context));

    return renderedFiles.join("\n\n");
  }

  renderNamedPrompt(fileName: string, context: PromptContext): string {
    return this.renderTemplate(this.requirePromptFile(fileName), context);
  }

  listPromptFiles(): string[] {
    return [...this.promptFiles.keys()].sort();
  }

  private extractLinkedPromptFiles(): string[] {
    const matches = this.agentsContent.matchAll(/\((prompts\/[^)]+\.md)\)/g);
    return [...matches]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined);
  }

  private requirePromptFile(fileName: string): string {
    const content = this.promptFiles.get(fileName);
    if (!content) {
      throw new Error(`Missing prompt file: ${fileName}`);
    }

    return content;
  }

  private renderTemplate(template: string, context: PromptContext): string {
    const values: Record<string, string> = {
      workspaceRoot: context.workspaceRoot,
      entityId: context.entityId ?? "not-selected",
      entityPath: context.entityPath ?? "not-selected",
      transcriptPath: context.transcriptPath ?? "not-selected",
    };

    return template.replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
  }
}
