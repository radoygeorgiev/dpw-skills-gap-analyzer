const STORAGE_KEY = "dpw-skills-gap-analyzer-v2";

const state = loadState();

const els = {
  fileInput: document.getElementById("fileInput"),
  importFileBtn: document.getElementById("importFileBtn"),
  selfWeight: document.getElementById("selfWeight"),
  selfWeightValue: document.getElementById("selfWeightValue"),
  managerWeight: document.getElementById("managerWeight"),
  managerWeightValue: document.getElementById("managerWeightValue"),
  pillarFilter: document.getElementById("pillarFilter"),
  riskFilter: document.getElementById("riskFilter"),
  participantList: document.getElementById("participantList"),
  kpisRow: document.getElementById("kpisRow"),
  pillarGrid: document.getElementById("pillarGrid"),
  gapRows: document.getElementById("gapRows"),
  evidenceList: document.getElementById("evidenceList"),
  resetBtn: document.getElementById("resetBtn"),
  exportExcelBtn: document.getElementById("exportExcelBtn"),
  exportWordBtn: document.getElementById("exportWordBtn"),
  pasteName: document.getElementById("pasteName"),
  pasteType: document.getElementById("pasteType"),
  pasteText: document.getElementById("pasteText"),
  applyPasteBtn: document.getElementById("applyPasteBtn"),
  
  // Tabs
  navTabs: document.getElementById("navTabs"),
  
  // Matrix Sheet
  matrixColgroup: document.getElementById("matrixColgroup"),
  matrixHeader: document.getElementById("matrixHeader"),
  matrixRows: document.getElementById("matrixRows"),
  toggleDetailsBtn: document.getElementById("toggleDetailsBtn"),
  addParticipantBtn: document.getElementById("addParticipantBtn"),
  addParticipantDialog: document.getElementById("addParticipantDialog"),
  newPartName: document.getElementById("newPartName"),
  confirmAddParticipantBtn: document.getElementById("confirmAddParticipantBtn"),
  
  // Radar Container
  radarContainer: document.getElementById("radarContainer"),

  // Bulk Paste Dialog
  bulkPasteBtn: document.getElementById("bulkPasteBtn"),
  bulkPasteDialog: document.getElementById("bulkPasteDialog"),
  bulkPastePartSelect: document.getElementById("bulkPastePartSelect"),
  bulkPasteNewNameGroup: document.getElementById("bulkPasteNewNameGroup"),
  bulkPasteNewName: document.getElementById("bulkPasteNewName"),
  bulkPasteType: document.getElementById("bulkPasteType"),
  bulkPasteTextArea: document.getElementById("bulkPasteTextArea"),
  confirmBulkPasteBtn: document.getElementById("confirmBulkPasteBtn"),

  clipboardAlert: document.getElementById("clipboardAlert")
};

// Initialize event listeners and render
setupNavigation();
hydrateControls();
setupMatrixActions();
render();

// ----------------------------------------------------
// EVENT LISTENERS Setup
// ----------------------------------------------------

els.fileInput.addEventListener("change", handleFileImport);
els.importFileBtn.addEventListener("change", handleFileImport);

async function handleFileImport(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files) await importWorkbook(file);
  event.target.value = "";
  saveAndRender();
}

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
  if (confirm("Reset current data back to standard Lawrence & Diego sample inputs? Any browser overrides will be lost.")) {
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, fromSeed());
    hydrateControls();
    saveAndRender();
  }
});

els.exportExcelBtn.addEventListener("click", exportExcelReport);
els.exportWordBtn.addEventListener("click", exportWordReport);

els.applyPasteBtn.addEventListener("click", () => {
  const name = els.pasteName.value.trim();
  const text = els.pasteText.value.trim();
  if (!name || !text) {
    alert("Please enter a participant name and paste raw Excel data.");
    return;
  }
  mergeParticipant(parsePastedRows(name, els.pasteType.value, text));
  els.pasteName.value = "";
  els.pasteText.value = "";
  alert(`Imported assessment rows for ${name}.`);
  saveAndRender();
});

// Removed Job Description and Slide presentation copy buttons

// ----------------------------------------------------
// STATE & SEED DATA LOADING
// ----------------------------------------------------

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
    participants: structuredClone(window.SEED_DATA.participants).filter(p => p.id !== 'manager-notes'),
    settings: { selfWeight: 0.5, managerWeight: 0.5, pillarFilter: "all", riskFilter: "all" },
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

// ----------------------------------------------------
// TABS & NAVIGATION SYSTEM
// ----------------------------------------------------

function setupNavigation() {
  els.navTabs.querySelectorAll(".tab-btn").forEach(button => {
    button.addEventListener("click", () => {
      // Deactivate all
      els.navTabs.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));
      
      // Activate this
      button.classList.add("active");
      const targetId = button.dataset.tab;
      document.getElementById(targetId).classList.add("active");
      
      // Re-trigger specific renders if needed
      if (targetId === "tab-matrix") {
        renderMatrix();
      }
    });
  });
}

// ----------------------------------------------------
// CORE RENDERING ENGINE
// ----------------------------------------------------

function render() {
  renderFilters();
  renderParticipants();
  
  const rows = computeCapabilityRows();
  renderKpis(rows);
  renderPillars(rows);
  renderGapRows(rows);
  renderEvidence(rows);
  renderRadarChart(rows);
  renderMatrix();
}

function renderFilters() {
  const currentVal = els.pillarFilter.value;
  const pillars = ["all", ...new Set(state.criteria.map((item) => item.pillar))];
  els.pillarFilter.innerHTML = pillars.map((pillar) => `<option value="${escapeHtml(pillar)}">${pillar === "all" ? "All pillars" : escapeHtml(pillar)}</option>`).join("");
  els.pillarFilter.value = state.settings.pillarFilter === "all" ? "all" : state.settings.pillarFilter;
}

