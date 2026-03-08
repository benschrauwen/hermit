function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sectionMap(markdown) {
  const content = String(markdown ?? "").trim();
  if (!content) return {};

  const lines = content.split(/\r?\n/);
  const sections = {};
  let currentHeading = null;
  let buffer = [];

  const flush = () => {
    if (!currentHeading) return;
    sections[currentHeading] = buffer.join("\n").trim();
    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      continue;
    }
    if (currentHeading) {
      buffer.push(line);
    }
  }

  flush();
  return sections;
}

function getFile(files, relativePath) {
  return files.find((file) => file.relativePath === relativePath);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function isPlaceholderBlock(value) {
  const text = normalizeText(value);
  if (!text) return true;
  const cleaned = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return cleaned.length > 0 && cleaned.every((line) => /^-?\s*Add\b/i.test(line));
}

function stageAppearance(stage) {
  const value = normalizeText(stage).toLowerCase();
  if (value.includes("won")) {
    return { background: "#dcfce7", color: "#166534", border: "#86efac" };
  }
  if (value.includes("lost")) {
    return { background: "#fee2e2", color: "#991b1b", border: "#fca5a5" };
  }
  if (value.includes("qual")) {
    return { background: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" };
  }
  if (value.includes("proposal") || value.includes("commercial")) {
    return { background: "#ede9fe", color: "#6d28d9", border: "#c4b5fd" };
  }
  if (value.includes("discovery") || value.includes("discuss")) {
    return { background: "#fef3c7", color: "#92400e", border: "#fcd34d" };
  }
  return { background: "#e2e8f0", color: "#334155", border: "#cbd5e1" };
}

function lifecycleFromPath(entityPath) {
  const normalized = String(entityPath ?? "").replaceAll("\\", "/");
  if (normalized.includes("/closed-won/")) return "Closed Won";
  if (normalized.includes("/closed-lost/")) return "Closed Lost";
  return "Active";
}

function lifecycleAppearance(lifecycle) {
  const value = normalizeText(lifecycle).toLowerCase();
  if (value.includes("won")) {
    return { background: "#ecfdf5", color: "#065f46", border: "#a7f3d0" };
  }
  if (value.includes("lost")) {
    return { background: "#fef2f2", color: "#991b1b", border: "#fecaca" };
  }
  return { background: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };
}

function pill(label, appearance) {
  return `<span style="display:inline-flex;align-items:center;padding:0.3rem 0.65rem;border-radius:999px;border:1px solid ${appearance.border};background:${appearance.background};color:${appearance.color};font-size:0.78rem;font-weight:700;letter-spacing:0.01em;">${escapeHtml(label)}</span>`;
}

function metricCard(label, value, emphasis = false) {
  const empty = !normalizeText(value);
  return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:1rem 1.05rem;box-shadow:0 1px 2px rgba(15,23,42,0.04);min-height:96px;">
    <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;margin-bottom:0.45rem;">${escapeHtml(label)}</div>
    <div style="font-size:${emphasis ? "1.35rem" : "1rem"};font-weight:${emphasis ? "800" : "600"};color:${empty ? "#94a3b8" : "#0f172a"};line-height:1.3;">${escapeHtml(empty ? "Not set" : value)}</div>
  </div>`;
}

async function richBlock(context, title, markdown, options = {}) {
  const text = normalizeText(markdown);
  const empty = isPlaceholderBlock(text);
  const body = empty
    ? `<div style="color:#94a3b8;font-style:italic;">${escapeHtml(options.emptyLabel ?? "Not yet captured")}</div>`
    : `<div class="markdown-body">${await context.renderMarkdown(text)}</div>`;

  return `<section style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:1.15rem 1.2rem;box-shadow:0 1px 3px rgba(15,23,42,0.05);height:100%;">
    <div style="font-size:0.8rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;margin-bottom:0.75rem;">${escapeHtml(title)}</div>
    ${body}
  </section>`;
}

function sourceRefs(frontmatter) {
  const refs = frontmatter && Array.isArray(frontmatter.source_refs) ? frontmatter.source_refs : [];
  return refs.map((entry) => String(entry)).filter(Boolean);
}

export async function renderEntityDetail(context) {
  const recordFile = getFile(context.files, "record.md");
  const meddiccFile = getFile(context.files, "meddicc.md");
  const activityFile = getFile(context.files, "activity-log.md");

  const recordSections = sectionMap(recordFile?.content ?? "");
  const meddiccSections = sectionMap(meddiccFile?.content ?? "");
  const activitySections = sectionMap(activityFile?.content ?? "");

  const accountName = normalizeText(recordSections.Account || recordFile?.frontmatter?.accountName || "");
  const opportunityName = normalizeText(recordSections.Opportunity || recordFile?.frontmatter?.opportunityName || "");
  const owner = normalizeText(recordSections.Owner || recordFile?.frontmatter?.owner || context.entity.owner || "");
  const stage = normalizeText(recordSections.Stage || recordFile?.frontmatter?.status || context.entity.status || "");
  const amount = normalizeText(recordSections.Amount || recordFile?.frontmatter?.amount || "");
  const closeDate = normalizeText(recordSections["Close Date"] || recordFile?.frontmatter?.closeDate || "");
  const nextStep = normalizeText(recordSections["Next Step"] || recordFile?.frontmatter?.nextStep || "");
  const risks = recordSections["Current Risks"] || "";
  const activityBody = activitySections[context.entity.name] || activityFile?.content || "";

  const lifecycle = lifecycleFromPath(context.entity.path);
  const meddiccOrder = [
    "Metrics",
    "Economic Buyer",
    "Decision Criteria",
    "Decision Process",
    "Paper Process",
    "Identified Pain",
    "Champion",
    "Competition",
  ];

  const meddiccCards = await Promise.all(
    meddiccOrder.map((title) => richBlock(context, title, meddiccSections[title] || "")),
  );

  const riskCard = await richBlock(context, "Current Risks", risks, { emptyLabel: "No risks captured yet" });
  const nextStepCard = await richBlock(context, "Next Step", nextStep, { emptyLabel: "No committed next step captured" });
  const activityCard = await richBlock(context, "Activity Timeline", activityBody, { emptyLabel: "No activity captured yet" });

  const sources = sourceRefs(recordFile?.frontmatter || {});
  const updatedAt = normalizeText(recordFile?.frontmatter?.updated_at || "");

  return `
  <section class="card" style="padding:1.4rem 1.5rem;border-radius:18px;border:1px solid #dbe3f0;background:linear-gradient(135deg,#ffffff 0%,#f8fbff 100%);box-shadow:0 8px 24px rgba(15,23,42,0.06);margin-bottom:1rem;">
    <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;">
      <div style="min-width:280px;flex:1 1 420px;">
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.9rem;">
          ${pill(stage || "Unstaged", stageAppearance(stage))}
          ${pill(lifecycle, lifecycleAppearance(lifecycle))}
        </div>
        <h2 style="margin:0;font-size:1.65rem;line-height:1.2;color:#0f172a;">${escapeHtml(context.entity.name)}</h2>
        <p style="margin:0.55rem 0 0;color:#475569;font-size:1rem;max-width:56rem;">Enterprise deal inspection view for fast qualification, forecast, and execution review.</p>
      </div>
      <div style="min-width:220px;flex:0 1 260px;background:#0f172a;color:#f8fafc;border-radius:16px;padding:1rem 1.1rem;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06);">
        <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#cbd5e1;margin-bottom:0.45rem;">Expected Amount</div>
        <div style="font-size:1.8rem;font-weight:800;line-height:1.1;">${escapeHtml(amount || "—")}</div>
        <div style="margin-top:0.8rem;font-size:0.85rem;color:#cbd5e1;">Close date: <strong style="color:#fff;">${escapeHtml(closeDate || "Not set")}</strong></div>
        <div style="margin-top:0.35rem;font-size:0.85rem;color:#cbd5e1;">Owner: <strong style="color:#fff;">${escapeHtml(owner || "Unassigned")}</strong></div>
      </div>
    </div>
  </section>

  <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.85rem;margin-bottom:1rem;">
    ${metricCard("Account", accountName)}
    ${metricCard("Opportunity", opportunityName)}
    ${metricCard("Owner", owner)}
    ${metricCard("Stage", stage)}
    ${metricCard("Close Date", closeDate)}
    ${metricCard("Amount", amount, true)}
  </section>

  <section style="display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,0.85fr);gap:1rem;margin-bottom:1rem;align-items:start;">
    ${nextStepCard}
    ${riskCard}
  </section>

  <section class="card" style="padding:1.2rem 1.25rem;border-radius:18px;border:1px solid #e5e7eb;background:#f8fafc;box-shadow:0 1px 2px rgba(15,23,42,0.03);margin-bottom:1rem;">
    <div style="display:flex;justify-content:space-between;gap:0.75rem;align-items:baseline;flex-wrap:wrap;margin-bottom:1rem;">
      <div>
        <h3 style="margin:0;font-size:1.1rem;color:#0f172a;">MEDDICC inspection</h3>
        <p style="margin:0.3rem 0 0;color:#64748b;font-size:0.92rem;">Qualification quality at a glance. Empty cards mean the evidence is still weak.</p>
      </div>
      <div style="font-size:0.8rem;color:#64748b;">8 inspection dimensions</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:0.9rem;">
      ${meddiccCards.join("\n")}
    </div>
  </section>

  <section style="display:grid;grid-template-columns:minmax(0,1fr);gap:1rem;margin-bottom:1rem;">
    ${activityCard}
  </section>

  <section class="card" style="padding:1rem 1.15rem;border-radius:16px;border:1px solid #e5e7eb;background:#fff;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
    <div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:flex-start;">
      <div>
        <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;margin-bottom:0.35rem;">Record metadata</div>
        <div style="color:#334155;font-size:0.92rem;">ID: <code>${escapeHtml(context.entity.id)}</code></div>
        <div style="color:#334155;font-size:0.92rem;">Updated: ${escapeHtml(updatedAt || "Unknown")}</div>
      </div>
      <div style="min-width:260px;flex:1 1 320px;">
        <div style="font-size:0.75rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;margin-bottom:0.35rem;">Source refs</div>
        ${sources.length > 0 ? `<div style="display:flex;gap:0.45rem;flex-wrap:wrap;">${sources.map((source) => `<span style="display:inline-flex;align-items:center;padding:0.28rem 0.55rem;border-radius:999px;background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;font-size:0.82rem;">${escapeHtml(source)}</span>`).join("")}</div>` : `<div style="color:#94a3b8;font-style:italic;">No source refs captured</div>`}
      </div>
    </div>
  </section>
  `;
}

export default renderEntityDetail;
