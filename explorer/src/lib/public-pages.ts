import { marked } from "marked";

import { readEntityRecordContent, readMarkdownFiles } from "./entity-content.js";
import { getWorkspaceRoot, loadEntityDefs, scanEntitiesByDefinition } from "./workspace.js";

marked.setOptions({ gfm: true });

export interface PublicPageBlock {
  relativePath: string;
  html: string;
}

export interface PublicPageData {
  id: string;
  name: string;
  slug: string;
  href: string;
  summary: string;
  audience: string;
  goal: string;
  presentationMode: string;
  publicHtml: string;
  blocks: PublicPageBlock[];
}

export function publicPageHref(slug: string): string {
  if (slug === "home") return "/";
  if (slug === "architecture") return "/architecture";
  return `/${slug}`;
}

export async function listPublicPages(root = getWorkspaceRoot()): Promise<PublicPageData[]> {
  const { entities: entityDefs } = await loadEntityDefs(root);
  const pageDef = entityDefs.find((entityDef) => entityDef.type === "page");
  if (!pageDef) {
    return [];
  }

  const pageEntities = await scanEntitiesByDefinition(root, pageDef);

  return Promise.all(
    pageEntities.map(async (entity) => {
      const files = await readEntityRecordContent(entity.path, pageDef);
      const record = files.find((file) => file.relativePath === "record.md") ?? files[0];
      const frontmatter = record?.frontmatter ?? {};
      const slug = typeof frontmatter.slug === "string" ? frontmatter.slug : "";
      const markdownFiles = await readMarkdownFiles(entity.path);
      const publicFile = markdownFiles.find((file) => file.relativePath === "public.md");
      const blocks = await Promise.all(
        markdownFiles
          .filter((file) => file.relativePath !== "record.md" && file.relativePath !== "public.md")
          .map(async (file) => ({
            relativePath: file.relativePath,
            html: await marked.parse(file.content),
          })),
      );

      return {
        id: entity.id,
        name: typeof frontmatter.name === "string" ? frontmatter.name : entity.name,
        slug,
        href: publicPageHref(slug),
        summary: typeof frontmatter.summary === "string" ? frontmatter.summary : "",
        audience: typeof frontmatter.audience === "string" ? frontmatter.audience : "",
        goal: typeof frontmatter.primary_goal === "string" ? frontmatter.primary_goal : "",
        presentationMode: typeof frontmatter.presentation_mode === "string" ? frontmatter.presentation_mode : "standard",
        publicHtml: publicFile?.content ? await marked.parse(publicFile.content) : "",
        blocks,
      } satisfies PublicPageData;
    }),
  );
}

export async function getPublicPageBySlug(slug: string, root = getWorkspaceRoot()): Promise<PublicPageData | undefined> {
  const pages = await listPublicPages(root);
  return pages.find((page) => page.slug === slug);
}