function renderParticipants() {
  if (!state.participants.length) {
    els.participantList.innerHTML = `<p class="hint">No participants loaded. Import completed Excel templates or add manually.</p>`;
    return;
  }
  els.participantList.innerHTML = state.participants.map((participant) => {
    const selfCount = Object.keys(participant.selfScores || {}).length;
    const managerCount = Object.keys(participant.managerScores || {}).length;
    const checked = participant.active === false ? "" : "checked";
    return `
      <article class="participant-item">
        <div class="participant-item-row">
          <label>
            <input type="checkbox" data-action="toggle" data-id="${participant.id}" ${checked}> 
            <strong>${escapeHtml(participant.name)}</strong>
          </label>
          <button type="button" class="danger-ghost icon-button" data-action="remove" data-id="${participant.id}" style="padding:0.2rem 0.5rem; font-size:0.75rem;">Delete</button>
        </div>
        <div class="badge-row">
          <span class="badge primary">Self: ${selfCount}</span>
          <span class="badge secondary">Manager: ${managerCount}</span>
          <span class="badge" title="${escapeHtml((participant.sourceFiles || []).slice(-1)[0] || "custom matrix")}">${escapeHtml(shortenFilename((participant.sourceFiles || []).slice(-1)[0] || "custom matrix"))}</span>
        </div>
      </article>`;
  }).join("");

  els.participantList.querySelectorAll("button[data-action='remove']").forEach((button) => {
    button.addEventListener("click", () => {
      if (confirm(`Remove ${button.dataset.id} and delete all their local scores?`)) {
        state.participants = state.participants.filter((p) => p.id !== button.dataset.id);
        saveAndRender();
      }
    });
  });
  
  els.participantList.querySelectorAll("input[data-action='toggle']").forEach((input) => {
    input.addEventListener("change", () => {
      const participant = state.participants.find((p) => p.id === input.dataset.id);
      if (participant) participant.active = input.checked;
      saveAndRender();
    });
  });
}

