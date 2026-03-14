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

function stageColor(stage) {
  const colors = {
    discovery: "background: #dbeafe; color: #1e40af; border-color: #bfdbfe;",
    qualification: "background: #fef3c7; color: #92400e; border-color: #fde68a;",
    proposal: "background: #ede9fe; color: #5b21b6; border-color: #ddd6fe;",
    negotiation: "background: #ffedd5; color: #9a3412; border-color: #fed7aa;",
    "closed-won": "background: #d1fae5; color: #065f46; border-color: #a7f3d0;",
    "closed-lost": "background: #f1f5f9; color: #64748b; border-color: #e2e8f0;",
  };
  return colors[stage] || "background: #f1f5f9; color: #64748b; border-color: #e2e8f0;";
}

function probColor(prob) {
  const p = parseInt(prob);
  if (isNaN(p)) return "#94a3b8";
  if (p >= 75) return "#059669";
  if (p >= 50) return "#d97706";
  if (p >= 25) return "#ea580c";
  return "#dc2626";
}

export default async function renderEntityDetail(context) {
  const file = context.files.find((entry) => entry.relativePath === "record.md") ?? context.files[0];
  const frontmatter = file?.frontmatter ?? {};
  const bodyHtml = file?.content ? await context.renderMarkdown(file.content) : "";

  const stage = field(frontmatter, "stage");
  const value = field(frontmatter, "value");
  const probability = field(frontmatter, "probability");
  const closeDate = field(frontmatter, "close_date");
  const owner = field(frontmatter, "owner");
  const accountId = field(frontmatter, "account_id");
  const probNum = parseInt(probability);

  return `
    <section class="detail-hero card" style="position: relative; overflow: visible;">
      <p class="hero-kicker">Deal</p>
      <h1>${escapeHtml(field(frontmatter, "name", context.entity.name))}</h1>
      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem;">
        <span style="display: inline-flex; align-items: center; border-radius: 9999px; padding: 0.25rem 0.875rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid; ${stageColor(stage)}">${escapeHtml(stage)}</span>
        ${value ? `<span style="display: inline-flex; align-items: center; border-radius: 9999px; padding: 0.25rem 0.875rem; font-size: 0.8125rem; font-weight: 700; background: #f8fafc; color: #0f172a; border: 1px solid #e2e8f0;">${escapeHtml(value)}</span>` : ""}
        ${probability ? `<span style="display: inline-flex; align-items: center; border-radius: 9999px; padding: 0.25rem 0.875rem; font-size: 0.75rem; font-weight: 600; background: #f8fafc; color: ${probColor(probability)}; border: 1px solid #e2e8f0;">${escapeHtml(probability)} probability</span>` : ""}
      </div>
    </section>

    <section style="display: grid; gap: 1rem; margin-bottom: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
      <div class="card" style="padding: 1.25rem;">
        <span style="display: block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b;">Value</span>
        <strong style="display: block; margin-top: 0.5rem; font-size: 1.75rem; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">${escapeHtml(value || "—")}</strong>
      </div>
      <div class="card" style="padding: 1.25rem;">
        <span style="display: block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b;">Probability</span>
        <strong style="display: block; margin-top: 0.5rem; font-size: 1.75rem; font-weight: 700; color: ${probColor(probability)}; letter-spacing: -0.02em;">${escapeHtml(probability || "—")}</strong>
        ${!isNaN(probNum) ? `<div style="margin-top: 0.5rem; height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden;"><div style="height: 100%; width: ${probNum}%; background: ${probColor(probability)}; border-radius: 3px;"></div></div>` : ""}
      </div>
      <div class="card" style="padding: 1.25rem;">
        <span style="display: block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b;">Close Date</span>
        <strong style="display: block; margin-top: 0.5rem; font-size: 1.75rem; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">${escapeHtml(closeDate || "—")}</strong>
      </div>
      <div class="card" style="padding: 1.25rem;">
        <span style="display: block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b;">Owner</span>
        <strong style="display: block; margin-top: 0.5rem; font-size: 1.25rem; font-weight: 700; color: #0f172a;">${escapeHtml(owner)}</strong>
        ${accountId ? `<a href="/entities/account/${escapeHtml(accountId)}" style="display: inline-block; margin-top: 0.375rem; font-size: 0.8125rem; font-weight: 500;">${escapeHtml(accountId)}</a>` : ""}
      </div>
    </section>

    <section class="card detail-panel" style="margin-bottom: 1.5rem;">
      <div class="markdown-body">${bodyHtml}</div>
    </section>

    <div style="margin-bottom: 1.5rem; display: flex; flex-wrap: wrap; gap: 0.75rem;">
      ${accountId ? `<a href="/entities/account/${escapeHtml(accountId)}" class="button-secondary" style="font-size: 0.8125rem;">View account →</a>` : ""}
      <a href="/demo/sales-crm" class="button-secondary" style="font-size: 0.8125rem;">Back to pipeline →</a>
    </div>
  `;
}
