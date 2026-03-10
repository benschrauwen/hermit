import { promises as fs } from "node:fs";
import path from "node:path";

import { HERMIT_ROLE_ID } from "./constants.js";
import type { PromptContext, RoleDefinition } from "./types.js";

export class PromptLibrary {
  private constructor(
    private readonly sharedPromptsDir: string,
    private readonly sharedPromptContents: string[],
    private readonly agentsContent: string,
    private readonly role?: RoleDefinition,
  ) {}

  static async load(role: RoleDefinition): Promise<PromptLibrary> {
    const sharedPromptContents = await this.loadSharedPrompts(role.sharedPromptsDir);
    const agentsContent = await fs.readFile(role.agentsFile, "utf8");

    return new PromptLibrary(role.sharedPromptsDir, sharedPromptContents, agentsContent, role);
  }

  static async loadForWorkspace(root: string, agentsContent = ""): Promise<PromptLibrary> {
    const sharedPromptsDir = path.join(root, "prompts");
    const sharedPromptContents = await this.loadSharedPrompts(sharedPromptsDir);
    return new PromptLibrary(sharedPromptsDir, sharedPromptContents, agentsContent);
  }

  async renderSystemPrompt(context: PromptContext, additionalRolePromptFiles: string[] = []): Promise<string> {
    const parts: string[] = [];

    for (const content of this.sharedPromptContents) {
      parts.push(this.renderTemplate(content, context));
    }

    parts.push(this.renderTemplate(this.agentsContent, context));

    for (const fileName of additionalRolePromptFiles) {
      if (!this.role) {
        throw new Error("Additional role prompts require a role-backed prompt library.");
      }

      const content = await fs.readFile(path.join(this.role.rolePromptsDir, fileName), "utf8");
      parts.push(this.renderTemplate(content, context));
    }

    return parts.join("\n\n");
  }

  async renderRolePrompt(fileName: string, context: PromptContext): Promise<string> {
    if (!this.role) {
      throw new Error("Role prompt rendering requires a role-backed prompt library.");
    }

    const content = await fs.readFile(path.join(this.role.rolePromptsDir, fileName), "utf8");
    return this.renderTemplate(content, context);
  }

  async renderSharedPromptDirectory(directoryName: string, context: PromptContext): Promise<string> {
    const contents = await PromptLibrary.loadMarkdownFiles(path.join(this.sharedPromptsDir, directoryName));
    return contents.map((content) => this.renderTemplate(content, context)).join("\n\n");
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
      roleId: context.roleId ?? this.role?.id ?? HERMIT_ROLE_ID,
      roleRoot: context.roleRoot ?? (this.role ? path.relative(context.workspaceRoot, this.role.roleDir) || "." : "."),
      entityId: context.entityId ?? "not-selected",
      entityPath: context.entityPath ?? "not-selected",
      transcriptPath: context.transcriptPath ?? "not-selected",
      currentDateTimeIso: context.currentDateTimeIso ?? "unknown",
      currentLocalDateTime: context.currentLocalDateTime ?? "unknown",
      currentTimeZone: context.currentTimeZone ?? "unknown",
      gitBranch: context.gitBranch ?? "unknown",
      gitHeadSha: context.gitHeadSha ?? "unknown",
      gitHeadShortSha: context.gitHeadShortSha ?? "unknown",
      gitHeadSubject: context.gitHeadSubject ?? "unknown",
      gitDirty: context.gitDirty === undefined ? "unknown" : context.gitDirty ? "yes" : "no",
      gitCheckpointBeforeSha: context.gitCheckpointBeforeSha ?? "not-created",
      gitCheckpointAfterSha: "not-created",
    };

    return template.replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) => values[key] ?? "");
  }

  private static async loadSharedPrompts(sharedPromptsDir: string): Promise<string[]> {
    return this.loadMarkdownFiles(sharedPromptsDir);
  }

  private static async loadMarkdownFiles(directory: string): Promise<string[]> {
    const entries = await fs.readdir(directory);
    const promptFileNames = entries.filter((f) => f.endsWith(".md")).sort();
    return Promise.all(promptFileNames.map((fileName) => fs.readFile(path.join(directory, fileName), "utf8")));
  }
}