function renderKpis(rows) {
  const active = activeParticipants();
  const avgGap = average(rows.filter((row) => row.current !== null).map((row) => row.gap));
  const critical = rows.filter((row) => row.risk === "critical").length;
  
  els.kpisRow.innerHTML = `
    <article class="kpi-card">
      <span class="kpi-val">${active.length}</span>
      <span class="kpi-lbl">Active Members</span>
    </article>
    <article class="kpi-card accent">
      <span class="kpi-val">${state.criteria.length}</span>
      <span class="kpi-lbl">Capabilities</span>
    </article>
    <article class="kpi-card">
      <span class="kpi-val ${riskClass(avgGap)}">${formatSigned(avgGap)}</span>
      <span class="kpi-lbl">Average Team Gap</span>
    </article>
    <article class="kpi-card">
      <span class="kpi-val" style="color: var(--red);">${critical}</span>
      <span class="kpi-lbl">Critical Gaps</span>
    </article>
    <article class="kpi-card accent">
      <span class="kpi-val">${Math.round(average(active.map(coveragePct)) || 0)}%</span>
      <span class="kpi-lbl">Average Coverage</span>
    </article>
  `;
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
      <article class="pillar-item-card">
        <h4>${escapeHtml(pillar)}</h4>
        <div class="pillar-progress-container">
          <div class="pillar-progress-bar"><span class="pillar-progress-fill" style="width:${pct}%"></span></div>
          <div class="pillar-metrics">
            <span>Score: ${formatNumber(current)} / 5</span>
            <span>Required: ${formatNumber(required)}</span>
          </div>
        </div>
        <div class="pillar-badge-group">
          <span class="risk-pill ${classifyRisk(gap)}" style="min-width: 75px; font-size:0.65rem;">Gap ${formatSigned(gap)}</span>
          <span class="badge">Critical: ${critical}</span>
        </div>
      </article>`;
  }).join("");
}

function renderGapRows(rows) {
  const filtered = filterRows(rows);
  if (!filtered.length) {
    els.gapRows.innerHTML = `<tr><td colspan="8" class="hint" style="text-align:center; padding: 2rem;">No capabilities found matching the selected filters.</td></tr>`;
    return;
  }
  
  els.gapRows.innerHTML = filtered.map((row) => `
    <tr>
      <td><span class="risk-pill ${row.risk}">${row.riskLabel}</span></td>
      <td class="score-cell">${escapeHtml(row.id)}</td>
      <td><strong>${escapeHtml(row.pillar)}</strong></td>
      <td>${escapeHtml(row.capability)}</td>
      <td class="score-cell" style="text-align:center;">${formatNumber(row.required)}</td>
      <td class="score-cell" style="text-align:center;">${formatNumber(row.current)}</td>
      <td class="gap-cell ${row.gap < 0 ? (row.gap <= -1 ? 'negative' : 'warning') : 'positive'}" style="text-align:center;">${formatSigned(row.gap)}</td>
      <td><span class="badge">${escapeHtml(row.coverage)}</span></td>
    </tr>`).join("");
}

function renderEvidence(rows) {
  const weakestIds = filterRows(rows).sort((a, b) => a.gap - b.gap).slice(0, 6).map((row) => row.id);
  const evidence = [];
  
  for (const participant of activeParticipants()) {
    for (const id of weakestIds) {
      const text = participant.evidence?.[id];
      if (text) {
        evidence.push({
          participant: participant.name,
          id: id,
          capability: state.criteria.find((item) => item.id === id)?.capability || "",
          text: text
        });
      }
    }
  }
  
  if (!evidence.length) {
    els.evidenceList.innerHTML = `<p class="hint" style="grid-column: 1/-1; text-align: center; padding: 1.5rem;">No evidence comments recorded for the weakest capability gaps yet.</p>`;
    return;
  }
  
  els.evidenceList.innerHTML = evidence.map((item) => `
    <article class="evidence-item" style="border-left: 4px solid var(--primary);">
      <h3 style="font-size:0.9rem; font-family: var(--font-display); color: var(--secondary); margin-bottom: 0.25rem;">
        ${escapeHtml(item.participant)} <span class="badge">${escapeHtml(item.id)}</span>
      </h3>
      <p style="font-size:0.75rem; font-weight:600; color: var(--text-muted); margin-bottom:0.5rem;">${escapeHtml(item.capability)}</p>
      <p style="font-size:0.825rem; font-style:italic;">"${escapeHtml(item.text)}"</p>
    </article>`).join("");
}

// ----------------------------------------------------
// OFFLINE SVG RADAR CHART GENERATOR
// ----------------------------------------------------

function renderRadarChart(rows) {
  const groups = groupBy(rows, "pillar");
  const pillars = Object.keys(groups);
  
  const requiredLevels = [];
  const currentLevels = [];
  
  pillars.forEach(pillar => {
    const items = groups[pillar];
    const req = average(items.map(item => item.required)) || 0;
    const cur = average(items.map(item => item.current).filter(v => v !== null)) || 0;
    requiredLevels.push(req);
    currentLevels.push(cur);
  });
  
  els.radarContainer.innerHTML = buildRadarSvg(pillars, requiredLevels, currentLevels);
}

function buildRadarSvg(categories, required, current) {
  const width = 640;
  const height = 400;
  const cx = 320;
  const cy = 200;
  const rMax = 120;
  const N = categories.length;
  
  let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`;
  
  // Style tags
  svg += `<style>
    .grid-line { stroke: #cbd5e1; stroke-width: 0.75; fill: none; }
    .grid-poly { stroke: #e2e8f0; stroke-width: 1; fill: none; stroke-dasharray: 2,2; }
    .axis-line { stroke: #cbd5e1; stroke-width: 1; }
    .label-text { font-family: 'Outfit', sans-serif; font-size: 8px; font-weight: 700; fill: #475569; }
    .ring-text { font-family: 'Inter', sans-serif; font-size: 7px; fill: #94a3b8; }
    .poly-req { stroke: #1e3a8a; stroke-width: 1.5; stroke-dasharray: 4,3; fill: rgba(30, 58, 138, 0.04); }
    .poly-cur { stroke: #0d9488; stroke-width: 2.5; fill: rgba(13, 148, 136, 0.25); }
    .point-cur { fill: #0d9488; stroke: #ffffff; stroke-width: 1; }
    .point-req { fill: #1e3a8a; }
  </style>`;
  
  // Concentric Rings (Levels 1 to 5)
  for (let lvl = 1; lvl <= 5; lvl++) {
    const radius = rMax * (lvl / 5);
    const points = [];
    for (let i = 0; i < N; i++) {
      const angle = i * (2 * Math.PI / N) - Math.PI / 2;
      const px = cx + radius * Math.cos(angle);
      const py = cy + radius * Math.sin(angle);
      points.push(`${px},${py}`);
    }
    svg += `<polygon points="${points.join(' ')}" class="grid-poly" />`;
    // Add rings labels
    svg += `<text x="${cx + 4}" y="${cy - radius + 2}" class="ring-text">${lvl}</text>`;
  }
  
  // Spokes (Axes) & Labels
  const shortNames = {
    "Mandate & strategy": "Mandate",
    "Regional community enablement": "Community",
    "Automation solutioning": "Solutions",
    "Automation library / catalogue": "Library",
    "Vendor and SRM": "Vendor",
    "PoC and R&D": "R&D / PoC",
    "Integration readiness": "Integration",
    "Data, ROI and evidence": "Data/ROI",
    "Geographic coverage and capacity": "Geo/Bandwidth"
  };

  for (let i = 0; i < N; i++) {
    const angle = i * (2 * Math.PI / N) - Math.PI / 2;
    const ax = cx + rMax * Math.cos(angle);
    const ay = cy + rMax * Math.sin(angle);
    
    // Draw axle line
    svg += `<line x1="${cx}" y1="${cy}" x2="${ax}" y2="${ay}" class="grid-line" />`;
    
    // Position text label
    const lx = cx + (rMax + 24) * Math.cos(angle);
    const ly = cy + (rMax + 14) * Math.sin(angle);
    
    // Adjust alignment based on quadrant
    let anchor = "middle";
    if (Math.cos(angle) > 0.1) anchor = "start";
    else if (Math.cos(angle) < -0.1) anchor = "end";
    
    const label = shortNames[categories[i]] || categories[i];
    svg += `<text x="${lx}" y="${ly}" text-anchor="${anchor}" class="label-text">${escapeHtml(label)}</text>`;
  }
  
  // Plot 1: Required Level Polygon
  const reqPoints = [];
  for (let i = 0; i < N; i++) {
    const angle = i * (2 * Math.PI / N) - Math.PI / 2;
    const radius = rMax * (required[i] / 5);
    const rx = cx + radius * Math.cos(angle);
    const ry = cy + radius * Math.sin(angle);
    reqPoints.push(`${rx},${ry}`);
  }
  svg += `<polygon points="${reqPoints.join(' ')}" class="poly-req" />`;
  
  // Plot 2: Current Team Level Polygon
  const curPoints = [];
  for (let i = 0; i < N; i++) {
    const angle = i * (2 * Math.PI / N) - Math.PI / 2;
    const radius = rMax * (current[i] / 5);
    const rx = cx + radius * Math.cos(angle);
    const ry = cy + radius * Math.sin(angle);
    curPoints.push(`${rx},${ry}`);
  }
  svg += `<polygon points="${curPoints.join(' ')}" class="poly-cur" />`;
  
  // Dot vertices
  for (let i = 0; i < N; i++) {
    const angle = i * (2 * Math.PI / N) - Math.PI / 2;
    
    // Required dot
    const reqRadius = rMax * (required[i] / 5);
    svg += `<circle cx="${cx + reqRadius * Math.cos(angle)}" cy="${cy + reqRadius * Math.sin(angle)}" r="3.5" class="point-req" />`;
    
    // Current dot
    const curRadius = rMax * (current[i] / 5);
    svg += `<circle cx="${cx + curRadius * Math.cos(angle)}" cy="${cy + curRadius * Math.sin(angle)}" r="4.5" class="point-cur" />`;
  }
  
  // Legend overlay
  svg += `
    <g transform="translate(10, 10)">
      <rect x="0" y="0" width="130" height="42" fill="rgba(255,255,255,0.85)" rx="6" stroke="#e2e8f0" stroke-width="1" />
      
      <line x1="10" y1="12" x2="30" y2="12" stroke="#1e3a8a" stroke-width="1.5" stroke-dasharray="4,2" />
      <circle cx="20" cy="12" r="3.5" fill="#1e3a8a" />
      <text x="38" y="15" font-family="'Outfit', sans-serif" font-size="8px" font-weight="600" fill="#1e3a8a">Required Target</text>
      
      <line x1="10" y1="28" x2="30" y2="28" stroke="#0d9488" stroke-width="2.5" />
      <circle cx="20" cy="28" r="4.5" fill="#0d9488" stroke="#ffffff" stroke-width="1" />
      <text x="38" y="31" font-family="'Outfit', sans-serif" font-size="8px" font-weight="700" fill="#0d9488">Team Blended Avg</text>
    </g>
  `;
  
  svg += `</svg>`;
  return svg;
}



