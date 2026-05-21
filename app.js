const STORAGE_KEY = "dpw-skills-gap-analyzer-v1";

const state = loadState();

const els = {
  fileInput: document.getElementById("fileInput"),
  selfWeight: document.getElementById("selfWeight"),
  selfWeightValue: document.getElementById("selfWeightValue"),
  managerWeight: document.getElementById("managerWeight"),
  managerWeightValue: document.getElementById("managerWeightValue"),
  pillarFilter: document.getElementById("pillarFilter"),
  riskFilter: document.getElementById("riskFilter"),
  participantList: document.getElementById("participantList"),
  kpis: document.getElementById("kpis"),
  pillarGrid: document.getElementById("pillarGrid"),
  gapRows: document.getElementById("gapRows"),
  evidenceList: document.getElementById("evidenceList"),
  sourceSummary: document.getElementById("sourceSummary"),
  resetBtn: document.getElementById("resetBtn"),
  exportExcelBtn: document.getElementById("exportExcelBtn"),
  exportWordBtn: document.getElementById("exportWordBtn"),
  addPasteBtn: document.getElementById("addPasteBtn"),
  pasteDialog: document.getElementById("pasteDialog"),
  pasteName: document.getElementById("pasteName"),
  pasteType: document.getElementById("pasteType"),
  pasteText: document.getElementById("pasteText"),
  applyPasteBtn: document.getElementById("applyPasteBtn"),
};

hydrateControls();
render();

els.fileInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  for (const file of files) await importWorkbook(file);
  event.target.value = "";
  saveAndRender();
});

els.selfWeight.addEventListener("input", () => {
  state.settings.selfWeight = Number(els.selfWeight.value) / 100;
  hydrateControls();
  saveAndRender();
});

els.managerWeight.addEventListener("input", () => {
  state.settings.managerWeight = Number(els.managerWeight.value) / 100;
  hydrateControls();
  saveAndRender();
});

els.pillarFilter.addEventListener("change", () => {
  state.settings.pillarFilter = els.pillarFilter.value;
  saveAndRender();
});

els.riskFilter.addEventListener("change", () => {
  state.settings.riskFilter = els.riskFilter.value;
  saveAndRender();
});

els.resetBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  Object.assign(state, fromSeed());
  hydrateControls();
  saveAndRender();
});

els.exportExcelBtn.addEventListener("click", exportExcelReport);
els.exportWordBtn.addEventListener("click", exportWordReport);

els.addPasteBtn.addEventListener("click", () => els.pasteDialog.showModal());

els.applyPasteBtn.addEventListener("click", () => {
  const name = els.pasteName.value.trim();
  const text = els.pasteText.value.trim();
  if (!name || !text) return;
  mergeParticipant(parsePastedRows(name, els.pasteType.value, text));
  els.pasteName.value = "";
  els.pasteText.value = "";
  els.pasteDialog.close();
  saveAndRender();
});

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.criteria?.length) return parsed;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return fromSeed();
}

function fromSeed() {
  return {
    criteria: structuredClone(window.SEED_DATA.criteria),
    participants: structuredClone(window.SEED_DATA.participants).filter(hasAnyScore),
    settings: { selfWeight: 0.4, managerWeight: 0.6, pillarFilter: "all", riskFilter: "all" },
  };
}

function saveAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function hydrateControls() {
  els.selfWeight.value = Math.round(state.settings.selfWeight * 100);
  els.selfWeightValue.textContent = `${els.selfWeight.value}%`;
  els.managerWeight.value = Math.round(state.settings.managerWeight * 100);
  els.managerWeightValue.textContent = `${els.managerWeight.value}%`;
}

function render() {
  renderFilters();
  renderParticipants();
  const rows = computeCapabilityRows();
  renderKpis(rows);
  renderPillars(rows);
  renderGapRows(rows);
  renderEvidence(rows);
  els.sourceSummary.textContent = `${activeParticipants().length} active participant${activeParticipants().length === 1 ? "" : "s"}`;
}

function renderFilters() {
  const pillars = ["all", ...new Set(state.criteria.map((item) => item.pillar))];
  els.pillarFilter.innerHTML = pillars.map((pillar) => `<option value="${escapeHtml(pillar)}">${pillar === "all" ? "All pillars" : escapeHtml(pillar)}</option>`).join("");
  els.pillarFilter.value = state.settings.pillarFilter;
  els.riskFilter.value = state.settings.riskFilter;
}

