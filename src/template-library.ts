import { promises as fs } from "node:fs";

export type TemplateContextValue = string | number | boolean | undefined;

const YAML_PLAIN_SCALAR_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/;
const YAML_RESERVED_SCALAR_PATTERN = /^(?:~|null|Null|NULL|true|True|TRUE|false|False|FALSE|yes|Yes|YES|no|No|NO|on|On|ON|off|Off|OFF)$/;
const YAML_NUMERIC_OR_DATE_PATTERN = /^(?:[+-]?(?:0|[1-9]\d*)(?:\.\d+)?|\d{4}-\d{2}-\d{2}(?:[Tt ].*)?)$/;

function withDerivedContextValues(context: Record<string, TemplateContextValue>): Record<string, string> {
  const derived: Record<string, string> = {};

  for (const [key, value] of Object.entries(context)) {
    const rendered = String(value ?? "");
    derived[key] = rendered;

    if (!key.endsWith("Yaml")) {
      derived[`${key}Yaml`] = renderYamlScalar(value);
    }
  }

  return derived;
}

export async function renderTemplate(templatePath: string, context: Record<string, TemplateContextValue>): Promise<string> {
  const template = await fs.readFile(templatePath, "utf8");
  return renderTemplateString(template, context);
}

export function renderTemplateString(template: string, context: Record<string, TemplateContextValue>): string {
  const derivedContext = withDerivedContextValues(context);
  return template.replaceAll(/\{\{(\w+)\}\}/g, (_match, key: string) => derivedContext[key] ?? "");
}

export function renderYamlScalar(value: TemplateContextValue): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : JSON.stringify(String(value));
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  const rendered = String(value ?? "");
  if (
    rendered.length === 0
    || rendered.includes(":")
    || rendered.includes("#")
    || rendered.includes("\n")
    || rendered.includes("\r")
    || rendered.includes("\t")
    || /^\s|\s$/.test(rendered)
    || !YAML_PLAIN_SCALAR_PATTERN.test(rendered)
    || YAML_RESERVED_SCALAR_PATTERN.test(rendered)
    || YAML_NUMERIC_OR_DATE_PATTERN.test(rendered)
  ) {
    return JSON.stringify(rendered);
  }

  return rendered;
}

export function renderYamlList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `  - ${renderYamlScalar(value)}`).join("\n") : "  - none";
}

export function renderBulletList(values: string[], emptyLine: string): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : emptyLine;
}