function setupMatrixActions() {
  els.addParticipantBtn.addEventListener("click", () => els.addParticipantDialog.showModal());
  
  els.confirmAddParticipantBtn.addEventListener("click", () => {
    const name = els.newPartName.value.trim();
    if (!name) return;
    const id = slug(name);
    
    // Add to participants list if doesn't exist
    if (!state.participants.some(p => p.id === id)) {
      state.participants.push({
        id: id,
        name: name,
        selfScores: {},
        managerScores: {},
        evidence: {},
        sourceFiles: ["manual matrix"],
        active: true
      });
      saveAndRender();
    }
    
    els.newPartName.value = "";
    els.addParticipantDialog.close();
  });

  // Bulk Paste Dialog wire-up
  if (els.bulkPasteBtn && els.bulkPasteDialog) {
    els.bulkPasteBtn.addEventListener("click", () => {
      // Populate select options
      const select = els.bulkPastePartSelect;
      select.innerHTML = state.participants.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join("") + 
        `<option value="new">+ Create New Participant...</option>`;
      
      // Hide new name input initially unless last item is selected
      els.bulkPasteNewNameGroup.style.display = "none";
      els.bulkPasteNewName.value = "";
      els.bulkPasteTextArea.value = "";
      els.bulkPasteDialog.showModal();
    });

    els.bulkPastePartSelect.addEventListener("change", () => {
      if (els.bulkPastePartSelect.value === "new") {
        els.bulkPasteNewNameGroup.style.display = "block";
        els.bulkPasteNewName.focus();
      } else {
        els.bulkPasteNewNameGroup.style.display = "none";
      }
    });

    els.confirmBulkPasteBtn.addEventListener("click", () => {
      const selectVal = els.bulkPastePartSelect.value;
      let name = "";
      if (selectVal === "new") {
        name = els.bulkPasteNewName.value.trim();
        if (!name) {
          alert("Please enter a name for the new participant.");
          return;
        }
      } else {
        const participant = state.participants.find(p => p.id === selectVal);
        name = participant ? participant.name : selectVal;
      }

      const text = els.bulkPasteTextArea.value.trim();
      if (!text) {
        alert("Please paste the tab-delimited Excel rows first.");
        return;
      }

      const type = els.bulkPasteType.value;
      const parsed = parsePastedRows(name, type, text);
      mergeParticipant(parsed);
      
      // Clean up and close
      els.bulkPasteNewName.value = "";
      els.bulkPasteTextArea.value = "";
      els.bulkPasteDialog.close();
      
      saveAndRender();
      alert(`Successfully processed and integrated bulk data for ${name}!`);
    });
  }
}