function renderParticipants() {
  if (!state.participants.length) {
    els.participantList.innerHTML = `<p class="hint">No participants loaded yet. Import an Excel workbook or paste rows.</p>`;
    return;
  }
  els.participantList.innerHTML = state.participants.map((participant) => {
    const selfCount = Object.keys(participant.selfScores || {}).length;
    const managerCount = Object.keys(participant.managerScores || {}).length;
    const checked = participant.active === false ? "" : "checked";
    return `
      <article class="participant">
        <div class="participant-top">
          <label><input type="checkbox" data-action="toggle" data-id="${participant.id}" ${checked}> <strong>${escapeHtml(participant.name)}</strong></label>
          <button type="button" class="ghost" data-action="remove" data-id="${participant.id}">Remove</button>
        </div>
        <div class="mini">
          <span class="pill">Self: ${selfCount}</span>
          <span class="pill">Manager: ${managerCount}</span>
          <span class="pill">${escapeHtml((participant.sourceFiles || []).slice(-1)[0] || "manual")}</span>
        </div>
      </article>`;
  }).join("");

  els.participantList.querySelectorAll("button[data-action='remove']").forEach((button) => {
    button.addEventListener("click", () => {
      state.participants = state.participants.filter((participant) => participant.id !== button.dataset.id);
      saveAndRender();
    });
  });
  els.participantList.querySelectorAll("input[data-action='toggle']").forEach((input) => {
    input.addEventListener("change", () => {
      const participant = state.participants.find((item) => item.id === input.dataset.id);
      if (participant) participant.active = input.checked;
      saveAndRender();
    });
  });
}

function renderKpis(rows) {
  const active = activeParticipants();
  const avgGap = average(rows.filter((row) => row.current !== null).map((row) => row.gap));
  const critical = rows.filter((row) => row.risk === "critical").length;
  const coverage = average(active.map((participant) => coveragePct(participant)));
  els.kpis.innerHTML = [
    kpi("Participants", active.length),
    kpi("Capabilities", state.criteria.length),
    kpi("Avg gap", formatSigned(avgGap)),
    kpi("Critical items", critical),
    kpi("Avg coverage", `${Math.round(coverage || 0)}%`),
  ].join("");
}

function renderPillars(rows) {
  const groups = groupBy(rows, "pillar");
  els.pillarGrid.innerHTML = Object.entries(groups).map(([pillar, items]) => {
    const current = average(items.map((item) => item.current).filter((value) => value !== null));
    const required = average(items.map((item) => item.required));
    const gap = current === null ? null : current - required;
    const critical = items.filter((item) => item.risk === "critical").length;
    const pct = current === null ? 0 : Math.max(0, Math.min(100, (current / 5) * 100));
    return `
      <article class="pillar-card">
        <h3>${escapeHtml(pillar)}</h3>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <div class="mini">
          <span class="pill">Current ${formatNumber(current)}</span>
          <span class="pill">Required ${formatNumber(required)}</span>
          <span class="pill ${riskClass(gap)}">Gap ${formatSigned(gap)}</span>
          <span class="pill">Critical ${critical}</span>
        </div>
      </article>`;
  }).join("");
}

function renderGapRows(rows) {
  const filtered = filterRows(rows).sort((a, b) => a.gap - b.gap);
  els.gapRows.innerHTML = filtered.map((row) => `
    <tr>
      <td><span class="risk-chip ${row.risk}">${row.riskLabel}</span></td>
      <td>${escapeHtml(row.id)}</td>
      <td>${escapeHtml(row.pillar)}</td>
      <td>${escapeHtml(row.capability)}</td>
      <td>${formatNumber(row.required)}</td>
      <td>${formatNumber(row.current)}</td>
      <td class="${riskClass(row.gap)}">${formatSigned(row.gap)}</td>
      <td>${escapeHtml(row.coverage)}</td>
    </tr>`).join("");
}

