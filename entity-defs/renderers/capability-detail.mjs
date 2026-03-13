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

function list(frontmatter, key) {
  const value = frontmatter?.[key];
  return Array.isArray(value) ? value.map((entry) => String(entry)) : [];
}

export default async function renderEntityDetail(context) {
  const file = context.files.find((entry) => entry.relativePath === "record.md") ?? context.files[0];
  const frontmatter = file?.frontmatter ?? {};
  const proofPoints = list(frontmatter, "proof_points");
  const bodyHtml = file?.content ? await context.renderMarkdown(file.content) : "";

  return `
    <section class="detail-hero card">
      <p class="hero-kicker">Capability</p>
      <h1>${escapeHtml(field(frontmatter, "name", context.entity.name))}</h1>
      <p class="hero-lead">${escapeHtml(field(frontmatter, "headline"))}</p>
      <p class="meta">${escapeHtml(field(frontmatter, "value_summary"))}</p>
    </section>

    <section class="detail-grid">
      <div class="card detail-panel">
        <h2>At a glance</h2>
        <dl class="meta-list">
          <dt>Audience</dt><dd>${escapeHtml(field(frontmatter, "audience"))}</dd>
          <dt>Owner</dt><dd>${escapeHtml(field(frontmatter, "owner"))}</dd>
          <dt>Status</dt><dd>${escapeHtml(field(frontmatter, "status"))}</dd>
        </dl>
      </div>
      <div class="card detail-panel">
        <h2>Proof points</h2>
        <ul class="detail-list">
          ${proofPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("") || "<li>Add proof points.</li>"}
        </ul>
      </div>
    </section>

    <section class="card detail-panel">
      <h2>Details</h2>
      <div class="markdown-body">${bodyHtml}</div>
    </section>
  `;
}