function renderMatrix() {
  const parts = state.participants;
  if (!parts.length || !els.matrixHeader) return;
  
  // Build and inject dynamic <colgroup> for solid fixed layout grid alignment
  if (els.matrixColgroup) {
    let colgroupHtml = `
      <col style="width: 50px;">
      <col style="width: 360px;">
      <col style="width: 80px;">
    `;
    parts.forEach(() => {
      colgroupHtml += `
        <col style="width: 90px;">
        <col style="width: 90px;">
        <col style="width: 220px;">
      `;
    });
    els.matrixColgroup.innerHTML = colgroupHtml;
  }
  
  // Build header row
  let headerHtml = `
    <th class="left-align">ID</th>
    <th class="left-align">Capability</th>
    <th>Required</th>
  `;
  
  parts.forEach(p => {
    headerHtml += `
      <th style="border-left: 2px solid var(--line-color);">${escapeHtml(p.name)} Self</th>
      <th>${escapeHtml(p.name)} Manager</th>
      <th>${escapeHtml(p.name)} Evidence</th>
    `;
  });
  els.matrixHeader.innerHTML = headerHtml;
  
  // Group criteria by pillar
  const groups = groupBy(state.criteria, "pillar");
  let rowsHtml = "";
  
  Object.entries(groups).forEach(([pillar, items]) => {
    // Add Category section divider row
    rowsHtml += `
      <tr class="category-divider">
        <td colspan="${3 + parts.length * 3}" class="left-align">${escapeHtml(pillar)}</td>
      </tr>
    `;
    
    items.forEach(c => {
      let rowCells = `
        <td class="left-align" style="font-weight:600; color:var(--text-muted);">${escapeHtml(c.id)}</td>
        <td class="left-align capability-cell">
          <div class="capability-title-row">
            <strong>${escapeHtml(c.capability)}</strong>
            <div class="info-tooltip-wrapper">
              <button class="btn-info-tooltip" type="button" aria-label="Capability Info">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              </button>
              <div class="info-tooltip-content">
                <div class="tooltip-section">
                  <span class="tooltip-label">Assessment Question</span>
                  <p class="tooltip-text">${escapeHtml(c.question || "N/A")}</p>
                </div>
                <div class="tooltip-section">
                  <span class="tooltip-label">Strong Evidence Standard</span>
                  <p class="tooltip-text">${escapeHtml(c.evidenceStandard || "N/A")}</p>
                </div>
              </div>
            </div>
          </div>
        </td>
        <td style="text-align:center;">
          <select data-action="required-score" data-id="${c.id}" style="font-weight:700;">
            ${[1, 2, 3, 4, 5].includes(c.required) ? "" : `<option value="${c.required}" selected>${c.required}</option>`}
            ${[1, 2, 3, 4, 5].map(v => `<option value="${v}" ${c.required == v ? 'selected' : ''}>${v}</option>`).join("")}
          </select>
        </td>
      `;
      
      parts.forEach(p => {
        const selfVal = p.selfScores?.[c.id] ?? "";
        const mgrVal = p.managerScores?.[c.id] ?? "";
        const evidenceVal = p.evidence?.[c.id] ?? "";
        
        rowCells += `
          <td style="border-left: 2px solid var(--line-color); text-align:center;">
            <select data-action="score" data-part="${p.id}" data-type="self" data-id="${c.id}">
              <option value=""></option>
              ${[1, 2, 3, 4, 5].map(v => `<option value="${v}" ${selfVal == v ? 'selected' : ''}>${v}</option>`).join("")}
            </select>
          </td>
          <td style="text-align:center;">
            <select data-action="score" data-part="${p.id}" data-type="manager" data-id="${c.id}">
              <option value=""></option>
              ${[1, 2, 3, 4, 5].map(v => `<option value="${v}" ${mgrVal == v ? 'selected' : ''}>${v}</option>`).join("")}
            </select>
          </td>
          <td>
            <textarea data-action="evidence" data-part="${p.id}" data-id="${c.id}" placeholder="Example...">${escapeHtml(evidenceVal)}</textarea>
          </td>
        `;
      });
      rowsHtml += `<tr>${rowCells}</tr>`;
    });
  });
  
  els.matrixRows.innerHTML = rowsHtml;
  
  // Attach listeners to input changes in matrix
  els.matrixRows.querySelectorAll("select[data-action='score']").forEach(select => {
    select.addEventListener("change", (e) => {
      const { part, type, id } = select.dataset;
      const val = select.value === "" ? null : Number(select.value);
      const participant = state.participants.find(p => p.id === part);
      if (participant) {
        const scoresKey = type === "self" ? "selfScores" : "managerScores";
        participant[scoresKey] ||= {};
        if (val === null) {
          delete participant[scoresKey][id];
        } else {
          participant[scoresKey][id] = val;
        }
        saveAndRender();
      }
    });
  });

  els.matrixRows.querySelectorAll("textarea[data-action='evidence']").forEach(textarea => {
    textarea.addEventListener("blur", (e) => {
      const { part, id } = textarea.dataset;
      const val = textarea.value.trim();
      const participant = state.participants.find(p => p.id === part);
      if (participant) {
        participant.evidence ||= {};
        if (!val) {
          delete participant.evidence[id];
        } else {
          participant.evidence[id] = val;
        }
        saveAndRender();
      }
    });
  });

  els.matrixRows.querySelectorAll("select[data-action='required-score']").forEach(select => {
    select.addEventListener("change", (e) => {
      const { id } = select.dataset;
      const val = Number(select.value);
      const criterion = state.criteria.find(c => c.id === id);
      if (criterion) {
        criterion.required = val;
        saveAndRender();
      }
    });
  });
}

// Removed obsolete ROI calculator and Slides Presentation functions to maintain strict current-state gap analysis focus

// ----------------------------------------------------
// MATH & UTILITY FUNCTIONS
// ----------------------------------------------------