function renderEvidence(rows) {
  const weakestIds = filterRows(rows).sort((a, b) => a.gap - b.gap).slice(0, 8).map((row) => row.id);
  const evidence = [];
  for (const participant of activeParticipants()) {
    for (const id of weakestIds) {
      const text = participant.evidence?.[id];
      if (text) evidence.push({ participant: participant.name, criterion: state.criteria.find((item) => item.id === id), text });
    }
  }
  els.evidenceList.innerHTML = evidence.length ? evidence.map((item) => `
    <article class="evidence-item">
      <h3>${escapeHtml(item.participant)} · ${escapeHtml(item.criterion.id)} ${escapeHtml(item.criterion.capability)}</h3>
      <p>${escapeHtml(item.text)}</p>
    </article>`).join("") : `<p class="hint">No evidence comments found for the currently filtered weakest capabilities.</p>`;
}

function computeCapabilityRows() {
  const participants = activeParticipants();
  return state.criteria.map((criterion) => {
    const participantScores = participants.map((participant) => combinedScore(participant, criterion.id)).filter((value) => value !== null);
    const current = average(participantScores);
    const gap = current === null ? null : current - Number(criterion.required || 0);
    const selfCount = participants.filter((participant) => scoreValue(participant.selfScores, criterion.id) !== null).length;
    const managerCount = participants.filter((participant) => scoreValue(participant.managerScores, criterion.id) !== null).length;
    const risk = classifyRisk(gap);
    return { ...criterion, current, gap, risk, riskLabel: risk === "critical" ? "Critical" : risk === "gap" ? "Gap" : "OK", coverage: `${selfCount} self / ${managerCount} manager` };
  });
}

function combinedScore(participant, id) {
  const self = scoreValue(participant.selfScores, id);
  const manager = scoreValue(participant.managerScores, id);
  let numerator = 0;
  let denominator = 0;
  if (self !== null && state.settings.selfWeight > 0) {
    numerator += self * state.settings.selfWeight;
    denominator += state.settings.selfWeight;
  }
  if (manager !== null && state.settings.managerWeight > 0) {
    numerator += manager * state.settings.managerWeight;
    denominator += state.settings.managerWeight;
  }
  if (!denominator) return self ?? manager;
  return numerator / denominator;
}

async function importWorkbook(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const criteriaFromFile = parseCriteria(workbook);
  if (criteriaFromFile.length && !state.criteria.length) state.criteria = criteriaFromFile;
  [...parseSelfAssessment(workbook, file.name), ...parseManagerAssessment(workbook, file.name)].filter(hasAnyScore).forEach(mergeParticipant);
}

function parseCriteria(workbook) {
  const sheet = workbook.Sheets["02_Self_Assessment"];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows.filter((row) => row.ID && row.Pillar && row.Capability).map((row) => ({
    id: String(row.ID).trim(),
    pillar: row.Pillar,
    capability: row.Capability,
    question: row["Assessment question"] || "",
    evidenceStandard: row["What strong evidence looks like"] || "",
    required: numberOr(row["Required level"], 3),
    weight: numberOr(row.Weight, 1),
    gapType: row["Gap type"] || "Skill",
  }));
}

function parseSelfAssessment(workbook, fileName) {
  const sheet = workbook.Sheets["02_Self_Assessment"];
  if (!sheet) return [];
  if (workbook.Sheets["03_Manager_Assessment"] && !/individual|self assessment/i.test(fileName)) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const selfScores = {};
  const evidence = {};
  for (const row of rows) {
    const id = String(row.ID || "").trim();
    const score = numberOr(row["Self score (1-5)"], null);
    if (id && score !== null) selfScores[id] = score;
    if (id && row["Evidence / example"]) evidence[id] = String(row["Evidence / example"]);
  }
  const name = inferParticipantName(fileName);
  return [{ id: slug(name), name, selfScores, managerScores: {}, evidence, sourceFiles: [fileName] }];
}

function parseManagerAssessment(workbook, fileName) {
  const sheet = workbook.Sheets["03_Manager_Assessment"];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headers = matrix[0] || [];
  const scoreColumns = headers
    .map((header, index) => ({ header: String(header || "").trim(), index }))
    .filter(({ header }) => header && !["ID", "Pillar", "Capability", "Required level", "Weight", "Gap type", "Manager notes"].includes(header))
    .filter(({ header }) => !/capacity|evidence|notes/i.test(header));
  return scoreColumns.map(({ header, index }) => {
    const name = header.replace(/\s+score$/i, "").trim();
    const managerScores = {};
    for (const row of matrix.slice(1)) {
      const id = String(row[0] || "").trim();
      const score = numberOr(row[index], null);
      if (id && score !== null) managerScores[id] = score;
    }
    return { id: slug(name), name, selfScores: {}, managerScores, evidence: {}, sourceFiles: [fileName] };
  });
}

