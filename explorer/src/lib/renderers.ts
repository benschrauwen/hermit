import path from "node:path";
import { pathToFileURL } from "node:url";
import { marked } from "marked";

import type { EntityFileContent } from "./entity-content.js";
import type { EntityRecord, RoleDefinition, RoleEntityDefinition } from "./workspace.js";

marked.setOptions({ gfm: true });

export interface RenderedDefaultSection {
  kind: "default";
  file: EntityFileContent;
  html: string;
}

export interface RenderedPluginSection {
  kind: "plugin";
  html: string;
}

export type RenderedEntitySection = RenderedDefaultSection | RenderedPluginSection;

export type RenderedEntityDetail =
  | {
      mode: "detail-plugin";
      html: string;
    }
  | {
      mode: "sections";
      sections: RenderedEntitySection[];
    };

interface BaseEntityRendererContext {
  root: string;
  role: RoleDefinition;
  entityType: string;
  entityDef: RoleEntityDefinition;
  entity: EntityRecord;
  files: EntityFileContent[];
  renderMarkdown: (markdown: string) => Promise<string>;
  renderDefaultFileSection: (file: EntityFileContent) => Promise<string>;
  renderDefaultSections: () => Promise<string[]>;
}

export interface EntityDetailRendererContext extends BaseEntityRendererContext {}

export interface EntityFileRendererContext extends BaseEntityRendererContext {
  file: EntityFileContent;
}

type RendererResult = string | { html: string };
type DetailRenderer = (context: EntityDetailRendererContext) => Promise<RendererResult> | RendererResult;
type FileRenderer = (context: EntityFileRendererContext) => Promise<RendererResult> | RendererResult;

type DetailRendererModule = {
  default?: DetailRenderer;
  renderEntityDetail?: DetailRenderer;
};

type FileRendererModule = {
  default?: FileRenderer;
  renderEntityFile?: FileRenderer;
};

const pluginCache = new Map<string, Promise<unknown>>();

function importWithNode(specifier: string): Promise<unknown> {
  return new Function("moduleSpecifier", "return import(moduleSpecifier);")(specifier) as Promise<unknown>;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatFrontmatterValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join(", ");
  }
  return String(value ?? "");
}

function renderFrontmatterBlock(frontmatter: Record<string, unknown>): string {
  const entries = Object.entries(frontmatter);
  if (entries.length === 0) {
    return "";
  }

  const items = entries
    .map(
      ([key, value]) =>
        `<dt style="margin: 0.25rem 0 0; font-weight: 600;">${escapeHtml(key)}</dt><dd style="margin: 0 0 0 1rem;">${escapeHtml(formatFrontmatterValue(value))}</dd>`,
    )
    .join("");

  return `<dl class="meta" style="margin: 0 0 0.75rem; font-size: 0.85rem;">${items}</dl>`;
}

export async function renderMarkdown(markdown: string): Promise<string> {
  if (!markdown) {
    return "";
  }
  return marked.parse(markdown);
}

export async function renderDefaultFileSection(file: EntityFileContent): Promise<string> {
  const html = await renderMarkdown(file.content);
  return `<section class="file-section card"><h3>${escapeHtml(file.relativePath)}</h3>${renderFrontmatterBlock(file.frontmatter)}<div class="markdown-body">${html}</div></section>`;
}

function normalizeRendererResult(result: RendererResult, description: string): string {
  if (typeof result === "string") {
    return result;
  }
  if (result && typeof result === "object" && typeof result.html === "string") {
    return result.html;
  }
  throw new Error(`${description} must return a string or an object with an html field.`);
}

function resolveRoleRendererPath(role: RoleDefinition, rendererPath: string): string {
  const resolvedPath = path.resolve(role.roleDir, rendererPath);
  const relativeToRoleDir = path.relative(role.roleDir, resolvedPath);
  if (relativeToRoleDir.startsWith("..") || path.isAbsolute(relativeToRoleDir)) {
    throw new Error(`Role ${role.id} references a renderer outside its role directory: ${rendererPath}`);
  }
  return resolvedPath;
}

async function loadPluginModule<TModule>(absolutePath: string): Promise<TModule> {
  let pending = pluginCache.get(absolutePath);
  if (!pending) {
    pending = importWithNode(pathToFileURL(absolutePath).href);
    pluginCache.set(absolutePath, pending);
  }
  return (await pending) as TModule;
}

function getBaseContext(args: {
  root: string;
  role: RoleDefinition;
  entityType: string;
  entityDef: RoleEntityDefinition;
  entity: EntityRecord;
  files: EntityFileContent[];
}): BaseEntityRendererContext {
  return {
    ...args,
    renderMarkdown,
    renderDefaultFileSection,
    renderDefaultSections: () => Promise.all(args.files.map((file) => renderDefaultFileSection(file))),
  };
}

export async function renderRoleEntityDetail(args: {
  root: string;
  role: RoleDefinition;
  entityType: string;
  entityDef: RoleEntityDefinition;
  entity: EntityRecord;
  files: EntityFileContent[];
}): Promise<RenderedEntityDetail> {
  const context = getBaseContext(args);
  const detailRendererPath = args.role.explorer?.renderers?.detail?.[args.entityType];

  if (detailRendererPath) {
    const module = await loadPluginModule<DetailRendererModule>(resolveRoleRendererPath(args.role, detailRendererPath));
    const renderer = module.renderEntityDetail ?? module.default;
    if (typeof renderer !== "function") {
      throw new Error(
        `Explorer detail renderer ${detailRendererPath} must export renderEntityDetail(context) or a default function.`,
      );
    }

    return {
      mode: "detail-plugin",
      html: normalizeRendererResult(
        await renderer(context),
        `Explorer detail renderer ${detailRendererPath}`,
      ),
    };
  }

  const sections = await Promise.all(
    args.files.map(async (file): Promise<RenderedEntitySection> => {
      const fileRendererPath = args.role.explorer?.renderers?.files?.[args.entityType]?.[file.relativePath];
      if (!fileRendererPath) {
        return {
          kind: "default",
          file,
          html: await renderMarkdown(file.content),
        };
      }

      const module = await loadPluginModule<FileRendererModule>(resolveRoleRendererPath(args.role, fileRendererPath));
      const renderer = module.renderEntityFile ?? module.default;
      if (typeof renderer !== "function") {
        throw new Error(
          `Explorer file renderer ${fileRendererPath} must export renderEntityFile(context) or a default function.`,
        );
      }

      return {
        kind: "plugin",
        html: normalizeRendererResult(
          await renderer({ ...context, file }),
          `Explorer file renderer ${fileRendererPath}`,
        ),
      };
    }),
  );

  return { mode: "sections", sections };
}
