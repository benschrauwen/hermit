function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function field(frontmatter, key, fallback = "") {
  const value = frontmatter?.[key];
  return typeof value === "string" ? value : fallback;
}

export default async function renderEntityDetail(context) {
  const file = context.files.find((entry) => entry.relativePath === "record.md") ?? context.files[0];
  const frontmatter = file?.frontmatter ?? {};
  const strategyHtml = file?.content ? await context.renderMarkdown(file.content) : "";

  const primaryLabel = field(frontmatter, "primary_cta_label");
  const primaryHref = field(frontmatter, "primary_cta_href", "/entities/capability");
  const secondaryLabel = field(frontmatter, "secondary_cta_label");
  const secondaryHref = field(frontmatter, "secondary_cta_href", "/entities/page");

  return `
    <section class="detail-hero card">
      <p class="hero-kicker">Site strategy</p>
      <h1>${escapeHtml(field(frontmatter, "name", context.entity.name))}</h1>
      <p class="hero-lead">${escapeHtml(field(frontmatter, "value_proposition"))}</p>
      <div class="cta-row">
        <a class="button-primary" href="${escapeHtml(primaryHref)}">${escapeHtml(primaryLabel || "Explore capabilities")}</a>
        ${secondaryLabel ? `<a class="button-secondary" href="${escapeHtml(secondaryHref)}">${escapeHtml(secondaryLabel)}</a>` : ""}
      </div>
    </section>

    <section class="detail-grid">
      <div class="card detail-panel">
        <h2>Current focus</h2>
        <dl class="meta-list">
          <dt>Audience</dt><dd>${escapeHtml(field(frontmatter, "audience"))}</dd>
          <dt>Primary goal</dt><dd>${escapeHtml(field(frontmatter, "primary_goal"))}</dd>
          <dt>Owner</dt><dd>${escapeHtml(field(frontmatter, "owner"))}</dd>
          <dt>Status</dt><dd>${escapeHtml(field(frontmatter, "status"))}</dd>
        </dl>
      </div>
      <div class="card detail-panel">
        <h2>What this record controls</h2>
        <ul class="detail-list">
          <li>Homepage promise and calls to action</li>
          <li>Public audience focus</li>
          <li>Site-wide priorities and open questions</li>
        </ul>
      </div>
    </section>

    <section class="card detail-panel">
      <h2>Strategy notes</h2>
      <div class="markdown-body">${strategyHtml}</div>
    </section>
  `;
}
