import { promises as fs } from "node:fs";
import path from "node:path";

import type { RoleDefinition } from "./types.js";
import type { PromptContext } from "./types.js";

export class PromptLibrary {
  private constructor(
    private readonly role: RoleDefinition,
    private readonly sharedPromptContents: string[],
    private readonly agentsContent: string,
  ) {}

  static async load(role: RoleDefinition): Promise<PromptLibrary> {
    const entries = await fs.readdir(role.sharedPromptsDir);
    const promptFileNames = entries.filter((f) => f.endsWith(".md")).sort();

    const sharedPromptContents = await Promise.all(
      promptFileNames.map((fileName) => fs.readFile(path.join(role.sharedPromptsDir, fileName), "utf8")),
    );

    const agentsContent = await fs.readFile(role.agentsFile, "utf8");

    return new PromptLibrary(role, sharedPromptContents, agentsContent);
  }

  async renderSystemPrompt(context: PromptContext, additionalRolePromptFiles: string[] = []): Promise<string> {
    const parts: string[] = [];

    for (const content of this.sharedPromptContents) {
      parts.push(this.renderTemplate(content, context));
    }

    parts.push(this.renderTemplate(this.agentsContent, context));

    for (const fileName of additionalRolePromptFiles) {
      const content = await fs.readFile(path.join(this.role.rolePromptsDir, fileName), "utf8");
      parts.push(this.renderTemplate(content, context));
    }

    return parts.join("\n\n");
  }

  async renderRolePrompt(fileName: string, context: PromptContext): Promise<string> {
    const content = await fs.readFile(path.join(this.role.rolePromptsDir, fileName), "utf8");
    return this.renderTemplate(content, context);
  }

  extractLinkedFiles(): string[] {
    const matches = this.agentsContent.matchAll(/\(([^)]+\.md)\)/g);
    return [...matches]
      .map((match) => match[1])
      .filter((value): value is string => value !== undefined);
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