function parsePastedRows(name, type, text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const cells = lines.map((line) => line.split("\t"));
  const header = cells[0].map((cell) => cell.trim().toLowerCase());
  const hasHeader = header.includes("id") || header.some((cell) => cell.includes("score"));
  const idIndex = hasHeader ? Math.max(0, header.indexOf("id")) : 0;
  const scoreIndex = hasHeader ? header.findIndex((cell) => cell.includes("self score") || cell === "score" || cell.includes("manager") || cell.includes("1-5")) : 6;
  const evidenceIndex = hasHeader ? header.findIndex((cell) => cell.includes("evidence")) : 7;
  const rows = hasHeader ? cells.slice(1) : cells;
  const scores = {};
  const evidence = {};
  for (const row of rows) {
    const id = String(row[idIndex] || "").trim();
    const score = numberOr(row[scoreIndex], null);
    if (id && score !== null) scores[id] = score;
    if (id && evidenceIndex >= 0 && row[evidenceIndex]) evidence[id] = row[evidenceIndex];
  }
  return { id: slug(name), name, selfScores: type === "self" ? scores : {}, managerScores: type === "manager" ? scores : {}, evidence, sourceFiles: ["pasted rows"] };
}

function mergeParticipant(incoming) {
  const existing = state.participants.find((participant) => participant.id === incoming.id);
  if (!existing) {
    state.participants.push({ ...incoming, active: true });
    return;
  }
  existing.selfScores = { ...(existing.selfScores || {}), ...(incoming.selfScores || {}) };
  existing.managerScores = { ...(existing.managerScores || {}), ...(incoming.managerScores || {}) };
  existing.evidence = { ...(existing.evidence || {}), ...(incoming.evidence || {}) };
  existing.sourceFiles = [...new Set([...(existing.sourceFiles || []), ...(incoming.sourceFiles || [])])];
  existing.active = existing.active !== false;
}

function activeParticipants() {
  return state.participants.filter((participant) => participant.active !== false);
}

function hasAnyScore(participant) {
  return Object.keys(participant.selfScores || {}).length || Object.keys(participant.managerScores || {}).length;
}

function coveragePct(participant) {
  const ids = new Set([...Object.keys(participant.selfScores || {}), ...Object.keys(participant.managerScores || {})]);
  return state.criteria.length ? (ids.size / state.criteria.length) * 100 : 0;
}

function filterRows(rows) {
  return rows.filter((row) => {
    if (state.settings.pillarFilter !== "all" && row.pillar !== state.settings.pillarFilter) return false;
    if (state.settings.riskFilter === "critical") return row.risk === "critical";
    if (state.settings.riskFilter === "gap") return row.risk === "critical" || row.risk === "gap";
    if (state.settings.riskFilter === "strong") return row.risk === "strong";
    return true;
  });
}

function classifyRisk(gap) {
  if (gap === null) return "gap";
  if (gap <= -1) return "critical";
  if (gap < 0) return "gap";
  return "strong";
}

function riskClass(gap) {
  if (gap === null || gap < 0) return gap <= -1 ? "risk-critical" : "risk-gap";
  return "risk-strong";
}

