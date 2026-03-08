import { promises as fs } from "node:fs";
import path from "node:path";

import type { RoleDefinition } from "./types.js";
import type { PromptContext } from "./types.js";
import { getPromptDefinition, getPromptFilePath, getPromptLinkPath } from "./roles.js";

export class PromptLibrary {
  private constructor(
    private readonly role: RoleDefinition,
    private readonly agentsContent: string,
    private readonly promptFiles: Map<string, string>,
  ) {}

  static async load(role: RoleDefinition): Promise<PromptLibrary> {
    const agentsContent = await fs.readFile(role.agentsFile, "utf8");
    const promptFiles = new Map<string, string>();

    await Promise.all(
      role.requiredPromptIds.map(async (promptId) => {
        const content = await fs.readFile(getPromptFilePath(role, promptId), "utf8");
        promptFiles.set(promptId, content);
      }),
    );

    return new PromptLibrary(role, agentsContent, promptFiles);
  }

  getMissingAgentLinks(): string[] {
    const linkedFiles = new Set(this.extractLinkedPromptFiles());
    return this.role.requiredPromptIds
      .filter((promptId) => !linkedFiles.has(getPromptLinkPath(this.role, promptId)))
      .map((promptId) => getPromptLinkPath(this.role, promptId));
  }

  renderBundle(fileNames: readonly string[], context: PromptContext): string {
    const renderedFiles = fileNames.map((fileName) => this.renderTemplate(this.requirePromptFile(fileName), context));

    return renderedFiles.join("\n\n");
  }

  renderNamedPrompt(fileName: string, context: PromptContext): string {
    return this.renderTemplate(this.requirePromptFile(fileName), context);
  }

  listPromptIds(): string[] {
    return [...this.promptFiles.keys()].sort();
  }

  private extractLinkedPromptFiles(): string[] {
    const matches = this.agentsContent.matchAll(/\(([^)]+\.md)\)/g);
    return [...matches]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined);
  }

  private requirePromptFile(fileName: string): string {
    const content = this.promptFiles.get(fileName);
    if (!content) {
      const prompt = getPromptDefinition(this.role, fileName);
      throw new Error(`Missing prompt file: ${path.relative(this.role.root, getPromptFilePath(this.role, prompt.id))}`);
    }

    return content;
  }

  private renderTemplate(template: string, context: PromptContext): string {
    const values: Record<string, string> = {
      workspaceRoot: context.workspaceRoot,
      roleId: context.roleId ?? this.role.id,
      roleRoot: context.roleRoot ?? (path.relative(context.workspaceRoot, this.role.roleDir) || "."),
      entityId: context.entityId ?? "not-selected",
      entityPath: context.entityPath ?? "not-selected",
      transcriptPath: context.transcriptPath ?? "not-selected",
      currentDateTimeIso: context.currentDateTimeIso ?? "unknown",
      currentLocalDateTime: context.currentLocalDateTime ?? "unknown",
      currentTimeZone: context.currentTimeZone ?? "unknown",
    };

    return template.replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
  }
}
