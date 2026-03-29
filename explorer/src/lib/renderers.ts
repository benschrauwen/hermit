import path from "node:path";
import { marked } from "marked";

import {
  readEntityFrontmatter,
  readEntityRecordContent,
  type EntityFileContent,
} from "./entity-content.js";
import type { EntityRecord, RoleEntityDefinition, RoleExplorerConfig } from "./workspace.js";
import {
  countEntitiesByDefinition,
  getFrameworkRoot,
  importWithNode,
  listRoleIds,
  loadEntityDefs,
  scanEntitiesByDefinition,
} from "./workspace.js";

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
  entityType: string;
  entityDef: RoleEntityDefinition;
  entity: EntityRecord;
  files: EntityFileContent[];
  renderMarkdown: (markdown: string) => Promise<string>;
  renderDefaultFileSection: (file: EntityFileContent) => Promise<string>;
  renderDefaultSections: () => Promise<string[]>;
}

export type EntityDetailRendererContext = BaseEntityRendererContext;

export interface EntityFileRendererContext extends BaseEntityRendererContext {
  file: EntityFileContent;
}

export interface ExplorerRendererHelpers {
  frameworkRoot: string;
  listRoleIds: () => Promise<string[]>;
  loadEntityDefs: typeof loadEntityDefs;
  countEntitiesByDefinition: typeof countEntitiesByDefinition;
  scanEntitiesByDefinition: typeof scanEntitiesByDefinition;
  readEntityFrontmatter: typeof readEntityFrontmatter;
  readEntityRecordContent: typeof readEntityRecordContent;
  renderMarkdown: typeof renderMarkdown;
  renderDefaultFileSection: typeof renderDefaultFileSection;
}

interface ExplorerRendererContextBase {
  root: string;
  explorer?: RoleExplorerConfig;
  helpers: ExplorerRendererHelpers;
}

export interface ExplorerHomeRendererContext extends ExplorerRendererContextBase {}

export interface ExplorerEntityListRow extends EntityRecord {
  fieldValues: Record<string, string>;
}

export interface ExplorerEntityListRendererContext extends ExplorerRendererContextBase {
  entityType: string;
  entityDef: RoleEntityDefinition;
  allEntities: ExplorerEntityListRow[];
  entities: ExplorerEntityListRow[];
  searchQuery: string;
  sort: string;
  dir: "asc" | "desc";
  buildSortHref: (nextSort: string) => string;
  sortIndicator: (column: string) => string;
  buildClearHref: () => string;
}

export interface ExplorerCustomPageRendererContext extends ExplorerRendererContextBase {
  pageKey: string;
}

type RendererResult = string | { html: string };
type PageLikeRendererResult = string | { html: string; title?: string };
type DetailRenderer = (context: EntityDetailRendererContext) => Promise<RendererResult> | RendererResult;
type FileRenderer = (context: EntityFileRendererContext) => Promise<RendererResult> | RendererResult;
type HomeRenderer = (context: ExplorerHomeRendererContext) => Promise<PageLikeRendererResult> | PageLikeRendererResult;
type ListRenderer = (context: ExplorerEntityListRendererContext) => Promise<RendererResult> | RendererResult;
type CustomPageRenderer = (
  context: ExplorerCustomPageRendererContext,
) => Promise<PageLikeRendererResult> | PageLikeRendererResult;

type DetailRendererModule = {
  default?: DetailRenderer;
  renderEntityDetail?: DetailRenderer;
};

type FileRendererModule = {
  default?: FileRenderer;
  renderEntityFile?: FileRenderer;
};

type HomeRendererModule = {
  default?: HomeRenderer;
  renderExplorerHome?: HomeRenderer;
};

type ListRendererModule = {
  default?: ListRenderer;
  renderEntityList?: ListRenderer;
};

type CustomPageRendererModule = {
  default?: CustomPageRenderer;
  renderExplorerPage?: CustomPageRenderer;
};

const pluginCache = new Map<string, Promise<unknown>>();

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
        `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(formatFrontmatterValue(value))}</dd>`,
    )
    .join("");

  return `<dl class="meta-list">${items}</dl>`;
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

function normalizePageLikeRendererResult(
  result: PageLikeRendererResult,
  description: string,
): { html: string; title?: string } {
  if (typeof result === "string") {
    return { html: result };
  }
  if (result && typeof result === "object" && typeof result.html === "string") {
    return {
      html: result.html,
      ...(typeof result.title === "string" ? { title: result.title } : {}),
    };
  }
  throw new Error(`${description} must return a string or an object with an html field.`);
}

function resolveRendererPath(root: string, rendererPath: string): string {
  const entityDefsDir = path.join(root, "entity-defs");
  const resolvedPath = path.resolve(entityDefsDir, rendererPath);
  const relativeToEntityDefsDir = path.relative(entityDefsDir, resolvedPath);
  if (relativeToEntityDefsDir.startsWith("..") || path.isAbsolute(relativeToEntityDefsDir)) {
    throw new Error(`Renderer references a path outside the entity-defs directory: ${rendererPath}`);
  }
  return resolvedPath;
}

