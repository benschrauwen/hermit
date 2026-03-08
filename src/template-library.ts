import { promises as fs } from "node:fs";

export type TemplateContextValue = string | number | boolean | undefined;

export class TemplateLibrary {
  async render(templatePath: string, context: Record<string, TemplateContextValue>): Promise<string> {
    const template = await fs.readFile(templatePath, "utf8");
    return TemplateLibrary.renderString(template, context);
  }

  static renderString(template: string, context: Record<string, TemplateContextValue>): string {
    return template.replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) => String(context[key] ?? ""));
  }
}

export function renderYamlList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `  - ${value}`).join("\n") : "  - none";
}

export function renderBulletList(values: string[], emptyLine: string): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : emptyLine;
}