function scoreValue(scores, id) {
  const value = scores?.[id];
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function groupBy(rows, key) {
  return rows.reduce((groups, row) => {
    groups[row[key]] ||= [];
    groups[row[key]].push(row);
    return groups;
  }, {});
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "n/a";
}

function formatSigned(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function inferParticipantName(fileName) {
  const cleaned = fileName
    .replace(/\.xlsx?$/i, "")
    .replace(/DPW_Automation_Innovation_Skills_Gap_Analysis_Individual_Template/gi, "")
    .replace(/Team Gap Analysis Self Assessment/gi, "")
    .replace(/[_()0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.split(" ")[0] || "Participant";
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `participant-${Date.now()}`;
}

function kpi(label, value) {
  return `<article class="kpi"><span class="value">${escapeHtml(value)}</span><span class="label">${escapeHtml(label)}</span></article>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function toCsvLine(values) {
  return values.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",");
}

function download(filename, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportExcelReport() {
  const rows = computeCapabilityRows();
  const pillarRows = Object.entries(groupBy(rows, "pillar")).map(([pillar, items]) => {
    const current = average(items.map((item) => item.current).filter((value) => value !== null));
    const required = average(items.map((item) => item.required));
    return {
      Pillar: pillar,
      "Required avg": round(required),
      "Current avg": round(current),
      Gap: round(current === null ? null : current - required),
      "Critical items": items.filter((item) => item.risk === "critical").length,
      "Gap items": items.filter((item) => item.risk === "critical" || item.risk === "gap").length,
    };
  });
  const capabilityRows = rows.map((row) => ({
    Risk: row.riskLabel,
    ID: row.id,
    Pillar: row.pillar,
    Capability: row.capability,
    Question: row.question,
    "Required level": row.required,
    Weight: row.weight,
    "Current score": round(row.current),
    Gap: round(row.gap),
    "Source coverage": row.coverage,
    "Gap type": row.gapType,
  }));
  const participantRows = [];
  for (const participant of activeParticipants()) {
    for (const criterion of state.criteria) {
      const combined = combinedScore(participant, criterion.id);
      participantRows.push({
        Participant: participant.name,
        ID: criterion.id,
        Pillar: criterion.pillar,
        Capability: criterion.capability,
        "Self score": scoreValue(participant.selfScores, criterion.id),
        "Manager score": scoreValue(participant.managerScores, criterion.id),
        "Combined score": round(combined),
        "Required level": criterion.required,
        Gap: round(combined === null ? null : combined - criterion.required),
        Evidence: participant.evidence?.[criterion.id] || "",
      });
    }
  }
  const summary = buildNarrativeSummary(rows);
  const summaryRows = [
    { Metric: "Active participants", Value: activeParticipants().length },
    { Metric: "Capabilities assessed", Value: state.criteria.length },
    { Metric: "Self assessment weight", Value: `${Math.round(state.settings.selfWeight * 100)}%` },
    { Metric: "Manager assessment weight", Value: `${Math.round(state.settings.managerWeight * 100)}%` },
    { Metric: "Average gap", Value: formatSigned(summary.avgGap) },
    { Metric: "Critical capability gaps", Value: summary.criticalCount },
    { Metric: "Capabilities below requirement", Value: summary.gapCount },
    { Metric: "Strongest category", Value: summary.strongestPillar },
    { Metric: "Weakest category", Value: summary.weakestPillar },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Executive Summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pillarRows), "Category Summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(capabilityRows), "Capability Gaps");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(participantRows), "Participant Matrix");
  XLSX.writeFile(workbook, "DPW_Automation_Skills_Gap_Report.xlsx");
}

function exportWordReport() {
  const rows = computeCapabilityRows();
  const summary = buildNarrativeSummary(rows);
  const pillarRows = Object.entries(groupBy(rows, "pillar")).map(([pillar, items]) => {
    const current = average(items.map((item) => item.current).filter((value) => value !== null));
    const required = average(items.map((item) => item.required));
    return { pillar, current, required, gap: current === null ? null : current - required, critical: items.filter((item) => item.risk === "critical").length };
  }).sort((a, b) => a.gap - b.gap);
  const criticalRows = rows.filter((row) => row.risk === "critical").sort((a, b) => a.gap - b.gap).slice(0, 15);
  const participantSections = activeParticipants().map((participant) => {
    const detailRows = state.criteria.map((criterion) => {
      const combined = combinedScore(participant, criterion.id);
      return `<tr><td>${escapeHtml(criterion.id)}</td><td>${escapeHtml(criterion.pillar)}</td><td>${escapeHtml(criterion.capability)}</td><td>${formatNumber(scoreValue(participant.selfScores, criterion.id))}</td><td>${formatNumber(scoreValue(participant.managerScores, criterion.id))}</td><td>${formatNumber(combined)}</td><td>${formatSigned(combined === null ? null : combined - criterion.required)}</td></tr>`;
    }).join("");
    return `<h2>${escapeHtml(participant.name)}</h2><table><thead><tr><th>ID</th><th>Category</th><th>Capability</th><th>Self</th><th>Manager</th><th>Combined</th><th>Gap</th></tr></thead><tbody>${detailRows}</tbody></table>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>DPW Automation Skills Gap Report</title><style>
    body{font-family:Calibri,Arial,sans-serif;color:#1e2933} h1{color:#006b5f} h2{color:#2454a6;margin-top:24px}
    table{border-collapse:collapse;width:100%;margin:10px 0 20px} th,td{border:1px solid #cfd8e3;padding:6px 8px;font-size:10.5pt;vertical-align:top} th{background:#eef3f8}
    .metric{font-weight:bold}.critical{color:#c7352b;font-weight:bold}.gap{color:#b7791f;font-weight:bold}
  </style></head><body>
    <h1>DPW Automation & Innovation Skills Gap Analysis</h1>
    <h2>Executive Summary</h2>
    <p>This report combines available self-assessment and manager-assessment data. Current weighting is ${Math.round(state.settings.selfWeight * 100)}% self assessment and ${Math.round(state.settings.managerWeight * 100)}% manager assessment.</p>
    <table><tbody>
      <tr><td class="metric">Active participants</td><td>${activeParticipants().length}</td></tr>
      <tr><td class="metric">Capabilities assessed</td><td>${state.criteria.length}</td></tr>
      <tr><td class="metric">Average gap</td><td>${formatSigned(summary.avgGap)}</td></tr>
      <tr><td class="metric">Critical capability gaps</td><td>${summary.criticalCount}</td></tr>
      <tr><td class="metric">Capabilities below requirement</td><td>${summary.gapCount}</td></tr>
      <tr><td class="metric">Strongest category</td><td>${escapeHtml(summary.strongestPillar)}</td></tr>
      <tr><td class="metric">Weakest category</td><td>${escapeHtml(summary.weakestPillar)}</td></tr>
    </tbody></table>
    <h2>Category Summary</h2>
    <table><thead><tr><th>Category</th><th>Required</th><th>Current</th><th>Gap</th><th>Critical items</th></tr></thead><tbody>
      ${pillarRows.map((row) => `<tr><td>${escapeHtml(row.pillar)}</td><td>${formatNumber(row.required)}</td><td>${formatNumber(row.current)}</td><td class="${row.gap <= -1 ? "critical" : row.gap < 0 ? "gap" : ""}">${formatSigned(row.gap)}</td><td>${row.critical}</td></tr>`).join("")}
    </tbody></table>
    <h2>Priority Capability Gaps</h2>
    <table><thead><tr><th>ID</th><th>Category</th><th>Capability</th><th>Required</th><th>Current</th><th>Gap</th><th>Coverage</th></tr></thead><tbody>
      ${criticalRows.map((row) => `<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.pillar)}</td><td>${escapeHtml(row.capability)}</td><td>${formatNumber(row.required)}</td><td>${formatNumber(row.current)}</td><td class="critical">${formatSigned(row.gap)}</td><td>${escapeHtml(row.coverage)}</td></tr>`).join("")}
    </tbody></table>
    <h2>Participant Detail</h2>
    ${participantSections}
  </body></html>`;
  download("DPW_Automation_Skills_Gap_Report.doc", new Blob([html], { type: "application/msword;charset=utf-8" }));
}

function buildNarrativeSummary(rows) {
  const pillarRows = Object.entries(groupBy(rows, "pillar")).map(([pillar, items]) => {
    const current = average(items.map((item) => item.current).filter((value) => value !== null));
    const required = average(items.map((item) => item.required));
    return { pillar, gap: current === null ? null : current - required };
  }).filter((row) => row.gap !== null).sort((a, b) => a.gap - b.gap);
  return {
    avgGap: average(rows.filter((row) => row.current !== null).map((row) => row.gap)),
    criticalCount: rows.filter((row) => row.risk === "critical").length,
    gapCount: rows.filter((row) => row.risk === "critical" || row.risk === "gap").length,
    weakestPillar: pillarRows[0]?.pillar || "n/a",
    strongestPillar: pillarRows[pillarRows.length - 1]?.pillar || "n/a",
  };
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : "";
}
