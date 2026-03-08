export function renderFrontmatter(data: Record<string, string | string[] | undefined>): string {
  const lines = Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .flatMap(([key, value]) =>
      Array.isArray(value) ? [`${key}:`, ...value.map((entry) => `  - ${entry}`)] : [`${key}: ${value}`],
    );

  return ["---", ...lines, "---", ""].join("\n");
}

export function renderSection(title: string, body: string): string {
  return `## ${title}\n\n${body.trim()}\n`;
}

export function renderMarkdownDocument(
  metadata: Record<string, string | string[] | undefined>,
  sections: Array<{ title: string; body: string }>,
): string {
  return [renderFrontmatter(metadata), ...sections.map((section) => renderSection(section.title, section.body))].join("\n");
}