function computeCapabilityRows() {
  const participants = activeParticipants();
  return state.criteria.map((criterion) => {
    const participantScores = participants.map((p) => combinedScore(p, criterion.id)).filter((v) => v !== null);
    const current = average(participantScores);
    const gap = current === null ? null : current - Number(criterion.required || 0);
    const selfCount = participants.filter((p) => scoreValue(p.selfScores, criterion.id) !== null).length;
    const managerCount = participants.filter((p) => scoreValue(p.managerScores, criterion.id) !== null).length;
    const risk = classifyRisk(gap);
    
    return { 
      ...criterion, 
      current, 
      gap, 
      risk, 
      riskLabel: risk === "critical" ? "Critical" : risk === "gap" ? "Gap" : "OK", 
      coverage: `${selfCount} self / ${managerCount} manager` 
    };
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
  
  const selfAssess = parseSelfAssessment(workbook, file.name);
  const managerAssess = parseManagerAssessment(workbook, file.name);
  
  [...selfAssess, ...managerAssess].filter(hasAnyScore).forEach(mergeParticipant);
}

function parseCriteria(workbook) {
  const sheet = workbook.Sheets["02_Self_Assessment"] || workbook.Sheets["02_Self_Assessments"];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows.filter((row) => row.ID && row.Pillar && row.Capability).map((row) => ({
    id: String(row.ID).trim(),
    pillar: row.Pillar,
    capability: row.Capability,
    question: row["Assessment question"] || row["Assessment Question"] || "",
    evidenceStandard: row["What strong evidence looks like"] || row["What Strong Evidence Looks Like"] || "",
    required: numberOr(row["Required level"] || row["Required Level"], 3),
    weight: numberOr(row.Weight, 1),
    gapType: row["Gap type"] || row["Gap Type"] || "Skill",
  }));
}

function parseSelfAssessment(workbook, fileName) {
  const sheet = workbook.Sheets["02_Self_Assessment"] || workbook.Sheets["02_Self_Assessments"];
  if (!sheet) return [];
  if (workbook.Sheets["03_Manager_Assessment"] && !/individual|self assessment/i.test(fileName)) return [];
  
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const selfScores = {};
  const evidence = {};
  
  for (const row of rows) {
    const id = String(row.ID || "").trim();
    // Support columns in both template versions
    const scoreVal = row["Self score (1-5)"] || row["Self Score"] || row["Lawrence Self Score"] || row["Diego Self Score"];
    const score = numberOr(scoreVal, null);
    
    if (id && score !== null) selfScores[id] = score;
    
    const evVal = row["Evidence / example"] || row["Evidence / Example"] || row["Lawrence Evidence"] || row["Diego Evidence"];
    if (id && evVal) evidence[id] = String(evVal);
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
    .filter(({ header }) => header && !["ID", "Pillar", "Capability", "Required level", "Required Level", "Weight", "Gap type", "Gap Type", "Manager notes", "Manager Notes"].includes(header))
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
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const cells = lines.map((line) => line.split("\t"));
  if (cells.length === 0) return { id: slug(name), name, selfScores: {}, managerScores: {}, evidence: {}, sourceFiles: ["pasted rows"] };

  // Check if there's a header line
  const firstRowLower = cells[0].map(c => c.trim().toLowerCase());
  const hasHeader = firstRowLower.includes("id") || firstRowLower.some(c => c.includes("score") || c.includes("required"));

  // Heuristic Scan
  const numRowsToScan = Math.min(cells.length, 12);
  const startRow = hasHeader ? 1 : 0;
  const scanRows = cells.slice(startRow, numRowsToScan);

  // Find max columns
  let maxCols = 0;
  scanRows.forEach(row => {
    if (row.length > maxCols) maxCols = row.length;
  });

  const idCounts = Array(maxCols).fill(0);
  const scoreCounts = Array(maxCols).fill(0);
  const evidenceTextCounts = Array(maxCols).fill(0);
  const evidenceTextLengths = Array(maxCols).fill(0);

  const standardLabels = new Set();
  if (state.criteria) {
    state.criteria.forEach(c => {
      standardLabels.add(c.id.toLowerCase());
      standardLabels.add(c.pillar.toLowerCase());
      standardLabels.add(c.capability.toLowerCase());
      if (c.question) standardLabels.add(c.question.toLowerCase());
      if (c.evidenceStandard) standardLabels.add(c.evidenceStandard.toLowerCase());
    });
  }

  scanRows.forEach(row => {
    row.forEach((cellRaw, cIdx) => {
      const cell = cellRaw.trim();
      if (!cell) return;

      if (/^[a-z]\d{2}$/i.test(cell)) {
        idCounts[cIdx]++;
      }

      const num = Number(cell);
      if (!isNaN(num) && Number.isInteger(num) && num >= 1 && num <= 5) {
        scoreCounts[cIdx]++;
      }

      const isScoreVal = !isNaN(num) && num >= 1 && num <= 5;
      const isIdVal = /^[a-z]\d{2}$/i.test(cell);
      const isStandardLabel = standardLabels.has(cell.toLowerCase());
      if (!isScoreVal && !isIdVal && !isStandardLabel && cell.length > 3) {
        evidenceTextCounts[cIdx]++;
        evidenceTextLengths[cIdx] += cell.length;
      }
    });
  });

  let idIndex = 0;
  let maxIdCount = -1;
  for (let i = 0; i < maxCols; i++) {
    if (idCounts[i] > maxIdCount) {
      maxIdCount = idCounts[i];
      idIndex = i;
    }
  }

  let scoreIndex = -1;
  let maxScoreCount = -1;
  for (let i = 0; i < maxCols; i++) {
    if (i === idIndex) continue;
    if (scoreCounts[i] > maxScoreCount) {
      maxScoreCount = scoreCounts[i];
      scoreIndex = i;
    }
  }
  if (scoreIndex === -1) {
    scoreIndex = idIndex + 1 < maxCols ? idIndex + 1 : idIndex;
  }

  let evidenceIndex = -1;
  let maxEvidenceCount = -1;
  let maxEvidenceLen = -1;
  for (let i = 0; i < maxCols; i++) {
    if (i === idIndex || i === scoreIndex) continue;
    if (evidenceTextCounts[i] > maxEvidenceCount) {
      maxEvidenceCount = evidenceTextCounts[i];
      maxEvidenceLen = evidenceTextLengths[i];
      evidenceIndex = i;
    } else if (evidenceTextCounts[i] === maxEvidenceCount && evidenceTextLengths[i] > maxEvidenceLen) {
      maxEvidenceLen = evidenceTextLengths[i];
      evidenceIndex = i;
    }
  }

  if (evidenceIndex === -1) {
    if (scoreIndex + 1 < maxCols && scoreIndex + 1 !== idIndex) {
      evidenceIndex = scoreIndex + 1;
    }
  }

  const rows = hasHeader ? cells.slice(1) : cells;
  const scores = {};
  const evidence = {};

  rows.forEach(row => {
    if (row.length <= idIndex) return;
    const id = String(row[idIndex] || "").trim();
    if (!id || !/^[a-z]\d{2}$/i.test(id)) return;

    if (scoreIndex >= 0 && row.length > scoreIndex) {
      const scoreVal = row[scoreIndex].trim();
      const num = Number(scoreVal);
      if (scoreVal && !isNaN(num) && num >= 1 && num <= 5) {
        scores[id.toUpperCase()] = num;
      }
    }

    if (evidenceIndex >= 0 && row.length > evidenceIndex) {
      const evidenceVal = row[evidenceIndex].trim();
      const isStandardLabel = standardLabels.has(evidenceVal.toLowerCase());
      if (evidenceVal && !isStandardLabel && evidenceVal.length > 1) {
        evidence[id.toUpperCase()] = evidenceVal;
      }
    }
  });

  return {
    id: slug(name),
    name,
    selfScores: type === "self" ? scores : {},
    managerScores: type === "manager" ? scores : {},
    evidence,
    sourceFiles: ["pasted rows"]
  };
}

function mergeParticipant(incoming) {
  const existing = state.participants.find((p) => p.id === incoming.id);
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
  return state.participants.filter((p) => p.active !== false);
}

function hasAnyScore(p) {
  return Object.keys(p.selfScores || {}).length || Object.keys(p.managerScores || {}).length;
}

function coveragePct(p) {
  const ids = new Set([...Object.keys(p.selfScores || {}), ...Object.keys(p.managerScores || {})]);
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
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) return null;
  return clean.reduce((sum, v) => sum + v, 0) / clean.length;
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

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
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

function shortenFilename(name, maxLen = 22) {
  if (!name) return "";
  if (name.length <= maxLen) return name;
  const extIndex = name.lastIndexOf(".");
  if (extIndex !== -1 && name.length - extIndex <= 5 && name.length - extIndex >= 3) {
    const ext = name.substring(extIndex);
    const base = name.substring(0, extIndex);
    return base.substring(0, maxLen - ext.length - 3) + "..." + ext;
  }
  return name.substring(0, maxLen - 3) + "...";
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `participant-${Date.now()}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function copyTextToClipboard(text) {
  const el = document.createElement('textarea');
  el.value = text;
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

function showClipboardAlert(message) {
  els.clipboardAlert.textContent = message;
  els.clipboardAlert.style.display = "block";
  setTimeout(() => {
    els.clipboardAlert.style.display = "none";
  }, 2500);
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ----------------------------------------------------
// EXCEL CONSOLIDATED REPORT EXPORTER (SHEETJS)
// ----------------------------------------------------

function exportExcelReport() {
  const rows = computeCapabilityRows();
  
  // Sheet 1: Executive Metrics
  const summary = buildNarrativeSummary(rows);
  const summaryRows = [
    { Metric: "Active Team Members", Value: activeParticipants().length },
    { Metric: "Capabilities Assessed", Value: state.criteria.length },
    { Metric: "Self Assessment Weighting", Value: `${Math.round(state.settings.selfWeight * 100)}%` },
    { Metric: "Manager Assessment Weighting", Value: `${Math.round(state.settings.managerWeight * 100)}%` },
    { Metric: "Average Team Gap", Value: formatSigned(summary.avgGap) },
    { Metric: "Critical Capability Gaps", Value: summary.criticalCount },
    { Metric: "Pillar with Largest Gap", Value: summary.weakestPillar },
    { Metric: "Pillar with Smallest Gap", Value: summary.strongestPillar },
  ];
  
  // Sheet 2: Category Summary
  const pillarRows = Object.entries(groupBy(rows, "pillar")).map(([pillar, items]) => {
    const current = average(items.map((item) => item.current).filter((v) => v !== null));
    const required = average(items.map((item) => item.required));
    return {
      'Strategic Pillar': pillar,
      'Required Avg': round(required),
      'Current Team Avg': round(current),
      'Blended Gap': round(current === null ? null : current - required),
      'Critical Gaps': items.filter((item) => item.risk === "critical").length,
      'Status': current >= required ? 'Adequate' : (current - required <= -1 ? 'Critical Gap' : 'Gap')
    };
  });
  
  // Sheet 3: Capability Details
  const capabilityRows = rows.map((row) => ({
    'Risk Level': row.riskLabel,
    ID: row.id,
    'Strategic Pillar': row.pillar,
    Capability: row.capability,
    'Assessment Question': row.question,
    'Required Level': row.required,
    Weight: row.weight,
    'Team Blended Score': round(row.current),
    'Team Gap': round(row.gap),
    'Gap Type': row.gapType,
    'Source Coverage': row.coverage
  }));
  
  // Sheet 4: Multi-Participant Grid Matrix
  const participantRows = [];
  for (const participant of activeParticipants()) {
    for (const criterion of state.criteria) {
      const combined = combinedScore(participant, criterion.id);
      participantRows.push({
        'Team Member': participant.name,
        ID: criterion.id,
        'Strategic Pillar': criterion.pillar,
        Capability: criterion.capability,
        'Self Score': scoreValue(participant.selfScores, criterion.id) ?? "",
        'Manager Score': scoreValue(participant.managerScores, criterion.id) ?? "",
        'Combined Score': round(combined) ?? "",
        'Required level': criterion.required,
        'Individual Gap': round(combined === null ? null : combined - criterion.required) ?? "",
        'Evidence Comments': participant.evidence?.[criterion.id] || ""
      });
    }
  }

  // Sheet 5: Geographic Capacity Analysis
  const geoRows = [
    { Region: "Europe", 'Mandate Demand': "High (12+ brownfield assessments)", 'Community Burden': "High (35+ sites)", 'Travel Profile': "30-40% frequent travel", 'Proposed Model': "Dedicated Community Manager anchored in EU" },
    { Region: "APAC / Oceania", 'Mandate Demand': "Low (2-3 regional pilots)", 'Community Burden': "Low (10 sites)", 'Travel Profile': "Minimal / local only", 'Proposed Model': "Light centralized standards & self-service model" },
    { Region: "Americas", 'Mandate Demand': "Medium (selective support)", 'Community Burden': "Medium (existing US leads)", 'Travel Profile': "Medium", 'Proposed Model': "Coordinated templates; regional presence handles execution" },
    { Region: "Global", 'Mandate Demand': "High (overall playbooks & libraries)", 'Community Burden': "High", 'Travel Profile': "Selective", 'Proposed Model': "Global Lead defines standards, EU Lead drives local execution" }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Executive Summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(pillarRows), "Category Summary");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(capabilityRows), "Capability Gaps");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(participantRows), "Participant Matrix");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(geoRows), "Geographic Workload");
  
  XLSX.writeFile(workbook, "DPW_Automation_Innovation_Skills_Gap_Consolidated_Master.xlsx");
  showClipboardAlert("Excel Master Report generated successfully!");
}

// ----------------------------------------------------
// EXECUTIVE WORD BRIEFING EXPORTER
// ----------------------------------------------------

function exportWordReport() {
  const rows = computeCapabilityRows();
  const summary = buildNarrativeSummary(rows);
  
  const pillarRows = Object.entries(groupBy(rows, "pillar")).map(([pillar, items]) => {
    const current = average(items.map((item) => item.current).filter((v) => v !== null));
    const required = average(items.map((item) => item.required));
    return { pillar, current, required, gap: current === null ? null : current - required, critical: items.filter((item) => item.risk === "critical").length };
  }).sort((a, b) => a.gap - b.gap);
  
  const criticalRows = rows.filter((row) => row.risk === "critical").sort((a, b) => a.gap - b.gap).slice(0, 15);
  
  // Build details
  const participantSections = activeParticipants().map((p) => {
    const detailRows = state.criteria.map((c) => {
      const combined = combinedScore(p, c.id);
      return `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(c.pillar)}</td><td>${escapeHtml(c.capability)}</td><td style="text-align:center;">${formatNumber(scoreValue(p.selfScores, c.id))}</td><td style="text-align:center;">${formatNumber(scoreValue(p.managerScores, c.id))}</td><td style="text-align:center;">${formatNumber(combined)}</td><td style="text-align:center;">${formatSigned(combined === null ? null : combined - c.required)}</td></tr>`;
    }).join("");
    return `<h2>Team Member Profile: ${escapeHtml(p.name)}</h2><table><thead><tr><th>ID</th><th>Category</th><th>Capability</th><th>Self</th><th>Manager</th><th>Combined</th><th>Gap</th></tr></thead><tbody>${detailRows}</tbody></table>`;
  }).join("");
  
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>DPW Automation Skills Gap Report</title><style>
    body{font-family:Calibri,Arial,sans-serif;color:#1e2933;line-height:1.5} h1{color:#0d9488;border-bottom:2px solid #1e3a8a;padding-bottom:5px;} h2{color:#1e3a8a;margin-top:24px;border-left:4px solid #0d9488;padding-left:10px}
    table{border-collapse:collapse;width:100%;margin:10px 0 20px} th,td{border:1px solid #cfd8e3;padding:6px 8px;font-size:10.5pt;vertical-align:top} th{background:#f8fafc}
    .metric{font-weight:bold}.critical{color:#ef4444;font-weight:bold}.gap{color:#f59e0b;font-weight:bold}
  </style></head><body>
    <h1>DPW Automation & Innovation Skills Gap Executive Briefing</h1>
    <p>This briefing is generated dynamically from the consolidated team analysis. The assessments are weighted at **${Math.round(state.settings.selfWeight * 100)}% Self-Assessment** and **${Math.round(state.settings.managerWeight * 100)}% Manager Evaluation**.</p>
    
    <h2>1. Executive Summary</h2>
    <table><tbody>
      <tr><td class="metric">Active Participants</td><td>${activeParticipants().length}</td></tr>
      <tr><td class="metric">Capabilities Assessed</td><td>${state.criteria.length}</td></tr>
      <tr><td class="metric">Average Team Gap</td><td>${formatSigned(summary.avgGap)}</td></tr>
      <tr><td class="metric">Critical Capability Gaps</td><td>${summary.criticalCount}</td></tr>
      <tr><td class="metric">Pillar with Largest Gap</td><td>${escapeHtml(summary.weakestPillar)}</td></tr>
      <tr><td class="metric">Pillar with Smallest Gap</td><td>${escapeHtml(summary.strongestPillar)}</td></tr>
    </tbody></table>
    
    <h2>2. Pillar Averages & Gaps</h2>
    <table><thead><tr><th>Strategic Pillar</th><th>Required Level</th><th>Team Current</th><th>Blended Gap</th><th>Critical Gaps</th></tr></thead><tbody>
      ${pillarRows.map((row) => `<tr><td>${escapeHtml(row.pillar)}</td><td style="text-align:center;">${formatNumber(row.required)}</td><td style="text-align:center;">${formatNumber(row.current)}</td><td class="${row.gap <= -1 ? "critical" : row.gap < 0 ? "gap" : ""}" style="text-align:center;">${formatSigned(row.gap)}</td><td style="text-align:center;">${row.critical}</td></tr>`).join("")}
    </tbody></table>
    
    <h2>3. Priority Capability Gaps (Targeted for Hire/Training)</h2>
    <table><thead><tr><th>ID</th><th>Category</th><th>Capability</th><th>Required</th><th>Team Current</th><th>Blended Gap</th><th>Coverage Status</th></tr></thead><tbody>
      ${criticalRows.map((row) => `<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.pillar)}</td><td>${escapeHtml(row.capability)}</td><td style="text-align:center;">${formatNumber(row.required)}</td><td style="text-align:center;">${formatNumber(row.current)}</td><td class="critical" style="text-align:center;">${formatSigned(row.gap)}</td><td>${escapeHtml(row.coverage)}</td></tr>`).join("")}
    </tbody></table>

    ${participantSections}
  </body></html>`;
  
  download("DPW_Automation_Skills_Gap_Briefing.doc", new Blob([html], { type: "application/msword;charset=utf-8" }));
}

function buildNarrativeSummary(rows) {
  const pillarRows = Object.entries(groupBy(rows, "pillar")).map(([pillar, items]) => {
    const current = average(items.map((item) => item.current).filter((v) => v !== null));
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
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}
