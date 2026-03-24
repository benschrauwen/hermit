import { promises as fs } from "node:fs";
import path from "node:path";

import { HERMIT_ROLE_ID } from "./constants.js";
import { resolveFrameworkRoot, resolveSharedPromptDirectories } from "./runtime-paths.js";
import type { PromptContext, RoleDefinition } from "./types.js";

interface PromptSource {
  fileName: string;
  fullPath: string;
  content: string;
}

export interface PromptPartBreakdown {
  kind: "shared" | "agents" | "role-prompt";
  sourcePath: string;
  renderedChars: number;
}

interface RenderedPromptPart extends PromptPartBreakdown {
  content: string;
}

export class PromptLibrary {
  private constructor(
    private readonly sharedPromptDirectories: string[],
    private readonly sharedPromptContents: PromptSource[],
    private readonly agentsContent: string,
    private readonly role?: RoleDefinition,
  ) {}

  static async load(role: RoleDefinition): Promise<PromptLibrary> {
    const sharedPromptDirectories = resolveSharedPromptDirectories(role.root, role.frameworkRoot);
    const sharedPromptContents = await this.loadSharedPrompts(sharedPromptDirectories);
    const agentsContent = await fs.readFile(role.agentsFile, "utf8");

    return new PromptLibrary(sharedPromptDirectories, sharedPromptContents, agentsContent, role);
  }

  static async loadForWorkspace(root: string, agentsContent = "", frameworkRoot = resolveFrameworkRoot()): Promise<PromptLibrary> {
    const sharedPromptDirectories = resolveSharedPromptDirectories(root, frameworkRoot);
    const sharedPromptContents = await this.loadSharedPrompts(sharedPromptDirectories);
    return new PromptLibrary(sharedPromptDirectories, sharedPromptContents, agentsContent);
  }

  async renderSystemPrompt(
    context: PromptContext,
    additionalRolePromptFiles: string[] = [],
  ): Promise<string> {
    const parts = await this.buildSystemPromptParts(context, additionalRolePromptFiles);
    return parts.map((part) => part.content).join("\n\n");
  }

  async getSystemPromptBreakdown(
    context: PromptContext,
    additionalRolePromptFiles: string[] = [],
  ): Promise<PromptPartBreakdown[]> {
    const parts = await this.buildSystemPromptParts(context, additionalRolePromptFiles);
    return parts.map(({ content: _content, ...breakdown }) => breakdown);
  }

  async renderRolePrompt(fileName: string, context: PromptContext): Promise<string> {
    if (!this.role) {
      throw new Error("Role prompt rendering requires a role-backed prompt library.");
    }

    const content = await fs.readFile(path.join(this.role.rolePromptsDir, fileName), "utf8");
    return this.renderTemplate(content, context);
  }

  async renderSharedPromptDirectory(directoryName: string, context: PromptContext): Promise<string> {
    const contents = await PromptLibrary.loadLayeredMarkdownFiles(
      this.sharedPromptDirectories.map((directory) => path.join(directory, directoryName)),
    );
    return contents.map((entry) => this.renderTemplate(entry.content, context)).join("\n\n");
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

  private static async loadSharedPrompts(sharedPromptDirectories: string[]): Promise<PromptSource[]> {
    return this.loadLayeredMarkdownFiles(sharedPromptDirectories);
  }

  private static async loadMarkdownFiles(directory: string): Promise<PromptSource[]> {
    let entries: string[] = [];
    try {
      entries = await fs.readdir(directory);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
    const promptFileNames = entries.filter((f) => f.endsWith(".md")).sort();
    return Promise.all(
      promptFileNames.map(async (fileName) => ({
        fileName,
        fullPath: path.join(directory, fileName),
        content: await fs.readFile(path.join(directory, fileName), "utf8"),
      })),
    );
  }

  private static async loadLayeredMarkdownFiles(directories: string[]): Promise<PromptSource[]> {
    const layeredContents = new Map<string, PromptSource>();
    for (const directory of directories) {
      for (const source of await this.loadMarkdownFiles(directory)) {
        layeredContents.set(source.fileName, source);
      }
    }
    return [...layeredContents.values()].sort((left, right) => left.fileName.localeCompare(right.fileName));
  }

  private async buildSystemPromptParts(
    context: PromptContext,
    additionalRolePromptFiles: string[],
  ): Promise<RenderedPromptPart[]> {
    const parts: RenderedPromptPart[] = [];

    for (const source of this.sharedPromptContents) {
      parts.push(this.createPromptPart("shared", source.fullPath, source.content, context));
    }

    parts.push(this.createPromptPart("agents", this.role?.agentsFile ?? "AGENTS.md", this.agentsContent, context));

    for (const fileName of additionalRolePromptFiles) {
      if (!this.role) {
        throw new Error("Additional role prompts require a role-backed prompt library.");
      }

      const fullPath = path.join(this.role.rolePromptsDir, fileName);
      const content = await fs.readFile(fullPath, "utf8");
      parts.push(this.createPromptPart("role-prompt", fullPath, content, context));
    }

    return parts;
  }

  private createPromptPart(
    kind: PromptPartBreakdown["kind"],
    sourcePath: string,
    template: string,
    context: PromptContext,
  ): RenderedPromptPart {
    const content = this.renderTemplate(template, context);
    return {
      kind,
      sourcePath: this.toWorkspaceRelativePath(sourcePath, context.workspaceRoot),
      renderedChars: content.length,
      content,
    };
  }

  private toWorkspaceRelativePath(filePath: string, workspaceRoot: string): string {
    const relative = path.relative(workspaceRoot, filePath);
    return relative && !relative.startsWith("..") ? relative : filePath;
  }
}
