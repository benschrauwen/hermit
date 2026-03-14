import path from "node:path";
import { promises as fs } from "node:fs";

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
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? value : fallback;
}

function formatDate(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatValue(raw) {
  if (!raw) return "—";
  const num = parseFloat(raw.replace(/[$,]/g, ""));
  if (isNaN(num)) return raw;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${Math.round(num / 1_000)}K`;
  return `$${num.toFixed(0)}`;
}

function statusBadge(status) {
  if (status === "active") {
    return 'background: #d1fae5; color: #065f46; border-color: #a7f3d0;';
  }
  if (status === "prospect") {
    return 'background: #fef3c7; color: #92400e; border-color: #fde68a;';
  }
  if (status === "churned") {
    return 'background: #fee2e2; color: #991b1b; border-color: #fecaca;';
  }
  return 'background: #f1f5f9; color: #64748b; border-color: #e2e8f0;';
}

function tierBadge(tier) {
  if (tier === "enterprise") {
    return 'background: #ede9fe; color: #5b21b6; border-color: #ddd6fe;';
  }
  return 'background: #f1f5f9; color: #64748b; border-color: #e2e8f0;';
}

function stageColor(stage) {
  const colors = {
    discovery: "background: #dbeafe; color: #1e40af;",
    qualification: "background: #fef3c7; color: #92400e;",
    proposal: "background: #ede9fe; color: #5b21b6;",
    negotiation: "background: #ffedd5; color: #9a3412;",
    "closed-won": "background: #d1fae5; color: #065f46;",
    "closed-lost": "background: #f1f5f9; color: #64748b;",
  };
  return colors[stage] || "background: #f1f5f9; color: #64748b;";
}

async function findRelatedDeals(root, accountId) {
  const dealsDir = path.join(root, "entities", "deals");
  try {
    const entries = await fs.readdir(dealsDir, { withFileTypes: true });
    const deals = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const recordPath = path.join(dealsDir, entry.name, "record.md");
      try {
        const raw = await fs.readFile(recordPath, "utf8");
        // Quick frontmatter parse
        const match = raw.match(/^---\n([\s\S]*?)\n---/);
        if (!match) continue;
        const fm = {};
        for (const line of match[1].split("\n")) {
          const colonIdx = line.indexOf(":");
          if (colonIdx === -1) continue;
          const key = line.slice(0, colonIdx).trim();
          const val = line.slice(colonIdx + 1).trim();
          fm[key] = val;
        }
        if (fm.account_id === accountId) {
          const rawClose = fm.close_date || "";
          deals.push({
            id: fm.id || entry.name,
            name: fm.name || entry.name,
            stage: fm.stage || "",
            value: formatValue(fm.value || ""),
            close_date: formatDate(rawClose) || rawClose,
            owner: fm.owner || "",
            probability: fm.probability || "",
          });
        }
      } catch { /* skip */ }
    }
    return deals;
  } catch {
    return [];
  }
}

export default async function renderEntityDetail(context) {
  const file = context.files.find((entry) => entry.relativePath === "record.md") ?? context.files[0];
  const frontmatter = file?.frontmatter ?? {};
  const bodyHtml = file?.content ? await context.renderMarkdown(file.content) : "";

  const status = field(frontmatter, "status");
  const tier = field(frontmatter, "tier");
  const industry = field(frontmatter, "industry");
  const size = field(frontmatter, "size");
  const owner = field(frontmatter, "owner");
  const arr = field(frontmatter, "arr");

  // Find related deals
  const deals = await findRelatedDeals(context.root, context.entity.id);
  const openDeals = deals.filter(d => !d.stage.startsWith("closed-"));
  const closedDeals = deals.filter(d => d.stage.startsWith("closed-"));
  const totalOpenValue = openDeals.reduce((sum, d) => {
    const num = parseFloat(d.value.replace(/[$,]/g, ""));
    return sum + (isNaN(num) ? 0 : num);
  }, 0);

  function formatCurrency(value) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  }

  const dealRows = deals.map(d => `
    <tr>
      <td style="padding: 0.75rem 1rem;">
        <a href="/entities/deal/${escapeHtml(d.id)}" style="font-weight: 600; text-decoration: none; color: #0f172a;">${escapeHtml(d.name)}</a>
      </td>
      <td style="padding: 0.75rem 1rem;">
        <span style="display: inline-flex; align-items: center; border-radius: 9999px; padding: 0.125rem 0.625rem; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; ${stageColor(d.stage)}">${escapeHtml(d.stage)}</span>
      </td>
      <td style="padding: 0.75rem 1rem; font-weight: 600;">${escapeHtml(d.value || "—")}</td>
      <td style="padding: 0.75rem 1rem; font-size: 0.875rem; color: #64748b;">${escapeHtml(d.close_date || "—")}</td>
      <td style="padding: 0.75rem 1rem; font-size: 0.875rem;">${escapeHtml(d.owner)}</td>
    </tr>
  `).join("");

  return `
    <section class="detail-hero card" style="position: relative;">
      <p class="hero-kicker">Account</p>
      <h1>${escapeHtml(field(frontmatter, "name", context.entity.name))}</h1>
      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem;">
        <span style="display: inline-flex; align-items: center; border-radius: 9999px; padding: 0.25rem 0.875rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid; ${statusBadge(status)}">${escapeHtml(status)}</span>
        ${tier ? `<span style="display: inline-flex; align-items: center; border-radius: 9999px; padding: 0.25rem 0.875rem; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid; ${tierBadge(tier)}">${escapeHtml(tier)}</span>` : ""}
        ${industry ? `<span style="display: inline-flex; align-items: center; border-radius: 9999px; padding: 0.25rem 0.875rem; font-size: 0.75rem; font-weight: 600; background: #f8fafc; color: #334155; border: 1px solid #e2e8f0;">${escapeHtml(industry)}</span>` : ""}
      </div>
    </section>

    <section style="display: grid; gap: 1rem; margin-bottom: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
      <div class="card" style="padding: 1.25rem;">
        <span style="display: block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b;">ARR</span>
        <strong style="display: block; margin-top: 0.5rem; font-size: 1.75rem; font-weight: 700; color: ${arr && arr !== '$0' && arr !== '0' ? '#059669' : '#94a3b8'}; letter-spacing: -0.02em;">${escapeHtml(arr && arr !== '$0' && arr !== '0' ? formatValue(arr) : "—")}</strong>
      </div>
      <div class="card" style="padding: 1.25rem;">
        <span style="display: block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b;">Open Pipeline</span>
        <strong style="display: block; margin-top: 0.5rem; font-size: 1.75rem; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">${openDeals.length > 0 ? formatCurrency(totalOpenValue) : "—"}</strong>
        <span style="display: block; margin-top: 0.25rem; font-size: 0.75rem; color: #94a3b8;">${openDeals.length} open deal${openDeals.length !== 1 ? "s" : ""}</span>
      </div>
      <div class="card" style="padding: 1.25rem;">
        <span style="display: block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b;">Company Size</span>
        <strong style="display: block; margin-top: 0.5rem; font-size: 1.25rem; font-weight: 700; color: #0f172a;">${escapeHtml(size || "—")}</strong>
      </div>
      <div class="card" style="padding: 1.25rem;">
        <span style="display: block; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b;">Owner</span>
        <strong style="display: block; margin-top: 0.5rem; font-size: 1.25rem; font-weight: 700; color: #0f172a;">${escapeHtml(owner)}</strong>
      </div>
    </section>

    ${deals.length > 0 ? `
    <section class="card" style="margin-bottom: 1.5rem; overflow: hidden;">
      <div style="padding: 1.25rem 1.5rem; border-bottom: 1px solid #e2e8f0;">
        <span style="font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.14em; color: #0ea5e9;">Related deals</span>
        <h2 style="margin-top: 0.25rem; font-size: 1.125rem; font-weight: 600; color: #0f172a;">Pipeline at this account</h2>
      </div>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
              <th style="padding: 0.625rem 1rem; text-align: left; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b;">Deal</th>
              <th style="padding: 0.625rem 1rem; text-align: left; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b;">Stage</th>
              <th style="padding: 0.625rem 1rem; text-align: left; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b;">Value</th>
              <th style="padding: 0.625rem 1rem; text-align: left; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b;">Close Date</th>
              <th style="padding: 0.625rem 1rem; text-align: left; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b;">Owner</th>
            </tr>
          </thead>
          <tbody>
            ${dealRows}
          </tbody>
        </table>
      </div>
    </section>
    ` : ""}

    <section class="card detail-panel" style="margin-bottom: 1.5rem;">
      <div class="markdown-body">${bodyHtml}</div>
    </section>

    <div style="margin-bottom: 1.5rem; display: flex; flex-wrap: wrap; gap: 0.75rem;">
      <a href="/demo/sales-crm" class="button-secondary" style="font-size: 0.8125rem;">Back to pipeline →</a>
      <a href="/entities/account" class="button-secondary" style="font-size: 0.8125rem;">All accounts →</a>
    </div>
  `;
}