async function loadPluginModule<TModule>(absolutePath: string): Promise<TModule> {
  let pending = pluginCache.get(absolutePath);
  if (!pending) {
    const { pathToFileURL } = await import("node:url");
    pending = importWithNode(pathToFileURL(absolutePath).href);
    pluginCache.set(absolutePath, pending);
  }
  return (await pending) as TModule;
}

function getExplorerRendererHelpers(root: string): ExplorerRendererHelpers {
  return {
    frameworkRoot: getFrameworkRoot(),
    listRoleIds: () => listRoleIds(root),
    loadEntityDefs,
    countEntitiesByDefinition,
    scanEntitiesByDefinition,
    readEntityFrontmatter,
    readEntityRecordContent,
    renderMarkdown,
    renderDefaultFileSection,
  };
}

function getBaseContext(args: {
  root: string;
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

export async function renderExplorerHome(args: {
  root: string;
  explorer?: RoleExplorerConfig;
}): Promise<{ html: string; title?: string } | undefined> {
  const rendererPath = args.explorer?.renderers?.home;
  if (!rendererPath) {
    return undefined;
  }

  const module = await loadPluginModule<HomeRendererModule>(resolveRendererPath(args.root, rendererPath));
  const renderer = module.renderExplorerHome ?? module.default;
  if (typeof renderer !== "function") {
    throw new Error(
      `Explorer home renderer ${rendererPath} must export renderExplorerHome(context) or a default function.`,
    );
  }

  return normalizePageLikeRendererResult(
    await renderer({ root: args.root, explorer: args.explorer, helpers: getExplorerRendererHelpers(args.root) }),
    `Explorer home renderer ${rendererPath}`,
  );
}

export async function renderRoleEntityList(args: {
  root: string;
  explorer?: RoleExplorerConfig;
  entityType: string;
  entityDef: RoleEntityDefinition;
  allEntities: ExplorerEntityListRow[];
  entities: ExplorerEntityListRow[];
  searchQuery: string;
  sort: string;
  dir: "asc" | "desc";
  buildSortHref: (nextSort: string) => string;
  sortIndicator: (column: string) => string;
  buildClearHref: () => string;
}): Promise<string | undefined> {
  const rendererPath = args.explorer?.renderers?.lists?.[args.entityType];
  if (!rendererPath) {
    return undefined;
  }

  const module = await loadPluginModule<ListRendererModule>(resolveRendererPath(args.root, rendererPath));
  const renderer = module.renderEntityList ?? module.default;
  if (typeof renderer !== "function") {
    throw new Error(
      `Explorer list renderer ${rendererPath} must export renderEntityList(context) or a default function.`,
    );
  }

  return normalizeRendererResult(
    await renderer({ ...args, helpers: getExplorerRendererHelpers(args.root) }),
    `Explorer list renderer ${rendererPath}`,
  );
}

export async function renderExplorerCustomPage(args: {
  root: string;
  explorer?: RoleExplorerConfig;
  pageKey: string;
}): Promise<{ html: string; title?: string } | undefined> {
  const rendererPath = args.explorer?.renderers?.pages?.[args.pageKey];
  if (!rendererPath) {
    return undefined;
  }

  const module = await loadPluginModule<CustomPageRendererModule>(resolveRendererPath(args.root, rendererPath));
  const renderer = module.renderExplorerPage ?? module.default;
  if (typeof renderer !== "function") {
    throw new Error(
      `Explorer page renderer ${rendererPath} must export renderExplorerPage(context) or a default function.`,
    );
  }

  return normalizePageLikeRendererResult(
    await renderer({ root: args.root, explorer: args.explorer, pageKey: args.pageKey, helpers: getExplorerRendererHelpers(args.root) }),
    `Explorer page renderer ${rendererPath}`,
  );
}

export async function renderRoleEntityDetail(args: {
  root: string;
  explorer?: RoleExplorerConfig;
  entityType: string;
  entityDef: RoleEntityDefinition;
  entity: EntityRecord;
  files: EntityFileContent[];
}): Promise<RenderedEntityDetail> {
  const context = getBaseContext(args);
  const detailRendererPath = args.explorer?.renderers?.detail?.[args.entityType];

  if (detailRendererPath) {
    const module = await loadPluginModule<DetailRendererModule>(resolveRendererPath(args.root, detailRendererPath));
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
      const fileRendererPath = args.explorer?.renderers?.files?.[args.entityType]?.[file.relativePath];
      if (!fileRendererPath) {
        return {
          kind: "default",
          file,
          html: await renderDefaultFileSection(file),
        };
      }

      const module = await loadPluginModule<FileRendererModule>(resolveRendererPath(args.root, fileRendererPath));
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
