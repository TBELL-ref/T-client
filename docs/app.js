const state = {
  snapshotGeneratedAt: null,
  snapshotRows: [],
  newCompanyIds: new Set(),
  userOverridesAppliedAt: null,
  rawRows: [],
  rows: [],
  dedupeCandidates: [],
  manualReviewQueue: [],
  failureSummary: {},
  gradeSummary: {},
  activePreset: "",
  activeTab: "in_progress",
  detailRow: null,
  detailEdit: false,
  mergeSourceRow: null,
  filtersOpen: false,
  tableSort: { column: "priorityScore", direction: "desc" },
  leadsPage: 1,
  newPage: 1,
  postsPage: 1,
  excludedPage: 1
};

const PAGE_SIZE = 10;

const PRESETS = [
  { id: "grade-a", label: "A등급", apply: () => setFilters({ grade: "A", exclude: "active" }, { keepPreset: true }) },
  { id: "stage-candidate", label: "후보", apply: () => setFilters({ pipelineStage: "candidate", exclude: "active" }, { keepPreset: true }) },
  { id: "stage-test", label: "테스트 진행", apply: () => setFilters({ pipelineStage: "test_in_progress", exclude: "active" }, { keepPreset: true }) },
  { id: "stage-proposal", label: "제안", apply: () => setFilters({ pipelineStage: "proposal", exclude: "active" }, { keepPreset: true }) },
  { id: "contract-won", label: "계약성공", apply: () => setFilters({ pipelineStatus: "closed", exclude: "active" }, { keepPreset: true }) },
  { id: "contact", label: "담당자 확보", apply: () => setFilters({ contact: "yes", exclude: "active" }, { keepPreset: true }) },
  { id: "startup", label: "스타트업·미확인", apply: () => setFilters({ tier: "startup", exclude: "active" }, { keepPreset: true }) },
  {
    id: "all",
    label: "전체",
    apply: () => setFilters({ grade: "", pipelineStage: "", pipelineStatus: "", contact: "", exclude: "", tier: "" }, { keepPreset: true })
  }
];

const GRADE_COLORS = { A: "#00c471", B: "#3b82f6", C: "#94a3b8" };

const RECOMMEND_DIST_COLORS = ["#cbd5e1", "#94a3b8", "#60a5fa", "#34d399", "#00c471"];
const PILOT_DIST_COLORS = ["#00c471", "#fbbf24", "#f87171"];

const byId = (id) => document.getElementById(id);

function iconSvg(name, size = 14) {
  if (window.TIcons?.svg) return window.TIcons.svg(name, { size });
  return "";
}

function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.dataset.icon;
    if (!name) return;
    let size = 16;
    if (el.classList.contains("search-icon") || el.closest(".btn-toolbar-icon")) size = 18;
    el.innerHTML = iconSvg(name, size);
  });
}

function displayName(row) {
  return row.companyNameKo || row.companyName || "-";
}

function pipelineLabels() {
  return window.TPipeline ?? {};
}

function resolveRowPipeline(row) {
  const P = pipelineLabels();
  const normalized = P.normalizePipelineRecord?.(row) ?? row;
  return {
    pipelineStage: P.resolvePipelineStage?.(normalized.pipelineStage) ?? normalized.pipelineStage ?? "candidate",
    pipelineStatus: P.resolvePipelineStatus?.(normalized.pipelineStatus) ?? normalized.pipelineStatus ?? "pending",
    closedReason: P.resolveClosedReason?.(normalized.closedReason) ?? normalized.closedReason ?? ""
  };
}

function pipelineStageBadge(row) {
  const { pipelineStage } = resolveRowPipeline(row);
  const label = pipelineLabels().pipelineStageLabel?.(pipelineStage) ?? pipelineStage;
  return `<span class="pipeline-badge pipeline-stage pipeline-stage-${pipelineStage}" title="단계: ${escapeAttr(label)}">${escapeHtml(label)}</span>`;
}

function pipelineStatusBadge(row) {
  const { pipelineStatus } = resolveRowPipeline(row);
  const label = pipelineLabels().pipelineStatusLabel?.(pipelineStatus) ?? pipelineStatus;
  return `<span class="pipeline-badge pipeline-status pipeline-status-${pipelineStatus}" title="상태: ${escapeAttr(label)}">${escapeHtml(label)}</span>`;
}

function pipelineCombinedCell(row) {
  return `<div class="pipeline-combined">${pipelineStageBadge(row)}${pipelineStatusBadge(row)}</div>`;
}

function candidateOpinionText(row) {
  const memo = `${row.memo ?? row.salesMemo ?? ""}`.trim();
  if (memo) return memo;
  const pros = `${row.candidatePros ?? ""}`.trim();
  const cons = `${row.candidateCons ?? ""}`.trim();
  const parts = [];
  if (pros) parts.push(pros);
  if (cons) parts.push(cons);
  return parts.length ? parts.join(" · ") : "-";
}

function candidateOpinionHtml(row) {
  const text = candidateOpinionText(row);
  if (!text || text === "-") return '<span class="muted">—</span>';
  return `<div class="cell-opinion">${escapeHtml(text).replace(/\r?\n/g, "<br>")}</div>`;
}

function testPeriodDisplay(row) {
  if (row.testStartedAt || row.testEndedAt) {
    const start = row.testStartedAt ? formatDate(row.testStartedAt) : "—";
    const end = row.testEndedAt ? formatDate(row.testEndedAt) : "—";
    return `${start} ~ ${end}`;
  }
  if (row.testPeriodLabel) return row.testPeriodLabel;
  const p = row.profile ?? {};
  if (p.testPeriod) return `${p.testPeriod}`.trim();
  return "";
}

function testPeriodHtml(row) {
  const start = row.testStartedAt ? formatDate(row.testStartedAt) : "";
  const end = row.testEndedAt ? formatDate(row.testEndedAt) : "";
  if (start || end) {
    return `<div class="test-period-stack">
      <span>${start ? `시작 ${escapeHtml(start)}` : '<span class="muted">시작 —</span>'}</span>
      <span>${end ? `종료 ${escapeHtml(end)}` : '<span class="muted">종료 —</span>'}</span>
    </div>`;
  }
  const label = testPeriodDisplay(row);
  return label ? escapeHtml(label) : "";
}

function pipelineSelectOptions(kind, selected) {
  const P = pipelineLabels();
  const list = kind === "stage" ? P.PIPELINE_STAGES ?? [] : P.PIPELINE_STATUSES ?? [];
  const labels = kind === "stage" ? P.PIPELINE_STAGE_LABEL ?? {} : P.PIPELINE_STATUS_LABEL ?? {};
  return list.map((id) => `<option value="${escapeAttr(id)}"${selected === id ? " selected" : ""}>${escapeHtml(labels[id] ?? id)}</option>`).join("");
}

function renderStarRating(filled, total = 5) {
  const n = Math.max(0, Math.min(total, Number.parseInt(`${filled ?? 0}`, 10) || 0));
  const stars = Array.from({ length: total }, (_, i) =>
    `<span class="star-glyph${i < n ? " filled" : ""}">★</span>`
  ).join("");
  return `<span class="star-rating" aria-label="${n}/${total}">${stars}</span>`;
}

function candidateRepeatLabel(row) {
  if (row.candidateRepeatPosts) return row.candidateRepeatPosts;
  const n = row.posts?.length ?? 0;
  if (n >= 7) return "7회+";
  if (n >= 1) return `${n}회`;
  return "-";
}

function parseRepeatPostCount(row) {
  if (row.candidateRepeatPosts) {
    const raw = String(row.candidateRepeatPosts);
    if (raw.includes("+")) return 999;
    const m = raw.match(/(\d+)/);
    if (m) return Number.parseInt(m[1], 10);
  }
  return row.posts?.length ?? 0;
}

function candidateIndustryLabel(row) {
  if (row.candidateIndustry) return row.candidateIndustry;
  const p = row.profile ?? {};
  return p.bizItem || p.bizType || p.industrySummary?.split("·")[0]?.trim() || "-";
}

function poolClassOf(row) {
  return window.TPipeline?.poolClassOf?.(row) ?? window.TDetailPanel?.poolClassOf?.(row) ?? "normal";
}

function poolClassLabel(cls) {
  return window.TPipeline?.poolClassLabel?.(cls) ?? cls;
}

function poolClassBadge(row) {
  return window.TDetailPanel?.poolClassBadge?.(row) ?? "";
}

function getRecommendedRows() {
  const q = byId("search")?.value.toLowerCase().trim() ?? "";
  return state.rows
    .filter((row) => window.TPipeline?.rowMatchesRecommendedTab?.(row) && isListableLead(row))
    .filter((row) => {
      if (!q) return true;
      const hay = `${displayName(row)} ${candidateIndustryLabel(row)} ${candidateOpinionText(row)}`.toLowerCase();
      return hay.includes(q);
    });
}

function sortRecommendedRows(rows) {
  return [...rows].sort((a, b) => {
    const ra = Number.parseInt(`${a.candidateRank ?? 999}`, 10) || 999;
    const rb = Number.parseInt(`${b.candidateRank ?? 999}`, 10) || 999;
    if (ra !== rb) return ra - rb;
    const sa = Number.parseInt(`${a.recommendScore ?? 0}`, 10) || 0;
    const sb = Number.parseInt(`${b.recommendScore ?? 0}`, 10) || 0;
    if (sa !== sb) return sb - sa;
    return displayName(a).localeCompare(displayName(b), "ko");
  });
}

function manualBadge(row) {
  if (!row.isManual) return "";
  return `<span class="badge badge-manual" title="수동 등록">수동</span>`;
}

function newBadge(row) {
  return window.TDetailPanel?.newBadge?.(row) ?? "";
}

function displayCollectedAt(row) {
  return row.firstCollectedAt || row.lastCollectedAt || "";
}

function tierBadge(row) {
  const label = row.companyTierLabel || "-";
  const tier = row.companyTier || "unknown";
  if (label === "-") return "";
  const hint =
    tier === "enterprise"
      ? "대기업 — 스타트업 타깃 아님"
      : tier === "mid"
        ? "중견 — 우선순위 낮음"
        : tier === "startup"
          ? "스타트업 후보"
          : "규모 미확인";
  return `<span class="tier-badge tier-${tier}" title="${escapeHtml(hint)}">${escapeHtml(label)}</span>`;
}

const PORTAL_HOST_HINT = /jobkorea|saramin|wanted\.co\.kr/i;

function scaleBadge(row) {
  const scale = row.profile?.companyScale;
  if (!scale) return "";
  return `<span class="scale-badge" title="기업규모">${escapeHtml(scale)}</span>`;
}

function bizStatusBadge(row) {
  const status = row.profile?.bizStatus;
  if (!status) return "";
  const closed = /폐업|휴업|말소/.test(status);
  const cls = closed ? "biz-status-closed" : "biz-status-active";
  return `<span class="biz-status-badge ${cls}">${escapeHtml(status.split(/\s+/)[0])}</span>`;
}

function serviceName(row) {
  const p = row.profile ?? {};
  return `${p.serviceName || p.service_name || ""}`.trim();
}

function serviceUrl(row) {
  const p = row.profile ?? {};
  return `${p.serviceUrl || p.service_url || ""}`.trim();
}

function contactEmail(row) {
  const c = row.contact ?? {};
  const email = `${c.email || row.email || ""}`.trim();
  if (email && email.includes("@")) return email;
  const name = `${c.name || ""}`.trim();
  if (name.includes("@")) return name;
  return "";
}

function companySubline(row) {
  const p = row.profile ?? {};
  const parts = [];
  if (p.bizItem) parts.push(p.bizItem);
  else if (p.bizType) parts.push(p.bizType);
  if (row.domainVerified && row.domain) {
    parts.push(row.domain);
  } else if (p.homepage) {
    parts.push(p.homepage.replace(/^https?:\/\//i, ""));
  }
  if (parts.length) return parts.join(" · ");
  const namePart =
    row.companyName && row.companyName !== displayName(row) ? row.companyName : "";
  const raw = `${row.domain ?? ""}`.trim();
  if (raw && PORTAL_HOST_HINT.test(raw)) {
    return namePart ? `${namePart} · 도메인 미확인` : "도메인 미확인 (채용 사이트만 수집)";
  }
  return namePart || "도메인 미확인 · 업종 미수집";
}

function detailTitle(text) {
  return `<h3 class="detail-title">${escapeHtml(text)}</h3>`;
}

function inlineInput(id, value, type = "text", placeholder = "") {
  return `<input type="${type}" id="${id}" class="inline-field" value="${escapeAttr(value ?? "")}" placeholder="${escapeAttr(placeholder)}" />`;
}

function inlineSelect(id, value, options) {
  const current = `${value ?? ""}`;
  const opts = options
    .map(([v, l]) => `<option value="${escapeAttr(v)}"${current === `${v}` ? " selected" : ""}>${escapeHtml(l)}</option>`)
    .join("");
  return `<select id="${id}" class="inline-field inline-select">${opts}</select>`;
}

function scoreSelectValue(value) {
  const n = Number.parseInt(`${value ?? ""}`, 10);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}

function parseStarSelect(raw) {
  const s = `${raw ?? ""}`.trim();
  if (!s) return 0;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function detailCard(title, body, extraClass = "", { icon = "fileText", open = true, flat = false } = {}) {
  if (flat) {
    return `<section class="detail-block detail-block-flat drawer-edit-panel ${extraClass}">
      <h4 class="detail-block-title">${escapeHtml(title)}</h4>
      <div class="detail-block-content">${body}</div>
    </section>`;
  }
  return `<details class="drawer-section ${extraClass}"${open ? " open" : ""}>
    <summary class="drawer-section-head">
      <span class="drawer-section-icon" aria-hidden="true">${iconSvg(icon, 18)}</span>
      <span class="drawer-section-title">${escapeHtml(title)}</span>
      <span class="drawer-section-chevron" aria-hidden="true">+</span>
    </summary>
    <div class="drawer-section-body">${body}</div>
  </details>`;
}

function drawerStatRow(label, value) {
  return `<div class="drawer-stat-row"><span class="drawer-stat-label">${escapeHtml(label)}</span><span class="drawer-stat-value">${value}</span></div>`;
}

function renderDrawerStatsCompact(row) {
  const pool = poolClassOf(row);
  const items = [];
  if (row.priorityScore != null && row.priorityScore !== "") {
    items.push(`<span class="drawer-stat-chip">${escapeHtml(row.priorityScore)}점</span>`);
  }
  if (row.leadGrade) {
    items.push(`<span class="drawer-stat-chip drawer-stat-grade grade-${row.leadGrade}">${row.leadGrade}</span>`);
  }
  items.push(`<span class="drawer-stat-chip">공고 ${row.posts.length}</span>`);
  items.push(`<span class="drawer-stat-chip">담당 ${row.contactSecured === "yes" ? "확보" : "미확보"}</span>`);
  const classLabel = poolClassLabel(pool);
  if (pool === "in_progress") {
    const stage = pipelineLabels().pipelineStageLabel?.(row.pipelineStage) ?? "-";
    items.push(`<span class="drawer-stat-chip">${escapeHtml(classLabel)} · ${escapeHtml(stage)}</span>`);
  } else {
    items.push(`<span class="drawer-stat-chip">${escapeHtml(classLabel)}</span>`);
  }
  return items.join("");
}

function detailMetric(label, value, extraClass = "") {
  return `<div class="detail-metric ${extraClass}">
    <span class="detail-metric-label">${escapeHtml(label)}</span>
    <span class="detail-metric-value">${value}</span>
  </div>`;
}

function renderPipelineSummary(row) {
  return `<div class="pipeline-badges">${pipelineStageBadge(row)}${pipelineStatusBadge(row)}</div>`;
}

function detailKvGrid(rows) {
  return `<dl class="detail-kv">${rows
    .map(([label, value]) => {
      const wide = label === "장점" || label === "단점";
      return `<div class="detail-kv-row${wide ? " is-wide" : ""}"><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`;
    })
    .join("")}</dl>`;
}

function renderProfileSection(row, edit = false, p = {}, domain = "", admin = false) {
  const fields = [
    ["서비스명", "edit-prof-service", p.serviceName || p.service_name],
    ["서비스 주소", "edit-prof-service-url", p.serviceUrl || p.service_url],
    ["도메인", "edit-prof-domain", domain],
    ["법인명", "edit-prof-legal", p.companyNameLegal],
    ["사업자번호", "edit-prof-bizno", p.bizNo],
    ["업태", "edit-prof-type", p.bizType],
    ["종목", "edit-prof-item", p.bizItem],
    ["기업규모", "edit-prof-scale", p.companyScale],
    ["사업자상태", "edit-prof-status", p.bizStatus],
    ["등록일", "edit-prof-founded", p.foundedDate],
    ["종업원", "edit-prof-emp", p.employeeCount],
    ["홈페이지", "edit-prof-home", p.homepage],
    ["산업분류", "edit-prof-industry", p.industrySummary]
  ].filter(([, , v]) => edit || `${v ?? ""}`.trim());

  if (!fields.length && !edit) return `<p class="muted">사업자·업종 정보 없음</p>`;

  if (edit) {
    const enrichBlock = admin
      ? `
      <div class="bizno-fetch-row">
        <div class="inline-row bizno-fetch-line">
          <span class="inline-label">사업자번호</span>
          <div class="bizno-fetch-controls">
            ${inlineInput("edit-prof-bizno", p.bizNo ?? "", "text", "000-00-00000")}
            <button type="button" class="btn-primary btn-sm" id="btn-enrich-bizno">정보 자동 수집</button>
          </div>
        </div>
        <p class="enrich-bizno-status muted" id="enrich-bizno-status">관리자 전용 · 서버(bizno.net)에서 업종·규모·홈페이지를 가져옵니다.</p>
      </div>`
      : "";
    const tableFields = admin ? fields.filter(([, id]) => id !== "edit-prof-bizno") : fields;
    return `${enrichBlock}<div class="detail-form-grid">${tableFields
      .map(([label, id, val]) => {
        const wide = id === "edit-prof-industry" || id === "edit-prof-home" || id === "edit-prof-service-url";
        return `<div class="inline-row${wide ? " span-2" : ""}"><span class="inline-label">${escapeHtml(label)}</span>${inlineInput(id, val, id.includes("home") || id.includes("service-url") ? "url" : "text")}</div>`;
      })
      .join("")}</div>`;
  }

  return `<dl class="detail-kv detail-kv-profile">${fields
    .map(([label, , val]) => {
      const v = `${val ?? ""}`.trim();
      const cell =
        label === "홈페이지" || label === "서비스 주소"
          ? v
            ? `<a class="link" href="${escapeAttr(v)}" target="_blank" rel="noreferrer">${escapeHtml(v)}</a>`
            : "—"
          : escapeHtml(label === "종업원" && v ? `${v}명` : v || "—");
      return `<div class="detail-kv-row"><dt>${escapeHtml(label)}</dt><dd>${cell}</dd></div>`;
    })
    .join("")}</dl>`;
}

function pipelineStageSelect(id, value) {
  const resolved = pipelineLabels().resolvePipelineStage?.(value) ?? value ?? "candidate";
  return `<select id="${escapeAttr(id)}" class="inline-field">${pipelineSelectOptions("stage", resolved)}</select>`;
}

function pipelineStatusSelect(id, value) {
  const resolved = pipelineLabels().resolvePipelineStatus?.(value) ?? value ?? "active";
  return `<select id="${escapeAttr(id)}" class="inline-field">${pipelineSelectOptions("status", resolved)}</select>`;
}

function closedReasonSelect(id, value) {
  const P = pipelineLabels();
  const list = P.CLOSED_REASONS ?? [];
  const labels = P.CLOSED_REASON_LABEL ?? {};
  const resolved = P.resolveClosedReason?.(value) ?? "";
  const opts = [['', '(없음)'], ...list.map((r) => [r, labels[r] ?? r])];
  return `<select id="${escapeAttr(id)}" class="inline-field">${opts
    .map(([v, l]) => `<option value="${escapeAttr(v)}"${resolved === v ? " selected" : ""}>${escapeHtml(l)}</option>`)
    .join("")}</select>`;
}

function renderScoreSection(row, edit, admin = false) {
  const breakdown = row.scoreBreakdown ?? [];
  const recalcBtn = admin
    ? `<p class="score-recalc-row"><button type="button" class="btn-ghost btn-sm" id="btn-recalc-score">점수 재집계</button></p>`
    : "";
  if (!breakdown.length && !row.scoreReason) {
    return `<p class="muted">점수 정보 없음</p>${recalcBtn}`;
  }
  if (edit && breakdown.length) {
    return `<div class="detail-form-grid">${breakdown
      .map((b) => {
        const defaultPts = `${b.pts ?? ""}`.replace(":", "") || "0";
        const val = b.override !== undefined && b.override !== "" ? b.override : "";
        return `<div class="inline-row span-2">
          <span class="inline-label">${escapeHtml(b.label)} <span class="score-pts">${escapeHtml(b.pts || "")}</span></span>
          <input type="number" class="inline-field score-part-input" data-score-part="${escapeAttr(b.part)}" value="${escapeAttr(val)}" placeholder="${escapeAttr(defaultPts)}" />
        </div>`;
      })
      .join("")}
      <div class="inline-row"><span class="inline-label">총점</span>${inlineInput("edit-score-total", row.priorityScore, "number")}</div>
    </div>${recalcBtn}`;
  }
  const lines = breakdown.length
    ? breakdown
        .map(
          (b) =>
            `<li><span class="score-label">${escapeHtml(b.label)}</span> <span class="score-pts">${escapeHtml(b.pts || "")}</span></li>`
        )
        .join("")
    : `<li class="muted">${escapeHtml(row.scoreReason)}</li>`;
  return `<ul class="score-breakdown">${lines}</ul><p class="score-total">합계 <strong>${escapeHtml(row.priorityScore)}</strong>점 · ${escapeHtml(row.leadGrade)}등급</p>${recalcBtn}`;
}

function showToast(message, type = "ok") {
  const root = byId("toastRoot");
  if (!root) return;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast-show"));
  setTimeout(() => {
    el.classList.remove("toast-show");
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

function setDetailLoading(show, text = "처리 중…") {
  const layer = byId("detailLoading");
  const label = byId("detailLoadingText");
  if (!layer) return;
  if (label) label.textContent = text;
  layer.classList.toggle("hidden", !show);
  layer.setAttribute("aria-hidden", show ? "false" : "true");
  byId("detailDrawer")?.classList.toggle("drawer-busy", show);
}

function finishDetailSave(companyId, { toastMessage = "정상 저장되었습니다.", exitEdit = true } = {}) {
  reloadRowsWithAdmin();
  refreshViews();
  const row = state.rows.find((r) => r.companyId === companyId);
  if (!row) return;
  state.detailRow = row;
  if (exitEdit) state.detailEdit = false;
  window.__TCLIENT_DETAIL_ROW = row;
  window.__TCLIENT_DETAIL_EDIT = state.detailEdit;
  paintDetailModal();
  if (toastMessage) showToast(toastMessage);
}

function saveAndRefreshDetail(companyId) {
  finishDetailSave(companyId, { exitEdit: state.detailEdit, toastMessage: "" });
}

function setEnrichBiznoStatus(msg, isError = false) {
  const el = byId("enrich-bizno-status");
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("warn", isError);
}

function fillProfileForm(profile) {
  const map = {
    "edit-prof-legal": profile.companyNameLegal,
    "edit-prof-bizno": profile.bizNo,
    "edit-prof-type": profile.bizType,
    "edit-prof-item": profile.bizItem,
    "edit-prof-scale": profile.companyScale,
    "edit-prof-status": profile.bizStatus,
    "edit-prof-founded": profile.foundedDate,
    "edit-prof-emp": profile.employeeCount,
    "edit-prof-home": profile.homepage,
    "edit-prof-industry": profile.industrySummary,
    "edit-prof-domain": profile.domain
  };
  for (const [id, val] of Object.entries(map)) {
    const el = byId(id);
    if (el && `${val ?? ""}`.trim()) el.value = val;
  }
  if (profile.companyNameLegal) {
    const nameEl = byId("edit-name-ko");
    if (nameEl && !nameEl.value.trim()) nameEl.value = profile.companyNameLegal;
  }
}

async function applyEnrichedProfile(row, profile) {
  fillProfileForm(profile);
  window.TClientAdmin.setEntry(row.companyId, {
    profile,
    domain: profile.domain || undefined
  });
  reloadRowsWithAdmin();
  const updated = state.rows.find((r) => r.companyId === row.companyId) ?? row;
  if (window.TClientAdmin.recalculateCompanyScore) {
    window.TClientAdmin.recalculateCompanyScore(updated);
    reloadRowsWithAdmin();
  }
  refreshViews();
  state.detailRow = state.rows.find((r) => r.companyId === row.companyId) ?? updated;
  paintDetailModal();
  setEnrichBiznoStatus("수집 완료 · DB에 자동 저장됩니다.");
  showToast("회사 정보 수집이 완료되었습니다.");
}

async function waitForServerEnrich(row, bizNo, digits) {
  const started = Date.now();
  const tick = () => {
    const sec = Math.floor((Date.now() - started) / 1000);
    setDetailLoading(true, `서버에서 회사 정보 수집 중… (${sec}초)`);
    setEnrichBiznoStatus(`GitHub Actions가 bizno.net을 조회합니다. (${sec}초 경과)`);
  };

  const prevProfile = window.TClientAdmin.getEntry(row.companyId).profile ?? {};
  window.TClientAdmin.setEntry(row.companyId, {
    profile: { ...prevProfile, bizNo: window.TEnrichBizno.formatBizNo?.(digits) || bizNo }
  });

  await window.TClientAdmin.dispatchEnrichCompany(row.companyId, bizNo);
  tick();
  return window.TClientAdmin.waitForEnrichedProfile(row.companyId, digits, {
    timeoutMs: 90000,
    intervalMs: 3000,
    onTick: tick
  });
}

async function runEnrichBizNo(row) {
  const bizNo = byId("edit-prof-bizno")?.value.trim();
  const btn = byId("btn-enrich-bizno");
  if (!window.TEnrichBizno?.fetchProfileByBizNo) {
    setEnrichBiznoStatus("수집 모듈을 불러오지 못했습니다.", true);
    return;
  }
  const digits = window.TEnrichBizno.normalizeBizNoDigits(bizNo);
  if (!digits) {
    setEnrichBiznoStatus("사업자번호 10자리를 입력하세요.", true);
    return;
  }

  if (!window.TClientAdmin?.isUnlocked?.()) {
    setEnrichBiznoStatus("관리자 로그인 후 사용할 수 있습니다.", true);
    showToast("관리자 로그인 후 다시 시도해 주세요.", "error");
    return;
  }

  if (btn) btn.disabled = true;
  setDetailLoading(true, "회사 정보를 수집하고 있습니다…");

  try {
    setEnrichBiznoStatus("서버에서 bizno.net 조회 중 (GitHub Actions)…");
    const waited = await waitForServerEnrich(row, bizNo, digits);
    if (waited.ok) {
      await applyEnrichedProfile(row, waited.profile);
      return;
    }

    setEnrichBiznoStatus("서버 조회 실패 — 브라우저로 재시도…");
    const browserResult = await window.TEnrichBizno.fetchProfileByBizNo(bizNo, { maxMs: 12000 });
    if (browserResult.ok) {
      await applyEnrichedProfile(row, browserResult.profile);
      return;
    }

    setEnrichBiznoStatus(
      browserResult.message || "bizno.net에서 정보를 찾지 못했습니다. 번호를 확인하세요.",
      true
    );
    showToast("사업자 정보 수집에 실패했습니다.", "error");
  } catch (err) {
    setEnrichBiznoStatus(err.message || "수집 오류", true);
    showToast(err.message || "수집 오류", "error");
  } finally {
    setDetailLoading(false);
    if (btn) btn.disabled = false;
  }
}

async function runRecalcScore(row) {
  if (!window.TClientAdmin?.recalculateCompanyScore) return;
  const btn = byId("btn-recalc-score");
  if (btn) btn.disabled = true;
  setDetailLoading(true, "점수를 재집계합니다…");
  try {
    const fresh = state.rows.find((r) => r.companyId === row.companyId) ?? row;
    const result = window.TClientAdmin.recalculateCompanyScore(fresh);
    finishDetailSave(row.companyId, {
      toastMessage: `점수 재집계 완료 (${result.score}점 · ${result.grade}등급)`,
      exitEdit: false
    });
  } catch (err) {
    showToast(err.message || "재집계 실패", "error");
  } finally {
    setDetailLoading(false);
    if (btn) btn.disabled = false;
  }
}

function bindDetailEdits(row) {
  const cid = row.companyId;

  byId("btn-enrich-bizno")?.addEventListener("click", () => runEnrichBizNo(row));

  byId("detail-save-all")?.addEventListener("click", async () => {
    const parts = {};
    document.querySelectorAll(".score-part-input").forEach((inp) => {
      const v = inp.value.trim();
      if (v !== "") parts[inp.dataset.scorePart] = v;
    });
    const total = byId("edit-score-total")?.value.trim() ?? "";
    if (total !== "") parts._total = total;

    const pool = document.querySelector('input[name="edit-pool-class"]:checked')?.value ?? "normal";
    const prevSm = window.TSalesManagement?.get(cid) ?? {};

    const salesPatch = {
      isHidden: pool === "hidden",
      isRecommended: pool === "recommended",
      isCandidate: false,
      recommendedSince:
        pool === "recommended"
          ? prevSm.recommendedSince || new Date().toISOString()
          : "",
      candidateSince: "",
      pipelineStage: byId("edit-pipeline-stage")?.value ?? "",
      pipelineStatus: byId("edit-pipeline-status")?.value ?? "",
      closedReason: byId("edit-closed-reason")?.value ?? "",
      candidateRank: parseStarSelect(byId("edit-cand-rank")?.value),
      candidateIndustry: byId("edit-cand-industry")?.value.trim(),
      candidateRepeatPosts: byId("edit-cand-repeat")?.value.trim(),
      pilotDifficulty: parseStarSelect(byId("edit-cand-pilot")?.value),
      candidatePros: byId("edit-cand-pros")?.value.trim(),
      candidateCons: byId("edit-cand-cons")?.value.trim(),
      recommendScore: parseStarSelect(byId("edit-cand-score")?.value),
      recommendScoreReason: byId("edit-recommend-reason")?.value.trim(),
      pilotDifficultyReason: byId("edit-pilot-reason")?.value.trim(),
      evaluationNotes: byId("edit-eval-notes")?.value.trim(),
      testStartedAt: byId("edit-test-started")?.value ? `${byId("edit-test-started").value}T00:00:00Z` : "",
      testEndedAt: byId("edit-test-ended")?.value ? `${byId("edit-test-ended").value}T00:00:00Z` : "",
      testPeriodLabel: byId("edit-test-period")?.value.trim(),
      testNotes: byId("edit-test-notes")?.value.trim(),
      memo: byId("edit-notes")?.value.trim()
    };

    const overridePatch = {
      companyNameKo: byId("edit-name-ko")?.value.trim(),
      companyTier: byId("edit-tier")?.value,
      leadGrade: byId("edit-grade")?.value,
      excludeReason: byId("edit-exclude")?.value.trim(),
      contact: {
        name: byId("edit-contact-name")?.value.trim(),
        email: byId("edit-contact-email")?.value.trim(),
        phone: byId("edit-contact-phone")?.value.trim()
      },
      profile: {
        serviceName: byId("edit-prof-service")?.value.trim(),
        serviceUrl: byId("edit-prof-service-url")?.value.trim(),
        companyNameLegal: byId("edit-prof-legal")?.value.trim(),
        bizNo: byId("edit-prof-bizno")?.value.trim(),
        bizType: byId("edit-prof-type")?.value.trim(),
        bizItem: byId("edit-prof-item")?.value.trim(),
        companyScale: byId("edit-prof-scale")?.value.trim(),
        bizStatus: byId("edit-prof-status")?.value.trim(),
        foundedDate: byId("edit-prof-founded")?.value.trim(),
        employeeCount: byId("edit-prof-emp")?.value.trim(),
        homepage: byId("edit-prof-home")?.value.trim(),
        industrySummary: byId("edit-prof-industry")?.value.trim()
      },
      domain: byId("edit-prof-domain")?.value.trim(),
      scoreParts: parts
    };

    const postUrl = byId("edit-post-url")?.value.trim();
    if (postUrl) {
      overridePatch.extraPosts = [
        ...(window.TClientAdmin.getEntry(cid).extraPosts ?? []),
        {
          title: byId("edit-post-title")?.value.trim() || "QA 공고",
          url: postUrl,
          source: "manual",
          sourceLabel: "수동"
        }
      ];
    }

    try {
      if (window.TClientAdmin.isUnlocked()) {
        await window.TSalesManagement.upsert(cid, salesPatch, row);
      }
      window.TClientAdmin.setEntry(cid, overridePatch);
      finishDetailSave(cid, { exitEdit: true, toastMessage: "정상 저장되었습니다." });
    } catch (err) {
      showToast(err.message || "저장 실패", "error");
    }
  });
}

function mergeBaseRows(snapshotRows) {
  const custom = window.TClientAdmin?.getCustomCompanies?.() ?? [];
  const byId = new Map(snapshotRows.map((r) => [r.companyId, r]));
  for (const row of custom) {
    if (!byId.has(row.companyId)) byId.set(row.companyId, row);
  }
  return [...byId.values()];
}

function refreshManualScores(rows) {
  if (!window.TClientAdmin?.recalculateCompanyScore) return rows;
  return rows.map((row) => {
    const isManualRow = row.isManual || window.TClientAdmin.isCustomCompany?.(row.companyId);
    if (!isManualRow || row.scoreReason !== "manual") return row;
    window.TClientAdmin.recalculateCompanyScore(row);
    return window.TClientAdmin.applyToRow(row);
  });
}

function reloadRowsWithAdmin() {
  const deletedFilter = (row) => !window.TClientAdmin?.isCompanyDeleted?.(row.companyId);
  state.rawRows = mergeBaseRows(state.snapshotRows).filter(deletedFilter);
  state.rows = state.rawRows.map((row) => {
    const enriched = enrichRow({
      ...row,
      isNewFromLastCrawl: state.newCompanyIds.has(row.companyId)
    });
    return window.TClientAdmin ? window.TClientAdmin.applyToRow(enriched) : enriched;
  });
  state.rows = refreshManualScores(state.rows);
}

function newManualCompanyId(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `cmp_m_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

function sanitizeDomainInput(value) {
  const raw = `${value ?? ""}`.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  return raw.split("/")[0].split("?")[0] || "";
}

const RECRUITING_PORTAL_HOSTS = new Set([
  "jobkorea.co.kr",
  "jobkorea.com",
  "saramin.co.kr",
  "wanted.co.kr",
  "career.co.kr",
  "job.career.co.kr",
  "programmers.co.kr",
  "jumpit.co.kr",
  "rocketpunch.com",
  "incruit.com",
  "catch.co.kr",
  "theteams.kr",
  "venturesquare.net",
  "inflearn.com",
  "linkedin.com",
  "boards.greenhouse.io"
]);

function isRecruitingPortalHost(host) {
  const h = `${host ?? ""}`.toLowerCase().replace(/^www\./, "");
  if (!h) return false;
  if (RECRUITING_PORTAL_HOSTS.has(h)) return true;
  if (h.endsWith(".greenhouse.io") || h.endsWith(".lever.co") || h.includes("ashbyhq.com")) return true;
  if (h.endsWith(".career.co.kr") || h.endsWith(".jobkorea.co.kr") || h.endsWith(".saramin.co.kr")) return true;
  return false;
}

function normalizePostUrlInput(value) {
  return window.TPostUrl?.normalizeInput(value) ?? `${value ?? ""}`.trim();
}

function postUrlsMatch(a, b) {
  if (window.TPostUrl?.urlsMatch) return window.TPostUrl.urlsMatch(a, b);
  return `${a ?? ""}`.trim().toLowerCase() === `${b ?? ""}`.trim().toLowerCase();
}

function normalizeBizNoDigits(bizNo) {
  return `${bizNo ?? ""}`.replace(/\D/g, "");
}

function normalizeCompanyNameKey(name) {
  return `${name ?? ""}`
    .toLowerCase()
    .replace(/\(주\)|㈜|주식회사|유한회사|\(유\)/g, "")
    .replace(/[^a-z0-9가-힣]/g, "")
    .trim();
}

function domainFromPostUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "");
    if (isRecruitingPortalHost(host)) return "";
    return sanitizeDomainInput(host);
  } catch {
    return "";
  }
}

function profilePatchFromEnrich(p) {
  if (!p) return null;
  return {
    companyNameLegal: p.companyNameLegal ?? "",
    bizNo: p.bizNo ?? "",
    bizType: p.bizType ?? "",
    bizItem: p.bizItem ?? "",
    companyScale: p.companyScale ?? "",
    bizStatus: p.bizStatus ?? "",
    foundedDate: p.foundedDate ?? "",
    employeeCount: p.employeeCount ?? "",
    homepage: p.homepage ?? "",
    industrySummary: p.industrySummary ?? ""
  };
}

function rowBizNoDigits(row) {
  const entry = window.TClientAdmin?.getEntry?.(row.companyId) ?? {};
  return normalizeBizNoDigits(row.profile?.bizNo ?? entry.profile?.bizNo);
}

function findCompanyByBizNo(bizNo) {
  const digits = normalizeBizNoDigits(bizNo);
  if (digits.length !== 10) return null;

  const pools = [
    ...(state.snapshotRows ?? []),
    ...(window.TClientAdmin?.getCustomCompanies?.() ?? []),
    ...state.rows
  ];
  const seen = new Set();
  for (const row of pools) {
    if (!row?.companyId || seen.has(row.companyId)) continue;
    seen.add(row.companyId);
    if (rowBizNoDigits(row) === digits) {
      return state.rows.find((r) => r.companyId === row.companyId) ?? row;
    }
  }
  return null;
}

function findCompanyByLegalName(legalName) {
  const needle = normalizeCompanyNameKey(legalName);
  if (needle.length < 2) return null;

  for (const row of state.snapshotRows ?? []) {
    const names = [row.companyNameKo, row.companyName, row.profile?.companyNameLegal].map(normalizeCompanyNameKey);
    if (names.some((n) => n && (n === needle || (n.length >= 4 && (needle.includes(n) || n.includes(needle)))))) {
      return state.rows.find((r) => r.companyId === row.companyId) ?? row;
    }
  }
  return null;
}

function findCompanyByDomain(domain) {
  const target = sanitizeDomainInput(domain).toLowerCase();
  if (!target || isRecruitingPortalHost(target)) return null;

  for (const row of state.snapshotRows ?? []) {
    const d = `${row.domain ?? ""}`.replace(/^www\./, "").toLowerCase();
    if (d && (d === target || target.endsWith(`.${d}`) || d.endsWith(`.${target}`))) {
      return state.rows.find((r) => r.companyId === row.companyId) ?? row;
    }
  }
  return null;
}

function findCompanyByPostUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (isRecruitingPortalHost(host)) return null;
    return findCompanyByDomain(host);
  } catch {
    return null;
  }
}

function findPostConflict(url) {
  for (const row of state.rows ?? []) {
    for (const post of row.posts ?? []) {
      if (postUrlsMatch(post.url, url)) {
        return { row, post, hidden: false, storedUrl: post.url };
      }
    }
    const entry = window.TClientAdmin?.getEntry?.(row.companyId) ?? {};
    for (const hiddenUrl of entry.hiddenPosts ?? []) {
      if (postUrlsMatch(hiddenUrl, url)) {
        return { row, post: { url: hiddenUrl }, hidden: true, storedUrl: hiddenUrl };
      }
    }
  }

  for (const row of state.snapshotRows ?? []) {
    for (const post of row.posts ?? []) {
      if (postUrlsMatch(post.url, url)) {
        const live = state.rows.find((r) => r.companyId === row.companyId) ?? row;
        return { row: live, post, hidden: false, storedUrl: post.url, source: "snapshot" };
      }
    }
  }

  return null;
}

function postUrlExists(url) {
  return Boolean(findPostConflict(url));
}

function attachBizNoToCompany(companyId, bizNo, enrichProfile = null) {
  const patch = { profile: { ...(enrichProfile ?? {}), bizNo: bizNo || enrichProfile?.bizNo || "" } };
  window.TClientAdmin.setEntry(companyId, patch);
  if (enrichProfile?.companyNameLegal) {
    window.TClientAdmin.setEntry(companyId, { companyNameKo: enrichProfile.companyNameLegal });
  }
  if (enrichProfile?.domain) {
    window.TClientAdmin.setEntry(companyId, { domain: enrichProfile.domain });
  }
}

async function lookupEnrichProfile(bizNo) {
  if (!bizNo || !window.TEnrichBizno?.fetchProfileByBizNo) return null;
  const digits = normalizeBizNoDigits(bizNo);
  if (digits.length !== 10) return null;
  try {
    const result = await window.TEnrichBizno.fetchProfileByBizNo(bizNo);
    return result.ok ? result.profile : null;
  } catch {
    return null;
  }
}

async function resolveCompanyForManualPost(url, bizNo) {
  const matchedByBiz = findCompanyByBizNo(bizNo);
  if (matchedByBiz) return { row: matchedByBiz, created: false, enrichProfile: null };

  const enrichProfile = bizNo ? await lookupEnrichProfile(bizNo) : null;
  if (enrichProfile) {
    const byEnrichedBiz = findCompanyByBizNo(enrichProfile.bizNo);
    if (byEnrichedBiz) return { row: byEnrichedBiz, created: false, enrichProfile };

    const byName = findCompanyByLegalName(enrichProfile.companyNameLegal);
    if (byName) {
      attachBizNoToCompany(byName.companyId, enrichProfile.bizNo || bizNo, profilePatchFromEnrich(enrichProfile));
      return { row: state.rows.find((r) => r.companyId === byName.companyId) ?? byName, created: false, enrichProfile };
    }

    if (enrichProfile.domain) {
      const byDomain = findCompanyByDomain(enrichProfile.domain);
      if (byDomain) {
        attachBizNoToCompany(byDomain.companyId, enrichProfile.bizNo || bizNo, profilePatchFromEnrich(enrichProfile));
        return { row: state.rows.find((r) => r.companyId === byDomain.companyId) ?? byDomain, created: false, enrichProfile };
      }
    }
  }

  const matchedByDomain = findCompanyByPostUrl(url);
  if (matchedByDomain) {
    if (bizNo || enrichProfile?.bizNo) {
      attachBizNoToCompany(
        matchedByDomain.companyId,
        enrichProfile?.bizNo || bizNo,
        enrichProfile ? profilePatchFromEnrich(enrichProfile) : { bizNo }
      );
    }
    return { row: matchedByDomain, created: false, enrichProfile };
  }

  const profile = profilePatchFromEnrich(enrichProfile);
  const companyNameKo = enrichProfile?.companyNameLegal?.trim() || "수동 등록 회사";
  const domain = enrichProfile?.domain || domainFromPostUrl(url);
  const row = buildManualCompanyRow({
    companyNameKo,
    domain,
    bizNo: enrichProfile?.bizNo || bizNo || "",
    profile
  });
  if (!window.TClientAdmin.addCustomCompany(row)) return { row: null, created: false, enrichProfile };
  try {
    await window.TCompanies.upsertManual(row);
  } catch (err) {
    window.TClientAdmin.removeCustomCompany(row.companyId);
    throw err;
  }
  return { row, created: true, enrichProfile };
}

function buildManualCompanyRow({ companyNameKo, domain = "", bizNo = "", profile = null }) {
  const name = `${companyNameKo ?? ""}`.trim();
  const domainClean = sanitizeDomainInput(domain);
  const now = new Date().toISOString();
  const companyId = newManualCompanyId(`${name}|${domainClean}|${now}`);

  return {
    companyId,
    companyName: name,
    companyNameKo: name,
    companyTier: "unknown",
    companyTierLabel: "-",
    domain: domainClean,
    domainVerified: Boolean(domainClean),
    profile: profile ?? (bizNo ? { bizNo: `${bizNo}`.trim() } : {}),
    profileComplete: Boolean(profile?.bizItem || profile?.bizNo || profile?.homepage || bizNo),
    lastCollectedAt: now,
    leadGrade: "C",
    priorityScore: "0",
    scoreReason: "manual",
    salesStage: "new",
    contactSecured: "no",
    pipelineStage: "candidate",
    pipelineStatus: "pending",
    pipelineStageAt: "",
    email: "",
    emailConfidence: "low",
    excludeReason: "",
    manualOverrideLocked: false,
    manualNotes: "",
    excluded: false,
    isManual: true,
    posts: []
  };
}

function enrichRow(row) {
  const pipeline = resolveRowPipeline(row);
  return { ...row, ...pipeline };
}

function rowTierClass(row) {
  if (row.companyTier === "enterprise") return " row-tier-enterprise";
  if (row.companyTier === "mid") return " row-tier-mid";
  return "";
}

function contactDisplay(row) {
  const c = row.contact ?? {};
  if (c.name) return escapeHtml(c.name);
  if (row.contactSecured === "yes") return "확보";
  return "미확보";
}

function companyNameById(id) {
  const row = state.rows.find((r) => r.companyId === id);
  return row ? displayName(row) : id;
}

function priorityValue(row) {
  return Number.parseInt(`${row.priorityScore ?? 0}`, 10) || 0;
}

function hasFailedPosts(row) {
  return row.posts.some((p) => p.failureReason);
}

function setFilters(values, { keepPreset = false } = {}) {
  Object.entries(values).forEach(([key, value]) => {
    const el = byId(key);
    if (el) el.value = value;
  });
  if (!keepPreset) state.activePreset = "";
  state.leadsPage = 1;
  state.postsPage = 1;
  state.excludedPage = 1;
  syncCustomSelects();
  refreshViews();
}

function syncCustomSelects() {
  document.querySelectorAll(".cselect select.select-pill").forEach((sel) => {
    const wrap = sel.parentElement;
    const trigger = wrap?.querySelector(".cselect-trigger");
    const opt = sel.options[sel.selectedIndex];
    if (trigger && opt) trigger.textContent = opt.textContent.trim();
    wrap?.querySelectorAll(".cselect-opt").forEach((li) => {
      const on = li.dataset.value === sel.value;
      li.classList.toggle("active", on);
      li.setAttribute("aria-selected", on ? "true" : "false");
    });
  });
}

function toggleFilterAdvanced(force) {
  const panel = byId("filterAdvanced");
  const btn = byId("filterToggleBtn");
  if (!panel) return;
  const open = force !== undefined ? force : panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !open);
  btn?.classList.toggle("active", open);
  btn?.setAttribute("aria-expanded", open ? "true" : "false");
  state.filtersOpen = open;
}

function resetFilters() {
  byId("search").value = "";
  ["grade", "pipelineStage", "pipelineStatus", "contact", "exclude", "tier"].forEach((id) => {
    const el = byId(id);
    if (el) el.value = "";
  });
  const sortEl = byId("sort");
  if (sortEl) sortEl.value = "priority";
  state.activePreset = "";
  state.leadsPage = 1;
  state.postsPage = 1;
  state.excludedPage = 1;
  syncCustomSelects();
  renderPresets();
  refreshViews();
}

/** 제외 탭 전용: 숨김 분류 또는 제외 사유 */
function isShelvedLead(row) {
  if (!row) return false;
  if (row.userHidden || row.isHidden) return true;
  if (poolClassOf(row) === "hidden") return true;
  if (row.excluded) return true;
  return false;
}

/** 공고 없어도 Notion·수동·sales_management 회사는 목록에 표시 */
function rowHasListablePresence(row) {
  if (!row) return false;
  if ((row.posts?.length ?? 0) > 0) return true;
  if (row.isManual) return true;
  if (row.hasSalesManagement) return true;
  if (`${row.dedupeGroupKey ?? ""}`.startsWith("notion:")) return true;
  return false;
}

/** 목록·집계 공통: 숨김(병합) 제외 + 표시 가능 회사 */
function isListableLead(row) {
  if (row.userHidden) return false;
  return rowHasListablePresence(row);
}

/** 진행·추천·신규·회사 탭: 제외/숨김 제외 */
function isMainTabLead(row) {
  return isListableLead(row) && !isShelvedLead(row);
}

function excludedTabRows() {
  return state.rows.filter(isShelvedLead);
}

/** KPI·배너·등급 분포: 활성(제외 아님) 리드만 */
function isActiveLead(row) {
  return isListableLead(row) && !row.excluded;
}

function listableLeadRows() {
  return state.rows.filter(isListableLead);
}

function activeLeadRows() {
  return state.rows.filter(isActiveLead);
}

function paginate(items, page) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  return {
    items: items.slice(start, start + PAGE_SIZE),
    page: safePage,
    totalPages,
    total
  };
}

function buildPageList(current, total) {
  const items = [];
  const window = 1;
  const addPage = (p) => {
    if (p < 1 || p > total) return;
    items.push({ type: "page", value: p, active: p === current });
  };

  if (total <= 7) {
    for (let i = 1; i <= total; i++) addPage(i);
    return items;
  }

  addPage(1);
  if (current > window + 2) items.push({ type: "ellipsis" });
  for (let p = Math.max(2, current - window); p <= Math.min(total - 1, current + window); p++) {
    addPage(p);
  }
  if (current < total - window - 1) items.push({ type: "ellipsis" });
  addPage(total);
  return items;
}

function renderPagerHtml(page, totalPages, total, unit = "건", pagerKey = "main") {
  if (totalPages <= 1) {
    if (total <= PAGE_SIZE) return "";
    return `
      <nav class="table-pager table-pager--compact" aria-label="페이지">
        <span class="pager-summary">총 <strong>${total}</strong>${unit}</span>
      </nav>`;
  }

  const pageItems = buildPageList(page, totalPages);
  const pageBtns = pageItems
    .map((item) => {
      if (item.type === "ellipsis") return `<span class="pager-ellipsis" aria-hidden="true">…</span>`;
      return `<button type="button" class="pager-num${item.active ? " active" : ""}" data-page="${item.value}"${item.active ? ' aria-current="page"' : ""}>${item.value}</button>`;
    })
    .join("");

  return `
    <nav class="table-pager" aria-label="페이지" data-pager="${escapeAttr(pagerKey)}">
      <div class="pager-summary">
        총 <strong>${total}</strong>${unit} ·
        <input
          id="pager-input-${escapeAttr(pagerKey)}"
          class="pager-input-inline"
          type="number"
          min="1"
          max="${totalPages}"
          value="${page}"
          inputmode="numeric"
          aria-label="현재 페이지 (Enter로 이동)"
        />
        / ${totalPages}페이지
      </div>
      <div class="pager-controls">
        <button type="button" class="pager-btn pager-btn-icon" data-page="1" ${page <= 1 ? "disabled" : ""} title="처음" aria-label="처음 페이지">
          <span aria-hidden="true">«</span>
        </button>
        <button type="button" class="pager-btn pager-btn-icon pager-btn-prev" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""} title="이전" aria-label="이전 페이지">
          ${iconSvg("chevron", 14)}
        </button>
        <div class="pager-nums" role="group" aria-label="페이지 번호">${pageBtns}</div>
        <button type="button" class="pager-btn pager-btn-icon pager-btn-next" data-page="${page + 1}" ${page >= totalPages ? "disabled" : ""} title="다음" aria-label="다음 페이지">
          ${iconSvg("chevron", 14)}
        </button>
        <button type="button" class="pager-btn pager-btn-icon" data-page="${totalPages}" ${page >= totalPages ? "disabled" : ""} title="마지막" aria-label="마지막 페이지">
          <span aria-hidden="true">»</span>
        </button>
      </div>
    </nav>`;
}

function bindPager(root, { page, totalPages, onPage, pagerKey = "main" }) {
  if (!root) return;
  const nav = root.querySelector(`[data-pager="${pagerKey}"]`) || root.querySelector(".table-pager");
  if (!nav) return;

  const go = (next) => {
    const n = Number.parseInt(`${next ?? ""}`, 10);
    if (!Number.isFinite(n) || n < 1 || n > totalPages || n === page) return;
    onPage(n);
  };

  nav.querySelectorAll(".pager-btn[data-page], .pager-num[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => go(btn.dataset.page));
  });

  const input = nav.querySelector(".pager-input-inline");
  input?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    go(input.value);
  });
  input?.addEventListener("blur", () => {
    const n = Number.parseInt(`${input.value ?? ""}`, 10);
    if (Number.isFinite(n)) {
      input.value = String(Math.min(Math.max(1, n), totalPages));
    } else {
      input.value = String(page);
    }
  });
}

function computePipelineKpi(rows) {
  const stages = window.TPipeline?.PIPELINE_STAGES ?? [
    "candidate",
    "test_in_progress",
    "delivery",
    "proposal",
    "meeting",
    "contract"
  ];
  const counts = Object.fromEntries(stages.map((s) => [s, 0]));
  for (const r of rows) {
    const { pipelineStage } = resolveRowPipeline(r);
    const stage = pipelineLabels().resolvePipelineStage?.(pipelineStage) ?? pipelineStage;
    if (counts[stage] !== undefined) counts[stage] += 1;
  }
  return counts;
}

const PORTFOLIO_QUADRANTS = [
  {
    id: "priority",
    label: "최우선 공략",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#86efac",
    tone: "emphasis-1"
  },
  {
    id: "strategic",
    label: "전략 공략",
    color: "#2563eb",
    bg: "#eff6ff",
    border: "#93c5fd",
    tone: "emphasis-2"
  },
  {
    id: "quick",
    label: "빠른 접근",
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fcd34d",
    tone: "emphasis-3"
  },
  {
    id: "low",
    label: "후순위",
    color: "#94a3b8",
    bg: "#f1f5f9",
    border: "#cbd5e1",
    tone: "muted"
  }
];

const PORTFOLIO_SCORE_HIGH_MIN = 4;
const PORTFOLIO_EASE_HIGH_MIN = 4;

const SALES_BUCKET_LABELS = {
  recommended: "추천",
  confirmed: "확정",
  inProgress: "진행중",
  candidatePool: "후보",
  excluded: "제외"
};

/** 공략 용이성 1~5 (6 - 파일럿 난이도). 오른쪽일수록 쉬움. */
function parseApproachEase(row) {
  const pilot = parsePilotDifficulty(row);
  if (!pilot) return 0;
  return 6 - pilot;
}

function portfolioQuadrant(row) {
  const score = parseRecommendScore(row);
  const ease = parseApproachEase(row);
  if (!score || !ease) return null;
  const highScore = score >= PORTFOLIO_SCORE_HIGH_MIN;
  const highEase = ease >= PORTFOLIO_EASE_HIGH_MIN;
  if (highScore && highEase) return "priority";
  if (highScore && !highEase) return "strategic";
  if (!highScore && highEase) return "quick";
  return "low";
}

function portfolioQuadrantMeta(id) {
  return PORTFOLIO_QUADRANTS.find((q) => q.id === id) ?? PORTFOLIO_QUADRANTS[0];
}

function companySalesBucket(row) {
  if (row.excluded || row.userHidden) return { key: "excluded", label: "제외" };
  const pool = poolClassOf(row);
  if (pool === "recommended") return { key: "recommended", label: "추천" };
  if (pool === "in_progress") return { key: "inProgress", label: "진행" };
  if (pipelineLabels().rowMatchesCandidatePool?.(row) ?? pool === "normal") {
    return { key: "candidatePool", label: "후보" };
  }
  return { key: "normal", label: "후보" };
}

function clusterPortfolioRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const score = parseRecommendScore(row);
    const ease = parseApproachEase(row);
    const key = `${score}:${ease}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()]
    .map(([key, list]) => {
      const [score, ease] = key.split(":").map(Number);
      return {
        key,
        score,
        ease,
        pilot: parsePilotDifficulty(list[0]),
        rows: list,
        quadrant: portfolioQuadrant(list[0])
      };
    })
    .filter((c) => c.quadrant);
}

function getTopTargetRows(rows, limit = 5) {
  return [...rows]
    .sort((a, b) => {
      const ds = parseRecommendScore(b) - parseRecommendScore(a);
      if (ds !== 0) return ds;
      const de = parseApproachEase(b) - parseApproachEase(a);
      if (de !== 0) return de;
      return parseRepeatPostCount(b) - parseRepeatPostCount(a);
    })
    .slice(0, limit);
}

function portfolioClusterKey(row) {
  return `${parseRecommendScore(row)}:${parseApproachEase(row)}`;
}

function topTargetStageLabel(row) {
  return companySalesBucket(row).label;
}

let portfolioPopoverHideTimer = null;

function hidePortfolioPopover() {
  clearTimeout(portfolioPopoverHideTimer);
  portfolioPopoverHideTimer = null;
  const tip = byId("portfolioTooltip");
  if (!tip) return;
  tip.classList.add("hidden");
  tip.classList.remove("is-pinned");
  tip.innerHTML = "";
  document.removeEventListener("click", onPortfolioPopoverOutside, true);
}

function onPortfolioPopoverOutside(ev) {
  const tip = byId("portfolioTooltip");
  if (!tip || tip.classList.contains("hidden")) return;
  if (tip.contains(ev.target) || ev.target.closest(".portfolio-cluster")) return;
  hidePortfolioPopover();
}

function positionPortfolioPopover(tip, clientX, clientY) {
  const margin = 12;
  let left = clientX + margin;
  let top = clientY + margin;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  requestAnimationFrame(() => {
    const rect = tip.getBoundingClientRect();
    left = clientX + margin;
    top = clientY + margin;
    if (left + rect.width > window.innerWidth - margin) left = clientX - rect.width - margin;
    if (top + rect.height > window.innerHeight - margin) top = clientY - rect.height - margin;
    tip.style.left = `${Math.max(margin, left)}px`;
    tip.style.top = `${Math.max(margin, top)}px`;
  });
}

function bindPortfolioPopoverItems(tip) {
  tip.querySelectorAll(".portfolio-popover-item").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const row = state.rows.find((r) => r.companyId === btn.dataset.company);
      hidePortfolioPopover();
      if (row) openDetail(row);
    });
  });
}

function renderPortfolioClusterPopover(cluster) {
  const meta = portfolioQuadrantMeta(cluster.quadrant);
  const sorted = getTopTargetRows(cluster.rows, cluster.rows.length);
  const list = sorted
    .map(
      (row) => `<li>
        <button type="button" class="portfolio-popover-item" data-company="${escapeAttr(row.companyId)}">
          <strong>${escapeHtml(displayName(row))}</strong>
          <span class="portfolio-popover-item-meta muted">추천 ${starGlyphs(parseRecommendScore(row), 5)} · ${escapeHtml(topTargetStageLabel(row))}</span>
        </button>
      </li>`
    )
    .join("");

  return `<div class="portfolio-popover">
    <div class="portfolio-popover-head">
      <span class="portfolio-popover-zone">${escapeHtml(meta.label)}</span>
      <span class="portfolio-popover-meta muted">${cluster.rows.length}개 · 용이 ${starGlyphs(cluster.ease, 5)}</span>
    </div>
    <ul class="portfolio-popover-list">${list}</ul>
    <p class="portfolio-popover-hint muted">클릭하면 상세로 이동</p>
  </div>`;
}

function showPortfolioPopover(cluster, clientX, clientY, { pinned = false } = {}) {
  clearTimeout(portfolioPopoverHideTimer);
  const tip = byId("portfolioTooltip");
  if (!tip) return;
  tip.innerHTML = renderPortfolioClusterPopover(cluster);
  tip.classList.remove("hidden");
  tip.classList.toggle("is-pinned", pinned);
  positionPortfolioPopover(tip, clientX, clientY);
  bindPortfolioPopoverItems(tip);

  tip.onmouseenter = () => clearTimeout(portfolioPopoverHideTimer);
  tip.onmouseleave = () => {
    if (tip.classList.contains("is-pinned")) return;
    portfolioPopoverHideTimer = setTimeout(hidePortfolioPopover, 120);
  };

  if (pinned) {
    document.removeEventListener("click", onPortfolioPopoverOutside, true);
    setTimeout(() => document.addEventListener("click", onPortfolioPopoverOutside, true), 0);
  } else {
    document.removeEventListener("click", onPortfolioPopoverOutside, true);
  }
}

function renderPortfolioMap() {
  const eligibleRows = activeLeadRows().filter((row) => portfolioQuadrant(row));
  const clusters = clusterPortfolioRows(eligibleRows);

  const W = 720;
  const H = 360;
  const pad = { l: 56, r: 16, t: 14, b: 44 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const xFor = (ease) => pad.l + ((Math.max(1, Math.min(5, ease)) - 1) / 4) * innerW;
  const yFor = (score) => pad.t + innerH - ((Math.max(1, Math.min(5, score)) - 1) / 4) * innerH;
  const xSplit = xFor(3.5);
  const ySplit = yFor(3.5);

  const quadrantRect = (q) => {
    if (q.id === "strategic") {
      return { x: pad.l, y: pad.t, w: xSplit - pad.l, h: ySplit - pad.t };
    }
    if (q.id === "priority") {
      return { x: xSplit, y: pad.t, w: pad.l + innerW - xSplit, h: ySplit - pad.t };
    }
    if (q.id === "low") {
      return { x: pad.l, y: ySplit, w: xSplit - pad.l, h: pad.t + innerH - ySplit };
    }
    return { x: xSplit, y: ySplit, w: pad.l + innerW - xSplit, h: pad.t + innerH - ySplit };
  };

  const quadrantsSvg = PORTFOLIO_QUADRANTS.map((q) => {
    const { x, y, w, h } = quadrantRect(q);
    const labelClass = q.id === "priority" ? " portfolio-quadrant-label-priority" : "";
    const strokeW = q.id === "priority" ? 2 : 1;
    return `<g class="portfolio-quadrant portfolio-quadrant-${q.id}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${q.bg}" stroke="${q.border}" stroke-width="${strokeW}" rx="6"/>
      <text x="${x + w / 2}" y="${y + 16}" text-anchor="middle" class="portfolio-quadrant-label${labelClass}">${escapeHtml(q.label)}</text>
    </g>`;
  }).join("");

  const splitLines = `<line x1="${xSplit}" y1="${pad.t}" x2="${xSplit}" y2="${pad.t + innerH}" class="portfolio-grid-line"/>
    <line x1="${pad.l}" y1="${ySplit}" x2="${pad.l + innerW}" y2="${ySplit}" class="portfolio-grid-line"/>`;

  const points = clusters
    .map((cluster) => {
      const meta = portfolioQuadrantMeta(cluster.quadrant);
      const cx = xFor(cluster.ease);
      const cy = yFor(cluster.score);
      const n = cluster.rows.length;
      const r = n > 1 ? 12 + Math.min(n, 4) : 8;
      const companyIds = cluster.rows.map((row) => row.companyId).join(",");
      return `<g class="portfolio-cluster" data-cluster-key="${escapeAttr(cluster.key)}" data-companies="${escapeAttr(companyIds)}" data-quadrant="${cluster.quadrant}" tabindex="0" role="button" aria-label="${escapeAttr(displayName(cluster.rows[0]))}${n > 1 ? ` 외 ${n - 1}곳` : ""}">
        <circle class="portfolio-cluster-bg" cx="${cx}" cy="${cy}" r="${r + 3}" fill="${meta.color}" opacity="0.2"/>
        <circle class="portfolio-cluster-ring" cx="${cx}" cy="${cy}" r="${r + 6}" fill="none" stroke="${meta.color}" stroke-width="2" opacity="0"/>
        <circle class="portfolio-cluster-dot" cx="${cx}" cy="${cy}" r="${r}" fill="${meta.color}" stroke="#fff" stroke-width="2"/>
        ${n > 1 ? `<text x="${cx}" y="${cy + 1}" text-anchor="middle" class="portfolio-cluster-count">${n}개</text>` : ""}
      </g>`;
    })
    .join("");

  const chartBody =
    eligibleRows.length > 0
      ? `<div class="portfolio-chart-col">
        <div class="portfolio-svg-wrap">
          <svg class="portfolio-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="공략 우선순위 매트릭스">
            ${quadrantsSvg}
            ${splitLines}
            <rect x="${pad.l}" y="${pad.t}" width="${innerW}" height="${innerH}" fill="none" stroke="#cbd5e1" stroke-width="1.5" rx="8"/>
            ${[1, 2, 3, 4, 5].map((n) => `<text x="${xFor(n)}" y="${H - 26}" text-anchor="middle" class="portfolio-axis-tick">${n}</text>`).join("")}
            ${[1, 2, 3, 4, 5].map((n) => `<text x="${pad.l - 10}" y="${yFor(n) + 4}" text-anchor="end" class="portfolio-axis-tick">${n}</text>`).join("")}
            ${points}
          </svg>
          <div id="portfolioTooltip" class="portfolio-tooltip-host hidden"></div>
        </div>
        <p class="portfolio-axis-caption portfolio-axis-caption-x">공략 용이성 <span class="muted">(오른쪽으로 갈수록 파일럿 진입 쉬움)</span></p>
        <p class="portfolio-axis-caption portfolio-axis-caption-y">추천 점수 <span class="muted">(위로 갈수록 추천도 높음)</span></p>
      </div>`
      : `<p class="muted dash-empty-hint">표시할 평가 데이터가 없습니다.<br />상세 → 수정에서 추천 점수·파일럿 난이도를 입력하세요.</p>`;

  return `<div class="portfolio-map-wrap">${chartBody}</div>`;
}

function bindPortfolioMap() {
  const host = byId("dashboard");
  if (!host) return;

  hidePortfolioPopover();

  host.querySelectorAll(".portfolio-cluster").forEach((g) => {
    const ids = `${g.dataset.companies ?? ""}`.split(",").filter(Boolean);
    const rows = ids.map((id) => state.rows.find((r) => r.companyId === id)).filter(Boolean);
    if (!rows.length) return;
    const cluster = {
      key: g.dataset.clusterKey ?? `${parseRecommendScore(rows[0])}:${parseApproachEase(rows[0])}`,
      score: parseRecommendScore(rows[0]),
      ease: parseApproachEase(rows[0]),
      pilot: parsePilotDifficulty(rows[0]),
      rows,
      quadrant: portfolioQuadrant(rows[0])
    };

    g.addEventListener("mouseenter", (ev) => {
      showPortfolioPopover(cluster, ev.clientX, ev.clientY);
    });
    g.addEventListener("mousemove", (ev) => {
      const tip = byId("portfolioTooltip");
      if (!tip || tip.classList.contains("hidden") || tip.classList.contains("is-pinned")) return;
      positionPortfolioPopover(tip, ev.clientX, ev.clientY);
    });
    g.addEventListener("mouseleave", () => {
      const tip = byId("portfolioTooltip");
      if (tip?.classList.contains("is-pinned")) return;
      portfolioPopoverHideTimer = setTimeout(hidePortfolioPopover, 120);
    });

    g.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (cluster.rows.length === 1) {
        hidePortfolioPopover();
        openDetail(cluster.rows[0]);
        return;
      }
      showPortfolioPopover(cluster, ev.clientX, ev.clientY, { pinned: true });
    });
  });
}

function highlightActionKpiCards() {
  /* portfolio matrix uses bottom quadrant KPI highlight via is-highlight class in render */
}

function passesFilters(row) {
  const q = byId("search").value.toLowerCase().trim();
  const grade = byId("grade").value;
  const stageFilter = byId("pipelineStage")?.value ?? "";
  const statusFilter = byId("pipelineStatus")?.value ?? "";
  const contact = byId("contact").value;
  const exclude = byId("exclude").value;
  const { pipelineStage, pipelineStatus } = resolveRowPipeline(row);

  const haystack = `${displayName(row)} ${row.companyName} ${row.domain} ${row.profile?.bizItem ?? ""} ${row.profile?.bizType ?? ""} ${row.profile?.companyScale ?? ""}`.toLowerCase();
  if (q && !haystack.includes(q)) return false;
  if (grade && row.leadGrade !== grade) return false;
  if (stageFilter && pipelineStage !== stageFilter) return false;
  if (statusFilter && pipelineStatus !== statusFilter) return false;
  if (contact && row.contactSecured !== contact) return false;
  if (exclude === "active" && row.excluded) return false;
  if (exclude === "excluded" && !row.excluded) return false;
  const tierFilter = byId("tier")?.value;
  if (tierFilter === "startup" && !["startup", "unknown"].includes(row.companyTier)) return false;
  if (tierFilter === "enterprise" && row.companyTier !== "enterprise") return false;
  if (tierFilter === "mid" && row.companyTier !== "mid") return false;
  if (state.activeTab === "excluded") {
    if (!isShelvedLead(row)) return false;
  } else if (!isMainTabLead(row)) {
    return false;
  }
  return true;
}

function rowIsNew(row) {
  const pool = poolClassOf(row);
  return pool !== "recommended" && pool !== "in_progress" && pool !== "hidden";
}

function sortRows(rows) {
  const mode = byId("sort")?.value || "priority";
  const list = [...rows];

  list.sort((a, b) => {
    if (mode === "priority") {
      const sa = pipelineLabels().stageOrder?.(a.pipelineStage) ?? 0;
      const sb = pipelineLabels().stageOrder?.(b.pipelineStage) ?? 0;
      if (sa !== sb) return sb - sa;
      if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
      const byScore = priorityValue(b) - priorityValue(a);
      if (byScore !== 0) return byScore;
      return displayName(a).localeCompare(displayName(b), "ko");
    }

    if (mode === "recent") {
      const byRecent = new Date(displayCollectedAt(b) || 0) - new Date(displayCollectedAt(a) || 0);
      if (byRecent !== 0) return byRecent;
      return displayName(a).localeCompare(displayName(b), "ko");
    }

    if (mode === "new") {
      const aNew = rowIsNew(a) ? 1 : 0;
      const bNew = rowIsNew(b) ? 1 : 0;
      if (aNew !== bNew) return bNew - aNew;
      const byFirst = new Date(displayCollectedAt(b) || 0) - new Date(displayCollectedAt(a) || 0);
      if (byFirst !== 0) return byFirst;
      return displayName(a).localeCompare(displayName(b), "ko");
    }

    if (mode === "grade") {
      const gradeOrder = { A: 3, B: 2, C: 1 };
      const diff = (gradeOrder[b.leadGrade] ?? 0) - (gradeOrder[a.leadGrade] ?? 0);
      if (diff !== 0) return diff;
      return priorityValue(b) - priorityValue(a);
    }

    if (mode === "name") {
      return displayName(a).localeCompare(displayName(b), "ko");
    }

    return priorityValue(b) - priorityValue(a);
  });
  return list;
}

function starGlyphs(filled, total = 5) {
  const n = Math.max(0, Math.min(total, filled));
  return `${"★".repeat(n)}${"☆".repeat(total - n)}`;
}

function qualityPoolRows() {
  const recommended = state.rows.filter((r) => r.isRecommended && !r.userHidden && !r.excluded);
  return recommended.length ? recommended : activeLeadRows();
}

function parseRecommendScore(row) {
  const n = Number.parseInt(`${row.recommendScore ?? 0}`, 10);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 0;
}

function parsePilotDifficulty(row) {
  const n = Number.parseInt(`${row.pilotDifficulty ?? 0}`, 10);
  return Number.isFinite(n) && n >= 1 && n <= 3 ? n : 0;
}

function computeDistribution(rows, parser, maxLevel) {
  const counts = Array.from({ length: maxLevel }, () => 0);
  let scored = 0;
  for (const row of rows) {
    const v = parser(row);
    if (!v) continue;
    counts[v - 1] += 1;
    scored += 1;
  }
  return { counts, scored, total: rows.length };
}

function renderDistributionDonut({ counts, scored, colors, maxLevel, centerLabel, legendLabelFn }) {
  if (!scored) {
    return `<p class="muted dash-empty-hint">평가된 추천 기업이 없습니다.<br />상세 → 수정에서 추천 점수·파일럿 난이도를 입력하세요.</p>`;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  let cursor = 0;
  const segments = counts
    .map((n, i) => {
      if (!n) return "";
      const pct = (n / total) * 100;
      const start = cursor;
      cursor += pct;
      return `${colors[i]} ${start}% ${cursor}%`;
    })
    .filter(Boolean)
    .join(", ");
  const gradient = `conic-gradient(${segments})`;
  const legend = Array.from({ length: maxLevel }, (_, i) => {
    const n = counts[i] || 0;
    const pct = total ? ((n / total) * 100).toFixed(1) : "0.0";
    return `<li>
        <span class="legend-dot" style="background:${colors[i]}"></span>
        <span class="legend-star">${escapeHtml(legendLabelFn(i + 1))}</span>
        <span class="legend-count">${n}개</span>
        <span class="legend-pct">${pct}%</span>
      </li>`;
  }).join("");

  return `
    <div class="donut-panel donut-panel-compact">
      <div class="donut-ring" style="background:${gradient}">
        <div class="donut-hole">
          <span class="donut-total">${scored}</span>
          <span class="donut-label">${escapeHtml(centerLabel)}</span>
        </div>
      </div>
      <ul class="donut-legend">${legend}</ul>
    </div>`;
}

function computeQualitySummary(rows) {
  let scoreSum = 0;
  let scoreCount = 0;
  let pilotSum = 0;
  let pilotCount = 0;
  let highRecommend = 0;
  let easyPilot = 0;

  for (const row of rows) {
    const s = parseRecommendScore(row);
    const p = parsePilotDifficulty(row);
    if (s) {
      scoreSum += s;
      scoreCount += 1;
      if (s >= 4) highRecommend += 1;
    }
    if (p) {
      pilotSum += p;
      pilotCount += 1;
      if (p <= 2) easyPilot += 1;
    }
  }

  return {
    avgRecommend: scoreCount ? scoreSum / scoreCount : 0,
    avgPilot: pilotCount ? pilotSum / pilotCount : 0,
    highRecommend,
    easyPilot,
    scoredRecommend: scoreCount,
    scoredPilot: pilotCount
  };
}

function renderQualityKpi(summary) {
  const avgRecStars = summary.scoredRecommend ? renderStarRating(Math.round(summary.avgRecommend), 5) : '<span class="muted">—</span>';
  const avgPilotStars = summary.scoredPilot ? renderStarRating(Math.round(summary.avgPilot), 3) : '<span class="muted">—</span>';

  return `<div class="quality-kpi-grid">
    <div class="quality-kpi">
      <span class="quality-kpi-label">평균 추천점수</span>
      <span class="quality-kpi-value">${avgRecStars}</span>
    </div>
    <div class="quality-kpi">
      <span class="quality-kpi-label">평균 난이도</span>
      <span class="quality-kpi-value">${avgPilotStars}</span>
    </div>
    <div class="quality-kpi">
      <span class="quality-kpi-label">추천도 높은 기업</span>
      <span class="quality-kpi-value"><strong>${summary.highRecommend}</strong><span class="quality-kpi-unit">4점+</span></span>
    </div>
    <div class="quality-kpi">
      <span class="quality-kpi-label">진입 쉬운 기업</span>
      <span class="quality-kpi-value"><strong>${summary.easyPilot}</strong><span class="quality-kpi-unit">난이도 2↓</span></span>
    </div>
  </div>`;
}

function computeActionKpi() {
  const active = activeLeadRows();
  const poolOf = (r) => poolClassOf(r);
  return {
    total: active.length,
    recommended: active.filter((r) => poolOf(r) === "recommended").length,
    inProgress: active.filter((r) => poolOf(r) === "in_progress").length,
    candidate: active.filter((r) => pipelineLabels().rowMatchesCandidatePool?.(r) ?? poolClassOf(r) === "normal").length,
    contractWon: active.filter((r) => {
      const { pipelineStatus, closedReason } = resolveRowPipeline(r);
      return pipelineStatus === "closed" && closedReason === "contract_won";
    }).length,
    excluded: state.rows.filter(isShelvedLead).length
  };
}

function renderActionKpiCards(kpi) {
  const cards = [
    { id: "total", icon: "building", value: kpi.total, label: "전체 활성", tone: "muted" },
    { id: "candidate", icon: "star", value: kpi.candidate, label: "후보", tone: "muted" },
    { id: "recommended", icon: "target", value: kpi.recommended, label: "추천", tone: "emphasis-3" },
    { id: "inProgress", icon: "fileText", value: kpi.inProgress, label: "진행", tone: "emphasis-2" },
    { id: "contractWon", icon: "briefcase", value: kpi.contractWon, label: "계약 성공", tone: "emphasis-1" },
    { id: "excluded", icon: "ban", value: kpi.excluded, label: "제외", tone: "muted" }
  ];

  return `<div class="action-kpi-grid">${cards
    .map(
      (c) => `
    <div class="kpi-card kpi-card-${c.tone}" data-kpi-id="${c.id}">
      <span class="kpi-card-icon" aria-hidden="true">${iconSvg(c.icon, 20)}</span>
      <span class="kpi-card-value">${c.value}</span>
      <span class="kpi-card-label">${escapeHtml(c.label)}</span>
    </div>`
    )
    .join("")}</div>`;
}

function renderDashboard() {
  const actionKpi = computeActionKpi();

  byId("dashboard").innerHTML = `
    <article class="dash-card dash-portfolio">
      <div class="dash-card-head">
        <h2 class="dash-card-title">${iconSvg("chart", 16)} 공략 우선순위 매트릭스</h2>
        <p class="muted portfolio-map-sub">호버 시 목록 · 클릭 시 상세</p>
      </div>
      ${renderPortfolioMap()}
    </article>
    <article class="dash-card dash-actions">
      <h2 class="dash-card-title">${iconSvg("layers", 16)} 액션 현황</h2>
      ${renderActionKpiCards(actionKpi)}
    </article>`;

  hydrateIcons(byId("dashboard"));
  bindPortfolioMap();
  highlightActionKpiCards();
}

function renderKpi() {
  renderDashboard();
}

function renderPresets() {
  byId("presets").innerHTML = PRESETS.map(
    (p) =>
      `<button type="button" class="preset-btn${state.activePreset === p.id ? " active" : ""}" data-preset="${p.id}">${p.label}</button>`
  ).join("");
  byId("presets").querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.activePreset = btn.dataset.preset;
      PRESETS.find((p) => p.id === state.activePreset)?.apply();
      renderPresets();
    });
  });
}

function renderCompanyCell(row, { showPoolBadge = true } = {}) {
  const svc = serviceName(row);
  const svcUrl = serviceUrl(row);
  const svcHtml = svc
    ? svcUrl
      ? `<a class="cell-service link" href="${escapeAttr(svcUrl)}" target="_blank" rel="noreferrer">${escapeHtml(svc)}</a>`
      : `<span class="cell-service">${escapeHtml(svc)}</span>`
    : "";
  return `<div class="cell-company">
      <div class="company-line">
        <strong>${escapeHtml(displayName(row))}</strong>
        ${newBadge(row)}
        ${manualBadge(row)}
        ${showPoolBadge ? poolClassBadge(row) : ""}
        ${tierBadge(row)}
        ${scaleBadge(row)}
        ${bizStatusBadge(row)}
      </div>
      ${svcHtml}
      <span class="company-sub">${escapeHtml(companySubline(row))}</span>
    </div>`;
}

function renderCompanyTableRow(row) {
  return `
            <tr class="lead-row-click${row.excluded ? " row-excluded" : ""}${hasFailedPosts(row) ? " row-failure" : ""}${row.isManual ? " row-manual" : ""}${row.isNewFromLastCrawl ? " row-new-crawl" : ""}${rowTierClass(row)}" data-open-company="${escapeAttr(row.companyId)}">
              <td>${renderCompanyCell(row)}</td>
              <td>${row.posts.length}건</td>
              <td><strong>${row.priorityScore}</strong></td>
              <td><span class="badge grade-${row.leadGrade}">${row.leadGrade}</span></td>
              <td>${pipelineStageBadge(row)}</td>
              <td>${pipelineStatusBadge(row)}</td>
              <td><span class="badge">${contactDisplay(row)}</span></td>
              <td title="${row.isNewFromLastCrawl ? "직전 크롤 신규 · " : ""}최근 공고 갱신: ${escapeAttr(formatDate(row.lastCollectedAt) || "-")}">${formatDate(displayCollectedAt(row))}${row.isNewFromLastCrawl ? ' <span class="muted">· New</span>' : ""}</td>
            </tr>`;
}

function bindCompanyTablePanel(panel, { page, totalPages, pagerKey, onPage }) {
  bindPager(panel, { page, totalPages, pagerKey, onPage });
  panel.querySelectorAll("tr.lead-row-click").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      const row = state.rows.find((r) => r.companyId === tr.dataset.openCompany);
      if (row) openDetail(row);
    });
  });
}

function pagerTabKey(pageKey) {
  if (pageKey === "newPage") return "new";
  if (pageKey === "excludedPage") return "excluded";
  return "leads";
}

function renderCompanyTable(panelId, rows, { pageKey = "leadsPage", emptyHtml, onRefresh } = {}) {
  const panel = byId(panelId);
  if (!panel) return;

  const sorted = sortRows(rows);
  const paged = paginate(sorted, state[pageKey]);
  state[pageKey] = paged.page;

  if (!sorted.length) {
    panel.innerHTML =
      emptyHtml ?? '<div class="empty-state">조건에 맞는 회사가 없습니다.</div>';
    return;
  }

  panel.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>회사</th>
            <th>공고</th>
            <th>우선순위</th>
            <th>등급</th>
            <th>단계</th>
            <th>상태</th>
            <th>담당자</th>
            <th>등록일</th>
          </tr>
        </thead>
        <tbody>
          ${paged.items.map((row) => renderCompanyTableRow(row)).join("")}
        </tbody>
      </table>
    </div>
    ${renderPagerHtml(paged.page, paged.totalPages, paged.total, "건", pagerTabKey(pageKey))}`;

  bindCompanyTablePanel(panel, {
    page: paged.page,
    totalPages: paged.totalPages,
    pagerKey: pagerTabKey(pageKey),
    onPage: (next) => {
      state[pageKey] = next;
      onRefresh?.();
    }
  });
}

function renderLeadsTable() {
  if (state.activeTab !== "leads") return;
  renderCompanyTable("leads", state.rows.filter(isMainTabLead).filter(passesFilters), {
    pageKey: "leadsPage",
    onRefresh: renderLeadsTable
  });
}

function renderExcludedTable() {
  if (state.activeTab !== "excluded") return;
  renderCompanyTable("excluded", excludedTabRows().filter(passesFilters), {
    pageKey: "excludedPage",
    emptyHtml: '<div class="empty-state">제외·숨김 회사가 없습니다.</div>',
    onRefresh: renderExcludedTable
  });
}

function detailStat(label, value, extraClass = "") {
  return detailMetric(label, value, extraClass);
}

function refreshDetailAdminButtons(edit = state.detailEdit) {
  const admin = Boolean(window.TClientAdmin?.isUnlocked?.());
  const specs = [
    { id: "detailEditBtn", lockedTitle: "관리자 로그인 후 수정 (우측 상단 관리자)" },
    { id: "detailMergeBtn", lockedTitle: "관리자 로그인 후 병합" },
    { id: "detailDeleteBtn", lockedTitle: "관리자 로그인 후 삭제" }
  ];
  for (const spec of specs) {
    const btn = byId(spec.id);
    if (!btn) continue;
    btn.classList.remove("hidden");
    btn.classList.toggle("is-locked", !admin);
    btn.title = admin ? btn.dataset.titleActive || btn.title : spec.lockedTitle;
    if (spec.id === "detailEditBtn") btn.classList.toggle("active", Boolean(edit && admin));
  }
}

function renderDetailTitleHtml(row) {
  const nameTags = [tierBadge(row), scaleBadge(row), bizStatusBadge(row)].filter(Boolean).join("");
  const companyLine = `<span class="detail-title-row-inline">
    <span class="detail-title-company">${escapeHtml(displayName(row))}</span>
    ${nameTags ? `<span class="detail-header-name-tags">${nameTags}</span>` : ""}
  </span>`;
  const svc = serviceName(row);
  return svc ? `${companyLine}<span class="detail-title-service">${escapeHtml(svc)}</span>` : companyLine;
}

function paintDetailHeader(row) {
  byId("detailTitle").innerHTML = renderDetailTitleHtml(row);
  const sub = byId("detailHeaderSub");
  if (sub) {
    const text = companySubline(row);
    sub.textContent = text;
    sub.classList.toggle("hidden", !text);
  }
  const chips = byId("detailHeaderChips");
  if (chips) {
    const items = [newBadge(row), manualBadge(row)].filter(Boolean);
    chips.innerHTML = items.join("");
    chips.classList.toggle("hidden", !items.length);
  }
  const stats = byId("detailHeaderStats");
  if (stats) {
    stats.innerHTML = renderDrawerStatsCompact(row);
  }
  refreshDetailAdminButtons(state.detailEdit);
  hydrateIcons(byId("detailDrawer"));
}

function renderDetailBody(row, edit, admin = false) {
  const e = window.TClientAdmin?.getEntry(row.companyId) ?? {};
  const p = { ...(row.profile ?? {}), ...(e.profile ?? {}) };
  const c = row.contact ?? {};
  const pipeline = resolveRowPipeline(row);
  const tierVal = e.companyTier || row.companyTier || "";
  const email = c.email || row.email || "";

  const statsRow = "";

  const pool = poolClassOf(row);

  const classifyBlock = edit
    ? `<div class="drawer-edit-form detail-form-grid">
        <div class="drawer-field"><label class="drawer-field-label" for="edit-name-ko">회사명</label>${inlineInput("edit-name-ko", e.companyNameKo || row.companyNameKo)}</div>
        <div class="drawer-field"><label class="drawer-field-label" for="edit-tier">규모</label>${inlineSelect("edit-tier", tierVal, [
          ["", "(자동)"],
          ["startup", "소·스타트업"],
          ["mid", "중견"],
          ["enterprise", "대기업"],
          ["unknown", "미확인"]
        ])}</div>
        <div class="drawer-field"><label class="drawer-field-label" for="edit-grade">등급</label>${inlineSelect("edit-grade", e.leadGrade || row.leadGrade, [
          ["", "(유지)"],
          ["A", "A"],
          ["B", "B"],
          ["C", "C"]
        ])}</div>
        <div class="drawer-field drawer-field-wide">
          <span class="drawer-field-label">분류</span>
          <div class="pool-class-options pool-class-segmented">
            <label><input type="radio" name="edit-pool-class" value="normal" ${pool === "normal" ? "checked" : ""} /> 후보</label>
            <label><input type="radio" name="edit-pool-class" value="recommended" ${pool === "recommended" ? "checked" : ""} /> 추천</label>
            <label><input type="radio" name="edit-pool-class" value="hidden" ${pool === "hidden" ? "checked" : ""} /> 숨김</label>
          </div>
        </div>
        <div class="drawer-field"><label class="drawer-field-label" for="edit-exclude">제외 사유</label>${inlineInput("edit-exclude", e.excludeReason ?? row.excludeReason ?? "")}</div>
        <div class="drawer-field drawer-field-wide"><label class="drawer-field-label" for="edit-notes">메모</label>${inlineInput("edit-notes", row.salesMemo ?? row.manualNotes ?? "")}</div>
      </div>`
    : "";

  const pipelineBlock = edit
    ? `<div class="detail-form-grid cols-2">
        <div class="inline-row"><span class="inline-label">단계</span>${pipelineStageSelect("edit-pipeline-stage", pipeline.pipelineStage)}</div>
        <div class="inline-row"><span class="inline-label">상태</span>${pipelineStatusSelect("edit-pipeline-status", pipeline.pipelineStatus)}</div>
        <div class="inline-row span-2"><span class="inline-label">종결 사유</span>${closedReasonSelect("edit-closed-reason", row.closedReason ?? "")}</div>
      </div>`
    : `<div class="pipeline-detail-summary">${renderPipelineSummary(row)}${
        row.closedReason
          ? `<p class="muted pipeline-closed-reason">종결 사유: ${escapeHtml(pipelineLabels().closedReasonLabel?.(row.closedReason) ?? row.closedReason)}</p>`
          : ""
      }${row.pipelineStageAt ? `<p class="muted pipeline-stage-at">단계 변경: ${escapeHtml(formatDate(row.pipelineStageAt))}</p>` : ""}</div>`;

  const contactBlock = edit
    ? `<div class="detail-form-grid">
        <div class="inline-row"><span class="inline-label">이름</span>${inlineInput("edit-contact-name", c.name ?? "")}</div>
        <div class="inline-row"><span class="inline-label">이메일</span>${inlineInput("edit-contact-email", email, "email")}</div>
        <div class="inline-row span-2"><span class="inline-label">전화</span>${inlineInput("edit-contact-phone", c.phone ?? "", "tel")}</div>
      </div>`
    : detailKvGrid([
        ["이름", c.name ? `<strong>${escapeHtml(c.name)}</strong>` : '<span class="muted">—</span>'],
        ["이메일", email ? `<a class="link" href="mailto:${escapeAttr(email)}">${escapeHtml(email)}</a>` : '<span class="muted">없음</span>'],
        ["전화", c.phone ? escapeHtml(c.phone) : '<span class="muted">—</span>']
      ]);

  const evalBlock = edit
    ? `<div class="detail-form-grid cols-2">
        <div class="inline-row"><span class="inline-label">추천 점수</span>${inlineSelect("edit-cand-score", scoreSelectValue(row.recommendScore), [["","(선택)"],["5","★★★★★"],["4","★★★★☆"],["3","★★★☆☆"],["2","★★☆☆☆"],["1","★☆☆☆☆"]])}</div>
        <div class="inline-row"><span class="inline-label">파일럿 난이도</span>${inlineSelect("edit-cand-pilot", scoreSelectValue(row.pilotDifficulty), [["","(선택)"],["1","★☆☆"],["2","★★☆"],["3","★★★"]])}</div>
        <div class="inline-row span-2"><span class="inline-label">추천 근거</span>${inlineInput("edit-recommend-reason", row.recommendScoreReason ?? "")}</div>
        <div class="inline-row span-2"><span class="inline-label">파일럿 근거</span>${inlineInput("edit-pilot-reason", row.pilotDifficultyReason ?? "")}</div>
        <div class="inline-row span-2"><span class="inline-label">평가 메모</span>${inlineInput("edit-eval-notes", row.evaluationNotes ?? "")}</div>
      </div>`
    : `<div class="detail-eval-summary">
        <div class="detail-score-box"><span class="detail-score-label">추천</span>${renderStarRating(row.recommendScore, 5)}</div>
        <div class="detail-score-box"><span class="detail-score-label">파일럿</span>${renderStarRating(row.pilotDifficulty, 3)}</div>
        ${row.recommendScoreReason ? `<p class="detail-prose"><strong>추천 근거</strong> ${escapeHtml(row.recommendScoreReason)}</p>` : ""}
        ${row.pilotDifficultyReason ? `<p class="detail-prose"><strong>파일럿 근거</strong> ${escapeHtml(row.pilotDifficultyReason)}</p>` : ""}
      </div>`;

  const testBlock = edit
    ? `<div class="detail-form-grid cols-2">
        <div class="inline-row"><span class="inline-label">시작일</span>${inlineInput("edit-test-started", (row.testStartedAt ?? "").slice(0, 10), "date")}</div>
        <div class="inline-row"><span class="inline-label">종료일</span>${inlineInput("edit-test-ended", (row.testEndedAt ?? "").slice(0, 10), "date")}</div>
        <div class="inline-row span-2"><span class="inline-label">테스트기간(원문)</span>${inlineInput("edit-test-period", row.testPeriodLabel ?? "")}</div>
        <div class="inline-row span-2"><span class="inline-label">테스트 메모</span>${inlineInput("edit-test-notes", row.testNotes ?? "")}</div>
      </div>`
    : `<div class="detail-kv">${detailKvGrid([
        ["시작일", row.testStartedAt ? escapeHtml(formatDate(row.testStartedAt)) : '<span class="muted">—</span>'],
        ["종료일", row.testEndedAt ? escapeHtml(formatDate(row.testEndedAt)) : '<span class="muted">—</span>'],
        ...(row.testPeriodLabel ? [["기간(원문)", escapeHtml(row.testPeriodLabel)]] : []),
        ["메모", escapeHtml(row.testNotes || "-")]
      ])}</div>`;

  const filesPlaceholder = edit && admin
    ? `<div class="detail-files-section" data-company-files="${escapeAttr(row.companyId)}">
        <div class="detail-form-grid cols-2 file-add-row">
          <div class="inline-row"><span class="inline-label">제목</span>${inlineInput("edit-file-title", "", "text", "결과보고서")}</div>
          <div class="inline-row"><span class="inline-label">URL</span>${inlineInput("edit-file-url", "", "url", "https://...")}</div>
        </div>
        <p><button type="button" class="btn-ghost btn-sm" id="file-add-btn">파일 URL 추가</button></p>
        <div class="file-list-wrap"><p class="muted">파일 목록 로딩…</p></div>
      </div>`
    : `<div class="detail-files-section" data-company-files="${escapeAttr(row.companyId)}"><p class="muted">결과보고서 목록 로딩…</p></div>`;
  const meetingsPlaceholder = edit && admin
    ? `<div class="detail-meetings-section" data-company-meetings="${escapeAttr(row.companyId)}">
        <div class="detail-form-grid cols-2 meeting-add-row">
          <div class="inline-row"><span class="inline-label">일시</span><input type="datetime-local" id="edit-meeting-at" class="inline-field" /></div>
          <div class="inline-row"><span class="inline-label">장소</span>${inlineInput("edit-meeting-location", "", "text")}</div>
          <div class="inline-row span-2"><span class="inline-label">참석자</span>${inlineInput("edit-meeting-attendees", "", "text")}</div>
          <div class="inline-row span-2"><span class="inline-label">요약</span>${inlineInput("edit-meeting-summary", "", "text")}</div>
          <div class="inline-row span-2"><span class="inline-label">다음 액션</span>${inlineInput("edit-meeting-next", "", "text")}</div>
        </div>
        <p><button type="button" class="btn-ghost btn-sm" id="meeting-add-btn">미팅 추가</button></p>
        <div class="meeting-list-wrap"><p class="muted">미팅 기록 로딩…</p></div>
      </div>`
    : `<div class="detail-meetings-section" data-company-meetings="${escapeAttr(row.companyId)}"><p class="muted">미팅 기록 로딩…</p></div>`;

  const postsBlock = edit
    ? `<div class="detail-table-wrap">
        <table class="detail-table detail-table-compact">
          <thead><tr><th>공고</th><th>출처</th><th></th></tr></thead>
          <tbody>${row.posts
            .map(
              (post) => `
            <tr>
              <td>${escapeHtml(post.title)}</td>
              <td>${escapeHtml(post.sourceLabel || post.source)}</td>
              <td class="cell-post-link">
                <a class="link" href="${escapeAttr(post.url)}" target="_blank" rel="noreferrer">${iconSvg("external", 14)}</a>
                ${
                  admin
                    ? '<button type="button" class="btn-icon-delete post-delete-btn" data-post-url="' +
                      escapeAttr(post.url) +
                      '" data-post-manual="' +
                      (post.isManualPost ? "1" : "0") +
                      '" title="삭제"><span data-icon="trash"></span></button>'
                    : ""
                }
              </td>
            </tr>`
            )
            .join("")}</tbody>
        </table>
      </div>
      <div class="detail-form-grid cols-2 post-add-row">
        <div class="inline-row"><span class="inline-label">제목</span>${inlineInput("edit-post-title", "", "text", "QA 엔지니어")}</div>
        <div class="inline-row"><span class="inline-label">URL</span>${inlineInput("edit-post-url", "", "url", "https://...")}</div>
      </div>`
    : row.posts.length
      ? `<ul class="post-list">${row.posts
          .map(
            (post) => `
          <li class="post-list-item">
            <div class="post-list-main">
              <strong>${escapeHtml(post.title)}</strong>
              <span class="post-list-meta">${escapeHtml(post.sourceLabel || post.source)}</span>
            </div>
            <div class="post-list-actions">
              <a class="link post-list-link" href="${escapeAttr(post.url)}" target="_blank" rel="noreferrer">${iconSvg("external", 14)} 열기</a>
              ${
                admin
                  ? '<button type="button" class="btn-icon-delete post-delete-btn" data-post-url="' +
                    escapeAttr(post.url) +
                    '" data-post-manual="' +
                    (post.isManualPost ? "1" : "0") +
                    '" title="삭제"><span data-icon="trash"></span></button>'
                  : ""
              }
            </div>
          </li>`
          )
          .join("")}</ul>`
      : `<p class="muted detail-empty-hint">등록된 공고가 없습니다.</p>`;

  const sections = [];
  const flat = edit;
  if (edit && classifyBlock) sections.push(detailCard("요약", classifyBlock, "detail-block-form", { icon: "building", open: true, flat: true }));
  sections.push(detailCard("영업 관리", edit ? pipelineBlock + contactBlock : `<div class="detail-split">${pipelineBlock}${contactBlock}</div>`, "", { icon: "briefcase", open: true, flat }));
  if (window.TPipeline?.isInProgressStage?.(pipeline.pipelineStage) || testPeriodDisplay(row)) {
    sections.push(detailCard("테스트 · 진행", testBlock, "", { icon: "target", open: true, flat }));
  }
  sections.push(detailCard("추천 평가", evalBlock, "detail-block-warm", { icon: "star", open: true, flat }));
  sections.push(detailCard("결과보고서", filesPlaceholder, "", { icon: "fileText", open: false, flat }));
  sections.push(detailCard("미팅 기록", meetingsPlaceholder, "", { icon: "users", open: false, flat }));
  sections.push(detailCard(`공고 · ${row.posts.length}건`, postsBlock, "", { icon: "building", open: false, flat }));
  sections.push(detailCard("점수 근거", renderScoreSection(row, edit, admin), "detail-block-muted", { icon: "chart", open: false, flat }));
  sections.push(detailCard("프로필", renderProfileSection(row, edit, p, e.domain || row.domain || "", admin), "", { icon: "layers", open: false, flat }));

  return `
    <div class="detail-shell${edit ? " is-edit" : ""}">
      <p class="drawer-section-label drawer-menu-label">MENU</p>
      ${sections.join("")}
    </div>
    ${row.excludeReason ? `<p class="warn detail-warn">제외 사유: ${escapeHtml(row.excludeReason)}</p>` : ""}
    ${edit ? `<footer class="detail-footer detail-footer-sticky"><button type="button" class="btn-ghost btn-sm" id="detail-cancel-edit">취소</button><button type="button" class="btn-primary" id="detail-save-all">변경 저장</button></footer>` : ""}`;
}

function tierLabelKo(tier) {
  const map = { startup: "소·스타트업", mid: "중견", enterprise: "대기업", unknown: "미확인" };
  return map[tier] ?? tier ?? "-";
}

async function hydrateDetailExtras(row) {
  if (!row?.companyId) return;
  const filesEl = document.querySelector(`[data-company-files="${row.companyId}"]`);
  const meetEl = document.querySelector(`[data-company-meetings="${row.companyId}"]`);
  const filesListEl = filesEl?.querySelector(".file-list-wrap") ?? filesEl;
  const meetListEl = meetEl?.querySelector(".meeting-list-wrap") ?? meetEl;
  const admin = window.TClientAdmin?.isUnlocked?.();
  const edit = state.detailEdit && admin;

  function renderFileList(files) {
    if (!filesListEl) return;
    filesListEl.innerHTML = files.length
      ? `<ul class="file-list">${files
          .map(
            (f) =>
              `<li><a class="link" href="${escapeAttr(f.fileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(f.title || window.TCompanyFiles.FILE_TYPE_LABEL[f.fileType] || "파일")}</a> <span class="muted">${escapeHtml(formatDate(f.uploadedAt))}</span>${
                edit
                  ? ` <button type="button" class="btn-ghost btn-sm file-del-btn" data-file-id="${escapeAttr(f.id)}">삭제</button>`
                  : ""
              }</li>`
          )
          .join("")}</ul>`
      : `<p class="muted">등록된 파일이 없습니다.${admin ? " 수정 모드에서 URL을 추가하세요." : ""}</p>`;
    if (edit) {
      filesListEl.querySelectorAll(".file-del-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            await window.TCompanyFiles.remove(btn.dataset.fileId, row.companyId);
            void hydrateDetailExtras(row);
          } catch (err) {
            showToast(err.message || "파일 삭제 실패", "error");
          }
        });
      });
    }
  }

  function renderMeetingList(notes) {
    if (!meetListEl) return;
    meetListEl.innerHTML = notes.length
      ? `<ul class="meeting-list">${notes
          .map(
            (n) =>
              `<li><strong>${escapeHtml(formatDate(n.meetingAt) || "일시 미정")}</strong> ${escapeHtml(n.location ? `· ${n.location}` : "")}<div>${escapeHtml(n.summary || "")}</div>${
                n.nextAction ? `<div class="muted">다음: ${escapeHtml(n.nextAction)}</div>` : ""
              }${
                edit
                  ? ` <button type="button" class="btn-ghost btn-sm meeting-del-btn" data-note-id="${escapeAttr(n.id)}">삭제</button>`
                  : ""
              }</li>`
          )
          .join("")}</ul>`
      : '<p class="muted">미팅 기록이 없습니다.</p>';
    if (edit) {
      meetListEl.querySelectorAll(".meeting-del-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          try {
            await window.TMeetingNotes.remove(btn.dataset.noteId, row.companyId);
            void hydrateDetailExtras(row);
          } catch (err) {
            showToast(err.message || "미팅 삭제 실패", "error");
          }
        });
      });
    }
  }

  try {
    const files = await window.TCompanyFiles.loadForCompany(row.companyId, true);
    renderFileList(files);
  } catch {
    if (filesListEl) filesListEl.innerHTML = '<p class="muted">파일 목록을 불러오지 못했습니다. (migration 013 필요)</p>';
  }

  try {
    const notes = await window.TMeetingNotes.loadForCompany(row.companyId, true);
    renderMeetingList(notes);
    window.__TCLIENT_MEETING_CACHE = window.__TCLIENT_MEETING_CACHE ?? {};
    window.__TCLIENT_MEETING_CACHE[row.companyId] = notes;
  } catch {
    if (meetListEl) meetListEl.innerHTML = '<p class="muted">미팅 기록을 불러오지 못했습니다. (migration 013 필요)</p>';
  }

  if (edit) {
    byId("meeting-add-btn")?.addEventListener("click", async () => {
      const at = byId("edit-meeting-at")?.value;
      try {
        await window.TMeetingNotes.upsert(row.companyId, {
          meetingAt: at ? new Date(at).toISOString() : null,
          location: byId("edit-meeting-location")?.value.trim(),
          attendees: byId("edit-meeting-attendees")?.value.trim(),
          summary: byId("edit-meeting-summary")?.value.trim(),
          nextAction: byId("edit-meeting-next")?.value.trim()
        });
        ["edit-meeting-at", "edit-meeting-location", "edit-meeting-attendees", "edit-meeting-summary", "edit-meeting-next"].forEach(
          (id) => {
            const el = byId(id);
            if (el) el.value = "";
          }
        );
        void hydrateDetailExtras(row);
        showToast("미팅 기록이 추가되었습니다.");
      } catch (err) {
        showToast(err.message || "미팅 저장 실패", "error");
      }
    });

    byId("file-add-btn")?.addEventListener("click", async () => {
      const url = byId("edit-file-url")?.value.trim();
      if (!url) {
        showToast("파일 URL을 입력하세요.", "error");
        return;
      }
      try {
        await window.TCompanyFiles.add(row.companyId, {
          fileType: "result_report",
          title: byId("edit-file-title")?.value.trim() || "결과보고서",
          fileUrl: url
        });
        byId("edit-file-url").value = "";
        byId("edit-file-title").value = "";
        void hydrateDetailExtras(row);
        showToast("파일이 추가되었습니다.");
      } catch (err) {
        showToast(err.message || "파일 저장 실패", "error");
      }
    });
  }
}

function paintDetailModal() {
  const row = state.detailRow;
  if (!row) return;
  setDetailLoading(false);
  const admin = window.TClientAdmin?.isUnlocked();
  const edit = state.detailEdit && admin;
  paintDetailHeader(row);
  byId("detailBody").innerHTML = renderDetailBody(row, edit, admin);
  if (admin) byId("btn-recalc-score")?.addEventListener("click", () => runRecalcScore(row));
  if (edit) {
    bindDetailEdits(row);
    window.TUiSelect?.init(byId("detailDrawer"));
    byId("detail-cancel-edit")?.addEventListener("click", () => {
      state.detailEdit = false;
      paintDetailModal();
    });
  }
  void hydrateDetailExtras(row);
  void window.TDetailPanel?.syncNewToggle?.(row);
  hydrateIcons(byId("detailDrawer"));
  if (window.TDetailPanel) window.TDetailPanel.renderBody = renderDetailBody;
}

async function openDetail(row, edit = false) {
  state.detailRow = row;
  state.detailEdit = edit && window.TClientAdmin?.isUnlocked();
  window.__TCLIENT_DETAIL_ROW = row;
  window.__TCLIENT_DETAIL_EDIT = state.detailEdit;
  hidePortfolioPopover();
  if (window.TClientAdmin?.isUnlocked?.()) {
    try {
      await window.TCompanyUserState.markViewed(row.companyId);
      refreshViews();
    } catch {
      /* migration 013 */
    }
  }
  paintDetailModal();
  const drawer = byId("detailDrawer");
  drawer?.classList.remove("hidden");
  drawer?.setAttribute("aria-hidden", "false");
  document.body.classList.add("detail-drawer-open");
  window.TDetailPanel?.refreshTabs?.();
}

function closeDetail() {
  state.detailRow = null;
  state.detailEdit = false;
  window.__TCLIENT_DETAIL_ROW = null;
  window.__TCLIENT_DETAIL_EDIT = false;
  hidePortfolioPopover();
  const drawer = byId("detailDrawer");
  drawer?.classList.add("hidden");
  drawer?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("detail-drawer-open");
}

function openAddCompanyModal() {
  if (!window.TClientAdmin?.isUnlocked()) {
    showToast("관리자 로그인이 필요합니다.", "error");
    return;
  }
  const modal = byId("addCompanyModal");
  byId("add-co-name").value = "";
  byId("add-co-domain").value = "";
  byId("add-co-bizno").value = "";
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  byId("add-co-name")?.focus();
  hydrateIcons(modal);
}

function closeAddCompanyModal() {
  const modal = byId("addCompanyModal");
  modal?.classList.add("hidden");
  modal?.setAttribute("aria-hidden", "true");
}

function submitAddCompany() {
  void submitAddCompanyAsync();
}

async function submitAddCompanyAsync() {
  const name = byId("add-co-name")?.value.trim();
  if (!name) {
    showToast("회사명을 입력하세요.", "error");
    return;
  }
  const row = buildManualCompanyRow({
    companyNameKo: name,
    domain: byId("add-co-domain")?.value.trim(),
    bizNo: byId("add-co-bizno")?.value.trim()
  });
  if (!window.TClientAdmin.addCustomCompany(row)) {
    showToast("이미 등록된 회사입니다.", "error");
    return;
  }
  try {
    await window.TCompanies.upsertManual(row);
    await window.TClientAdmin.flushPersist?.();
  } catch (err) {
    window.TClientAdmin.removeCustomCompany(row.companyId);
    showToast(err.message || "회사 등록 실패", "error");
    return;
  }
  reloadRowsWithAdmin();
  refreshViews();
  closeAddCompanyModal();
  showToast("회사가 추가되었습니다.");
  openDetail(state.rows.find((r) => r.companyId === row.companyId) ?? row, true);
}

function openAddPostModal() {
  if (!window.TClientAdmin?.isUnlocked()) {
    showToast("관리자 로그인이 필요합니다.", "error");
    return;
  }
  const modal = byId("addPostModal");
  byId("add-post-url").value = "";
  byId("add-post-bizno").value = "";
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  byId("add-post-url")?.focus();
  hydrateIcons(modal);
}

function closeAddPostModal() {
  const modal = byId("addPostModal");
  modal?.classList.add("hidden");
  modal?.setAttribute("aria-hidden", "true");
}

function submitAddPost() {
  void submitAddPostAsync();
}

async function submitAddPostAsync() {
  const url = normalizePostUrlInput(byId("add-post-url")?.value);
  if (!url) {
    showToast("공고 URL을 입력하세요.", "error");
    return;
  }
  try {
    new URL(url);
  } catch {
    showToast("올바른 URL을 입력하세요.", "error");
    return;
  }
  const conflict = findPostConflict(url);
  if (conflict) {
    if (conflict.hidden && window.TClientAdmin?.isUnlocked?.()) {
      const entry = window.TClientAdmin.getEntry(conflict.row.companyId);
      const key = window.TPostUrl?.postUrlKey(url) ?? url.toLowerCase();
      const nextHidden = (entry.hiddenPosts ?? []).filter(
        (u) => (window.TPostUrl?.postUrlKey(u) ?? `${u}`.toLowerCase()) !== key
      );
      window.TClientAdmin.setEntry(conflict.row.companyId, { hiddenPosts: nextHidden });
      reloadRowsWithAdmin();
      refreshViews();
      closeAddPostModal();
      showToast(`숨김 처리됐던 공고를 복원했습니다: ${displayName(conflict.row)}`);
      openDetail(conflict.row, false);
      return;
    }
    const name = displayName(conflict.row);
    const stored = conflict.storedUrl ?? url;
    const hint =
      stored.toLowerCase() !== url.toLowerCase() ? " (동일 공고 — URL 형식만 다름)" : "";
    showToast(`이미 등록된 공고입니다: ${name}${hint}`, "error");
    openDetail(conflict.row, false);
    return;
  }

  const bizNo = byId("add-post-bizno")?.value.trim();
  const digits = normalizeBizNoDigits(bizNo);
  if (bizNo && digits.length !== 10) {
    showToast("사업자번호 10자리를 입력하세요.", "error");
    return;
  }

  byId("add-post-submit").disabled = true;
  try {
    const { row, created, enrichProfile } = await resolveCompanyForManualPost(url, bizNo);
    if (!row) {
      showToast("회사를 만들 수 없습니다.", "error");
      return;
    }

    const post = {
      title: "QA 공고",
      url,
      source: "manual",
      sourceLabel: "수동"
    };
    const profilePatch = enrichProfile
      ? profilePatchFromEnrich(enrichProfile)
      : bizNo
        ? { bizNo }
        : null;
    if (!window.TClientAdmin.addManualPost(row.companyId, post, profilePatch)) {
      showToast("공고 추가에 실패했습니다.", "error");
      return;
    }

    if (created && enrichProfile) {
      window.TClientAdmin.updateCustomCompany(row.companyId, {
        companyNameKo: enrichProfile.companyNameLegal || row.companyNameKo,
        companyName: enrichProfile.companyNameLegal || row.companyName,
        domain: enrichProfile.domain || row.domain,
        profile: profilePatchFromEnrich(enrichProfile)
      });
      const updated = state.rows.find((r) => r.companyId === row.companyId) ?? row;
      await window.TCompanies.upsertManual({
        ...updated,
        companyNameKo: enrichProfile.companyNameLegal || updated.companyNameKo,
        companyName: enrichProfile.companyNameLegal || updated.companyName,
        domain: enrichProfile.domain || updated.domain,
        profile: profilePatchFromEnrich(enrichProfile)
      });
    } else if (created) {
      await window.TCompanies.ensureManual(row);
    }

    await window.TClientAdmin.flushPersist?.();
    reloadRowsWithAdmin();
    refreshViews();
    closeAddPostModal();

    if (bizNo && !enrichProfile && !findCompanyByBizNo(bizNo)) {
      showToast("공고가 추가됐습니다. bizno.net에서 회사를 찾지 못해 이름은 수동 등록 상태입니다.");
    } else if (created) {
      showToast(enrichProfile ? "공고와 회사(사업자 조회)가 추가되었습니다." : "공고와 회사가 추가되었습니다.");
    } else {
      showToast("기존 회사에 공고가 추가되었습니다.");
    }

    const target = state.rows.find((r) => r.companyId === row.companyId) ?? row;
    openDetail(target, true);
  } finally {
    byId("add-post-submit").disabled = false;
  }
}

function deleteCompany(row) {
  void deleteCompanyAsync(row);
}

async function deleteCompanyAsync(row) {
  if (!row?.companyId || !window.TClientAdmin?.isUnlocked()) return;

  const admin = window.TClientAdmin;
  const name = displayName(row);

  if (!window.confirm(`「${name}」 회사를 DB에서 완전히 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`)) return;

  try {
    admin.markCompanyDeleted(row.companyId);
    if (admin.isCustomCompany?.(row.companyId)) {
      admin.removeCustomCompany(row.companyId);
    }
    try {
      await window.TCompanies.deleteCompany(row.companyId);
    } catch (err) {
      if (!/not found/i.test(`${err.message ?? ""}`)) throw err;
    }
    window.TSalesManagement?.removeLocal?.(row.companyId);
    await admin.flushPersist?.();
  } catch (err) {
    showToast(err.message || "삭제 실패", "error");
    return;
  }

  closeDetail();
  reloadRowsWithAdmin();
  refreshViews();
  showToast("회사가 삭제되었습니다.");
}

async function deletePostFromCompany(row, postUrl, isManualPost) {
  if (!row?.companyId || !postUrl || !window.TClientAdmin?.isUnlocked()) return;

  const admin = window.TClientAdmin;
  const companyName = displayName(row);
  const post = (row.posts ?? []).find((p) => p.url === postUrl);

  if (!window.confirm(`「${companyName}」 공고를 삭제할까요?`)) return;

  try {
    admin.markPostDeleted(row.companyId, postUrl);
    if (isManualPost) admin.removeManualPost(row.companyId, postUrl);
    try {
      await window.TCompanies.deleteJobPost(row.companyId, { url: postUrl, jobPostId: post?.id ?? "" });
    } catch (err) {
      if (!/not found/i.test(`${err.message ?? ""}`)) throw err;
    }
    await admin.flushPersist?.();
    reloadRowsWithAdmin();
    const updated = state.rows.find((r) => r.companyId === row.companyId);
    if (updated && state.detailRow?.companyId === row.companyId) {
      state.detailRow = updated;
      paintDetailModal();
    } else if (!updated) {
      closeDetail();
    }
    refreshViews();
    showToast("공고가 삭제되었습니다.");
  } catch (err) {
    showToast(err.message || "삭제 실패", "error");
  }
}

function isMergeModalOpen() {
  const modal = byId("mergeModal");
  return modal && !modal.classList.contains("hidden");
}

function openMergeModal(row) {
  if (!row?.companyId || !window.TClientAdmin?.isUnlocked()) return;

  state.mergeSourceRow = row;
  const modal = byId("mergeModal");
  const detail = byId("detailDrawer");
  const hint = byId("mergeSourceHint");
  const badge = byId("mergeSourceBadge");
  if (badge) {
    badge.innerHTML = `<span class="merge-source-label">병합 원본</span><strong>${escapeHtml(displayName(row))}</strong>${manualBadge(row)}`;
  }
  if (hint) {
    hint.textContent = "아래에서 데이터를 합칠 대상 회사를 검색해 선택하세요.";
  }
  byId("mergeSearch").value = "";
  renderMergeResults("");
  document.body.appendChild(modal);
  detail?.classList.add("drawer-backstack");
  modal?.classList.remove("hidden");
  modal?.setAttribute("aria-hidden", "false");
  document.body.classList.add("merge-open");
  hydrateIcons(modal);
  byId("mergeSearch")?.focus();
}

function closeMergeModal() {
  const modal = byId("mergeModal");
  modal?.classList.add("hidden");
  modal?.setAttribute("aria-hidden", "true");
  byId("detailDrawer")?.classList.remove("drawer-backstack");
  document.body.classList.remove("merge-open");
  state.mergeSourceRow = null;
}

function renderMergeResults(query = "") {
  const el = byId("mergeResults");
  const sourceId = state.mergeSourceRow?.companyId;
  if (!el || !sourceId) return;

  const q = `${query}`.toLowerCase().trim();
  const rows = state.rows
    .filter((r) => r.companyId !== sourceId && !r.userHidden)
    .filter((r) => {
      if (!q) return true;
      const hay = `${displayName(r)} ${r.companyName} ${r.domain} ${r.profile?.bizNo ?? ""} ${r.profile?.companyNameLegal ?? ""}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 40);

  if (!rows.length) {
    el.innerHTML = '<p class="muted merge-empty">검색 결과가 없습니다.</p>';
    return;
  }

  el.innerHTML = rows
    .map(
      (r) => `
    <button type="button" class="merge-pick-row" data-merge-target="${escapeAttr(r.companyId)}">
      <span class="merge-pick-name">${escapeHtml(displayName(r))}${manualBadge(r)}</span>
      <span class="merge-pick-meta">${escapeHtml(r.domain || "-")} · ${escapeHtml(r.leadGrade || "-")} · 공고 ${r.posts?.length ?? 0}건</span>
    </button>`
    )
    .join("");
}

function confirmMergeToTarget(targetId) {
  void confirmMergeToTargetAsync(targetId);
}

async function confirmMergeToTargetAsync(targetId) {
  const sourceRow = state.mergeSourceRow;
  const sourceId = sourceRow?.companyId;
  const targetRow = state.rows.find((r) => r.companyId === targetId);
  if (!sourceId || !targetRow || !window.TClientAdmin?.isUnlocked()) return;

  if (
    !window.confirm(
      `「${displayName(sourceRow)}」을(를) 「${displayName(targetRow)}」로 병합할까요?\n(메모·후보·공고·프로필이 대상에 합쳐지고, 원본 회사는 ${window.TClientAdmin?.isCustomCompany?.(sourceId) ? "삭제" : "숨김"} 처리됩니다.)`
    )
  )
    return;

  if (!window.TClientAdmin.mergeCompanies(sourceId, targetId)) {
    showToast("병합에 실패했습니다.", "error");
    return;
  }

  try {
    const targetEntry = window.TClientAdmin.getEntry(targetId);
    if (window.TSalesManagement?.mergeFromCompanies) {
      await window.TSalesManagement.mergeFromCompanies(sourceId, targetId, targetEntry, targetRow, sourceRow);
    }
    await window.TClientAdmin.flushPersist?.();
  } catch (err) {
    showToast(err.message || "병합 저장 실패", "error");
    return;
  }

  const editMode = state.detailEdit;
  closeMergeModal();
  reloadRowsWithAdmin();
  refreshViews();

  const target = state.rows.find((r) => r.companyId === targetId);
  if (target) {
    state.detailRow = target;
    state.detailEdit = editMode;
    paintDetailModal();
  } else {
    closeDetail();
  }
  showToast("회사 병합이 완료되었습니다.");
}

function mergeManualCompany(row) {
  openMergeModal(row);
}

function bindMergeModal() {
  const modal = byId("mergeModal");
  if (!modal) return;

  byId("mergeSearch")?.addEventListener("input", (e) => {
    renderMergeResults(e.target.value);
  });

  byId("mergeResults")?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".merge-pick-row");
    if (!btn?.dataset.mergeTarget) return;
    confirmMergeToTarget(btn.dataset.mergeTarget);
  });

  modal.querySelectorAll("[data-close-merge]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMergeModal();
    });
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.classList.contains("modal-backdrop")) closeMergeModal();
  });
}

function bindAddPostModal() {
  const modal = byId("addPostModal");
  if (!modal) return;
  byId("btnAddPost")?.addEventListener("click", openAddPostModal);
  byId("add-post-submit")?.addEventListener("click", submitAddPost);
  modal.querySelectorAll("[data-close-add-post]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAddPostModal();
    });
  });
  byId("add-post-url")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAddPost();
  });
}

function bindAddCompanyModal() {
  const modal = byId("addCompanyModal");
  if (!modal) return;
  byId("btnAddCompany")?.addEventListener("click", openAddCompanyModal);
  byId("add-co-submit")?.addEventListener("click", submitAddCompany);
  modal.querySelectorAll("[data-close-add]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAddCompanyModal();
    });
  });
  byId("add-co-name")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAddCompany();
  });
}

function bindModal() {
  window.TDetailPanel.renderBody = renderDetailBody;
  window.TDetailPanel.bind?.();
  window.openMergeModal = openMergeModal;
  byId("detailBody")?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".post-delete-btn");
    if (!btn || !state.detailRow || !window.TClientAdmin?.isUnlocked()) return;
    deletePostFromCompany(state.detailRow, btn.dataset.postUrl, btn.dataset.postManual === "1");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (isMergeModalOpen()) {
      closeMergeModal();
      return;
    }
    const drawer = byId("detailDrawer");
    if (drawer && !drawer.classList.contains("hidden")) closeDetail();
  });
}

function collectAllPosts() {
  const rows = sortRows(state.rows.filter(isMainTabLead).filter(passesFilters));
  const out = [];
  for (const row of rows) {
    for (const post of row.posts ?? []) {
      out.push({ post, row });
    }
  }
  return out;
}

function renderAllPosts() {
  if (state.activeTab !== "posts") return;
  const items = collectAllPosts();
  const paged = paginate(items, state.postsPage);
  state.postsPage = paged.page;

  if (!items.length) {
    byId("posts").innerHTML = '<div class="empty-state">조건에 맞는 공고가 없습니다.</div>';
    return;
  }

  byId("posts").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>회사</th>
            <th>등급</th>
            <th>공고</th>
            <th>출처</th>
            <th>등록일</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${paged.items
            .map(
              ({ post, row }) => `
            <tr class="${post.failureReason ? "row-failure" : ""}${rowTierClass(row)}">
              <td class="cell-company">
                <button type="button" class="link-btn" data-company="${escapeAttr(row.companyId)}">${escapeHtml(displayName(row))}</button>
                ${newBadge(row)}
                ${tierBadge(row)}
              </td>
              <td><span class="badge grade-${row.leadGrade}">${row.leadGrade}</span></td>
              <td>${escapeHtml(post.title)}</td>
              <td>${escapeHtml(post.sourceLabel || post.source)}</td>
              <td title="${row.isNewFromLastCrawl ? "직전 크롤 신규 · " : ""}최근 공고 갱신: ${escapeAttr(formatDate(row.lastCollectedAt) || "-")}">${formatDate(displayCollectedAt(row))}${row.isNewFromLastCrawl ? ' <span class="muted">· New</span>' : ""}</td>
              <td><a class="link" href="${escapeAttr(post.url)}" target="_blank" rel="noreferrer">${iconSvg("external", 14)}</a></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    ${renderPagerHtml(paged.page, paged.totalPages, paged.total, "건", "posts")}`;

  const panel = byId("posts");
  bindPager(panel, {
    page: paged.page,
    totalPages: paged.totalPages,
    pagerKey: "posts",
    onPage: (next) => {
      state.postsPage = next;
      renderAllPosts();
    }
  });

  panel.querySelectorAll("[data-company]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = state.rows.find((r) => r.companyId === btn.dataset.company);
      if (row) openDetail(row);
    });
  });
}

function escapeHtml(value) {
  return `${value ?? ""}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("ko-KR");
  } catch {
    return value;
  }
}

/** 상단 갱신일·회사·공고 수 — 스냅샷 메타 + 실제 로드·병합된 rows 기준 */
function paintMetaBanner() {
  const meta = byId("meta");
  if (!meta) return;
  const activeRows = activeLeadRows();
  const companies = activeRows.length;
  const posts = activeRows.reduce((n, r) => n + (r.posts?.length ?? 0), 0);
  const generatedAt =
    state.snapshotGeneratedAt ||
    state.userOverridesAppliedAt ||
    null;
  meta.innerHTML = `<strong>T-client</strong><span>${formatDate(generatedAt)} 갱신</span><span>회사 ${companies} · 공고 ${posts} · 추천 ${state.rows.filter((r) => poolClassOf(r) === "recommended").length}</span>`;
}

function bindTabs() {
  const tabIds = ["in_progress", "recommended", "new", "leads", "posts", "excluded"];
  document.querySelectorAll(".tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs .tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeTab = btn.dataset.tab;
      window.__TCLIENT_ACTIVE_TAB = state.activeTab;
      state.leadsPage = 1;
      state.newPage = 1;
      state.postsPage = 1;
      state.excludedPage = 1;
      tabIds.forEach((id) => byId(id)?.classList.add("hidden"));
      byId(btn.dataset.tab)?.classList.remove("hidden");
      const toolbar = document.querySelector(".toolbar");
      const tabular = state.activeTab === "recommended" || state.activeTab === "new" || state.activeTab === "in_progress";
      toolbar?.classList.toggle("toolbar-candidates", tabular);
      if (tabular && state.filtersOpen) toggleFilterAdvanced(false);
      refreshViews();
    });
  });
}

function refreshViews() {
  window.__TCLIENT_ROWS = state.rows;
  window.__TCLIENT_ACTIVE_TAB = state.activeTab;
  paintMetaBanner();
  renderKpi();
  window.TDetailPanel?.renderTabPanels?.(state.activeTab);
  if (state.activeTab === "leads" || state.activeTab === "posts" || state.activeTab === "excluded") {
    renderLeadsTable();
    renderAllPosts();
    renderExcludedTable();
  }
}

function setAdminStatus(msg) {
  const el = byId("adminStatus");
  if (el) el.textContent = msg;
}

function setAdminUi(unlocked, { passwordSetup = false } = {}) {
  const badge = byId("adminBadge");
  badge?.classList.toggle("hidden", !unlocked);
  if (badge && unlocked) {
    const email = window.TClientAdmin?.getUserEmail?.() ?? "";
    badge.textContent = email || "로그인";
    badge.title = email ? `로그인: ${email}` : "로그인됨";
  }
  byId("adminTools")?.classList.toggle("hidden", !unlocked);
  byId("adminLoginForm")?.classList.toggle("hidden", unlocked || passwordSetup);
  byId("adminPasswordSetupForm")?.classList.toggle("hidden", !passwordSetup);
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !unlocked));
  refreshDetailAdminButtons();
  updateAdminJobUi();
}

function showPasswordSetupUi(show = true) {
  byId("adminTools")?.classList.add("hidden");
  byId("adminLoginForm")?.classList.toggle("hidden", show);
  byId("adminPasswordSetupForm")?.classList.toggle("hidden", !show);
  if (show) {
    openAdminPopover();
    byId("adminNewPassword")?.focus();
  }
}

let notionSyncWasRunning = false;

async function updateCrawlUi() {
  const badge = byId("crawlStatusBadge");
  const startBtn = byId("crawlStartBtn");
  const openBtn = byId("adminOpenCrawlModal");
  if (!badge) return;
  try {
    const status = await window.TClientAdmin?.getCrawlStatus?.();
    const busy = Boolean(status?.busy);
    badge.classList.toggle("hidden", !busy);
    if (busy) {
      const who = status.requestedByEmail ? ` · ${status.requestedByEmail}` : "";
      badge.textContent = `크롤링 중${who}`;
      badge.title = "현재 크롤링 진행 중입니다";
    }
    for (const btn of [startBtn, openBtn]) {
      if (!btn) continue;
      btn.disabled = busy;
      btn.title = busy ? "현재 크롤링 진행 중입니다" : "";
    }
  } catch {
    badge.classList.add("hidden");
    if (startBtn) startBtn.disabled = false;
    if (openBtn) openBtn.disabled = false;
  }
}

async function updateNotionSyncUi() {
  const badge = byId("notionSyncStatusBadge");
  const syncBtn = byId("adminNotionSyncBtn");
  if (!badge) return;
  try {
    const status = await window.TClientAdmin?.getNotionSyncStatus?.();
    const busy = status?.status === "running";
    badge.classList.toggle("hidden", !busy);
    if (busy) {
      const who = status.requestedByEmail ? ` · ${status.requestedByEmail}` : "";
      badge.textContent = `노션 동기화 중${who}`;
      badge.title = status.message || "Notion DB를 T-client에 반영 중입니다";
    }
    if (syncBtn) {
      syncBtn.disabled = busy;
      syncBtn.title = busy ? "Notion 동기화 진행 중입니다" : "";
    }
    if (notionSyncWasRunning && !busy) {
      if (status?.status === "error") {
        showToast(status.message || "Notion 동기화에 실패했습니다.", "error");
      } else {
        await window.TSalesManagement?.loadAll?.(true);
        const changed = await window.TClientAdmin?.mergeRemoteOverrides?.();
        reloadRowsWithAdmin();
        refreshViews();
        if (changed && state.detailRow) paintDetailModal();
        showToast(status?.message || "Notion 동기화가 완료되었습니다.");
      }
    }
    notionSyncWasRunning = busy;
  } catch {
    badge.classList.add("hidden");
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.title = "";
    }
  }
}

async function updateAdminJobUi() {
  await updateCrawlUi();
  await updateNotionSyncUi();
}

function closeAdminPopover() {
  const pop = byId("adminPopover");
  const btn = byId("adminUnlockBtn");
  pop?.classList.add("hidden");
  pop?.setAttribute("aria-hidden", "true");
  btn?.setAttribute("aria-expanded", "false");
}

function openAdminPopover() {
  const pop = byId("adminPopover");
  const btn = byId("adminUnlockBtn");
  pop?.classList.remove("hidden");
  pop?.setAttribute("aria-hidden", "false");
  btn?.setAttribute("aria-expanded", "true");
}

function toggleAdminPopover() {
  const pop = byId("adminPopover");
  const btn = byId("adminUnlockBtn");
  const open = pop?.classList.toggle("hidden") === false;
  pop?.setAttribute("aria-hidden", open ? "false" : "true");
  btn?.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) byId("adminEmail")?.focus();
}

function renderCrawlKeywords() {
  const el = byId("crawlKeywordChips");
  if (!el || !window.TClientAdmin?.isUnlocked()) return;
  const labels = window.TClientAdmin.getActiveKeywordLabels();
  el.innerHTML = labels.length
    ? labels
        .map(
          (k) => `<span class="keyword-chip">${escapeHtml(k)}<button type="button" class="keyword-chip-remove" data-kw-remove="${escapeAttr(k)}" aria-label="제거">×</button></span>`
        )
        .join("")
    : `<span class="muted keyword-empty">활성 키워드 없음</span>`;
  el.querySelectorAll("[data-kw-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.TClientAdmin.removeKeywordDraft(btn.getAttribute("data-kw-remove"));
      renderCrawlKeywords();
    });
  });
}

function getSelectedCrawlSiteIds() {
  const grid = byId("crawlSiteGrid");
  if (!grid) return window.TClientAdmin.loadCrawlSitePrefs();
  return [...grid.querySelectorAll('input[type="checkbox"][data-site-id]:checked')].map((el) =>
    el.getAttribute("data-site-id")
  );
}

function renderCrawlSiteGrid() {
  const grid = byId("crawlSiteGrid");
  if (!grid || !window.TClientAdmin?.CRAWL_SITE_OPTIONS) return;
  const selected = new Set(window.TClientAdmin.loadCrawlSitePrefs());
  grid.innerHTML = window.TClientAdmin.CRAWL_SITE_OPTIONS.map((site) => {
    const meta = [site.api && "API", site.pw && "UI"].filter(Boolean).join("·");
    const checked = selected.has(site.id) ? "checked" : "";
    return `<label class="crawl-site-chip"><input type="checkbox" data-site-id="${escapeAttr(site.id)}" ${checked} /><span>${escapeHtml(site.label)}</span><span class="crawl-site-chip-meta">${escapeHtml(meta)}</span></label>`;
  }).join("");
  grid.querySelectorAll('input[type="checkbox"][data-site-id]').forEach((input) => {
    input.addEventListener("change", () => {
      window.TClientAdmin.saveCrawlSitePrefs(getSelectedCrawlSiteIds());
    });
  });
}

function paintCrawlModal() {
  if (!window.TClientAdmin?.isUnlocked()) return;
  renderCrawlKeywords();
  renderCrawlSiteGrid();
  const pw = byId("crawlUsePlaywright");
  const focus = byId("crawlFocus");
  if (pw) pw.checked = window.TClientAdmin.loadCrawlPlaywrightPref();
  if (focus) focus.value = window.TClientAdmin.loadCrawlFocusPref();
}

function openCrawlModal() {
  if (!window.TClientAdmin?.isUnlocked()) {
    showToast("관리자 로그인이 필요합니다.", "error");
    return;
  }
  closeAdminPopover();
  paintCrawlModal();
  const modal = byId("crawlModal");
  modal?.classList.remove("hidden");
  modal?.setAttribute("aria-hidden", "false");
  hydrateIcons(modal);
  byId("crawlKeywordInput")?.focus();
}

function closeCrawlModal() {
  const modal = byId("crawlModal");
  modal?.classList.add("hidden");
  modal?.setAttribute("aria-hidden", "true");
}

function bindCrawlModal() {
  byId("adminOpenCrawlModal")?.addEventListener("click", () => {
    openCrawlModal();
  });

  document.querySelectorAll("[data-close-crawl]").forEach((el) => {
    el.addEventListener("click", () => closeCrawlModal());
  });

  byId("crawlKeywordAddBtn")?.addEventListener("click", () => {
    const input = byId("crawlKeywordInput");
    const value = input?.value ?? "";
    if (!window.TClientAdmin.addKeywordDraft(value)) {
      showToast(value.trim() ? "이미 있는 키워드입니다." : "키워드를 입력하세요.", "error");
      return;
    }
    input.value = "";
    renderCrawlKeywords();
  });

  byId("crawlKeywordInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") byId("crawlKeywordAddBtn")?.click();
  });

  byId("crawlSitesSelectAll")?.addEventListener("click", () => {
    const ids = window.TClientAdmin.CRAWL_SITE_OPTIONS.map((s) => s.id);
    window.TClientAdmin.saveCrawlSitePrefs(ids);
    renderCrawlSiteGrid();
  });

  byId("crawlSitesClear")?.addEventListener("click", () => {
    window.TClientAdmin.saveCrawlSitePrefs([]);
    renderCrawlSiteGrid();
  });

  byId("crawlUsePlaywright")?.addEventListener("change", (e) => {
    window.TClientAdmin.saveCrawlPlaywrightPref(e.target.checked);
  });

  byId("crawlFocus")?.addEventListener("change", (e) => {
    window.TClientAdmin.saveCrawlFocusPref(e.target.value);
  });

  byId("crawlStartBtn")?.addEventListener("click", async () => {
    const siteIds = getSelectedCrawlSiteIds();
    if (!siteIds.length) {
      showToast("탐색 사이트를 하나 이상 선택하세요.", "error");
      return;
    }
    const keywords = window.TClientAdmin.getActiveKeywordLabels();
    if (!keywords.length) {
      showToast("검색 키워드를 하나 이상 추가하세요.", "error");
      return;
    }

    const usePlaywright = byId("crawlUsePlaywright")?.checked ?? true;
    const collectFocus = byId("crawlFocus")?.value ?? "startup";
    window.TClientAdmin.saveCrawlSitePrefs(siteIds);
    window.TClientAdmin.saveCrawlPlaywrightPref(usePlaywright);
    window.TClientAdmin.saveCrawlFocusPref(collectFocus);

    const dispatchPreview = window.TClientAdmin.buildCrawlDispatchOptions({
      siteIds,
      usePlaywright,
      collectFocus
    });
    if (!dispatchPreview.collectSites && (!dispatchPreview.collectPlaywright || !dispatchPreview.pwSites)) {
      showToast("선택한 사이트로 수집할 수 없습니다. Playwright를 켜거나 API 수집 사이트를 선택하세요.", "error");
      return;
    }

    const startBtn = byId("crawlStartBtn");
    if (startBtn) startBtn.disabled = true;
    showToast("크롤링 요청 중…");

    try {
      const status = await window.TClientAdmin.getCrawlStatus();
      if (status?.busy) {
        showToast("현재 크롤링 진행 중입니다.", "error");
        await updateAdminJobUi();
        return;
      }
      await window.TClientAdmin.flushPersist();
      await window.TClientAdmin.saveKeywordsToGitHub();
      await window.TClientAdmin.triggerCollect({ siteIds, usePlaywright, collectFocus });
      closeCrawlModal();
      showToast("크롤링이 시작되었습니다. 완료 시 이메일로 안내합니다.");
      await updateAdminJobUi();
    } catch (err) {
      showToast(err.message || String(err), "error");
      await updateAdminJobUi();
    } finally {
      if (startBtn) startBtn.disabled = false;
    }
  });
}

function bindAdmin() {
  byId("adminUnlockBtn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleAdminPopover();
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".admin-anchor")) closeAdminPopover();
  });

  byId("adminLoginBtn")?.addEventListener("click", async () => {
    const email = byId("adminEmail")?.value ?? "";
    const password = byId("adminPassword")?.value ?? "";
    try {
      await window.TClientAdmin.signIn(email, password);
      setAdminUi(true);
      setAdminStatus("");
      closeAdminPopover();
      reloadRowsWithAdmin();
      showToast("로그인되었습니다.");
      refreshViews();
    } catch (err) {
      showToast(err.message || String(err), "error");
    }
  });

  byId("adminSetupEmailBtn")?.addEventListener("click", async () => {
    const email = byId("adminEmail")?.value ?? "";
    if (!`${email}`.trim()) {
      showToast("이메일을 입력하세요.", "error");
      return;
    }
    try {
      await window.TClientAdmin.sendPasswordSetupEmail(email);
      showToast("비밀번호 설정 메일을 보냈습니다. 메일의 링크에서 비밀번호를 설정하세요.");
    } catch (err) {
      showToast(err.message || String(err), "error");
    }
  });

  byId("adminPasswordSaveBtn")?.addEventListener("click", async () => {
    const pwd = byId("adminNewPassword")?.value ?? "";
    const confirm = byId("adminConfirmPassword")?.value ?? "";
    if (pwd !== confirm) {
      showToast("비밀번호 확인이 일치하지 않습니다.", "error");
      return;
    }
    try {
      await window.TClientAdmin.updatePassword(pwd);
      showPasswordSetupUi(false);
      setAdminUi(true);
      setAdminStatus("");
      closeAdminPopover();
      await window.TClientAdmin.afterAuth?.();
      reloadRowsWithAdmin();
      showToast("비밀번호가 설정되었습니다. 이후부터는 이메일과 비밀번호로 로그인하세요.");
      refreshViews();
    } catch (err) {
      showToast(err.message || String(err), "error");
    }
  });

  byId("adminPassword")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") byId("adminLoginBtn")?.click();
  });

  byId("adminEmail")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") byId("adminPassword")?.focus();
  });

  byId("adminLogout")?.addEventListener("click", async () => {
    await window.TClientAdmin.lock();
    setAdminUi(false);
    setAdminStatus("");
    closeAdminPopover();
    refreshViews();
    if (state.detailRow) paintDetailModal();
  });

  window.TClientAdmin.setOnPersistStatus((status) => {
    if (status === "saved") showToast("저장되었습니다.");
    else if (status && status !== "idle" && status !== "pending" && status !== "saving") {
      showToast(`저장 실패: ${status}`, "error");
    }
  });

  window.addEventListener("beforeunload", () => {
    if (window.TClientAdmin?.isDirty?.()) {
      window.TClientAdmin.flushPersist();
    }
  });

  byId("adminNotionSyncBtn")?.addEventListener("click", async () => {
    if (!window.TClientAdmin?.isUnlocked?.()) {
      showToast("로그인이 필요합니다.", "error");
      return;
    }
    const syncBtn = byId("adminNotionSyncBtn");
    if (syncBtn) syncBtn.disabled = true;
    showToast("Notion 동기화 요청 중…");
    try {
      const status = await window.TClientAdmin.getNotionSyncStatus();
      if (status?.status === "running") {
        showToast("Notion 동기화 진행 중입니다.", "error");
        await updateNotionSyncUi();
        return;
      }
      await window.TClientAdmin.triggerNotionSync();
      closeAdminPopover();
      notionSyncWasRunning = true;
      showToast("Notion 동기화가 시작되었습니다. 완료되면 자동으로 새로고침됩니다.");
      await updateNotionSyncUi();
    } catch (err) {
      showToast(err.message || String(err), "error");
      await updateNotionSyncUi();
    } finally {
      if (syncBtn) syncBtn.disabled = false;
    }
  });

  bindCrawlModal();

  window.TAuth.onAuthStateChange(async (event) => {
    if (event === "PASSWORD_RECOVERY") {
      showPasswordSetupUi(true);
      setAdminStatus("");
      return;
    }
    await window.TClientAdmin.syncSession();
    setAdminUi(window.TClientAdmin.isUnlocked());
    if (window.TClientAdmin.isUnlocked()) {
      await window.TClientAdmin.afterAuth?.();
      await window.TCompanyUserState?.loadAll?.(true);
      reloadRowsWithAdmin();
    }
    refreshViews();
  });

  if (window.TClientAdmin.isUnlocked()) {
    setAdminUi(true);
  }
}

async function boot() {
  try {
    await window.TClientAdmin.initDoc();
    if (window.TSalesManagement?.loadAll) await window.TSalesManagement.loadAll(true);
    if (window.TCompanyEdits?.loadAll) await window.TCompanyEdits.loadAll(true);
    if (window.TCompanyUserState?.loadAll) await window.TCompanyUserState.loadAll(true);
    let snapshot = null;
    try {
      snapshot = await window.TSupabase.getLeadDashboard();
    } catch {
      snapshot = await window.TSupabase.getPublishedSnapshot();
    }
    if (!snapshot?.rows) throw new Error("스냅샷이 비어 있습니다. Lead Collector를 먼저 실행하세요.");
    state.snapshotGeneratedAt = snapshot.generatedAt ?? null;
    state.snapshotRows = snapshot.rows ?? [];
    state.newCompanyIds = new Set(snapshot.newCompanyIds ?? []);
    reloadRowsWithAdmin();
    state.dedupeCandidates = snapshot.dedupeCandidates ?? [];
    state.manualReviewQueue = snapshot.manualReviewQueue ?? [];
    state.failureSummary = snapshot.failureSummary ?? {};
    state.gradeSummary = snapshot.gradeSummary ?? {};

    hydrateIcons();

    ["search", "grade", "pipelineStage", "pipelineStatus", "contact", "exclude", "tier", "sort"].forEach((id) => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener("input", () => {
        state.activePreset = "";
        state.leadsPage = 1;
        state.postsPage = 1;
        renderPresets();
        refreshViews();
      });
    });

    bindModal();
    bindMergeModal();
    bindAddCompanyModal();
    bindAddPostModal();
    bindAdmin();
    refreshDetailAdminButtons();
    if (window.location.hash.includes("type=recovery")) {
      showPasswordSetupUi(true);
    }
    await updateAdminJobUi();
    setInterval(updateAdminJobUi, 30000);
    setInterval(async () => {
      if (document.hidden) return;
      if (!window.TClientAdmin?.isUnlocked?.()) return;
      if (window.TClientAdmin.isDirty?.()) return;
      try {
        await window.TSalesManagement?.loadAll?.(true);
        await window.TCompanyEdits?.loadAll?.(true);
        const changed = await window.TClientAdmin.mergeRemoteOverrides();
        reloadRowsWithAdmin();
        refreshViews();
        if (changed && state.detailRow) paintDetailModal();
      } catch {
        /* ignore poll errors */
      }
    }, 90000);
    renderPresets();
    bindTabs();
    byId("filterToggleBtn")?.addEventListener("click", () => toggleFilterAdvanced());
    byId("filterResetBtn")?.addEventListener("click", resetFilters);
    document.querySelector(".toolbar")?.classList.toggle("toolbar-candidates", ["new", "recommended", "in_progress"].includes(state.activeTab));
    const tabFromUrl = new URLSearchParams(window.location.search).get("tab");
    if (tabFromUrl && byId(tabFromUrl)) {
      document.querySelector(`.tabs .tab[data-tab="${tabFromUrl}"]`)?.click();
    }
    window.TUiSelect?.init();
    refreshViews();
  } catch (err) {
    byId("meta").textContent = "로드 실패";
    const msg = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    ["new", "recommended", "in_progress", "leads", "posts", "excluded"].forEach((id) => {
      const el = byId(id);
      if (el) el.innerHTML = msg;
    });
  }
}

window.openDetail = openDetail;
window.closeDetail = closeDetail;
window.paintDetailHeader = paintDetailHeader;
window.renderDetailTitleHtml = renderDetailTitleHtml;
window.refreshDetailAdminButtons = refreshDetailAdminButtons;
window.openAdminPopover = openAdminPopover;
window.deleteCompany = deleteCompany;
window.refreshViews = refreshViews;
window.TClientView = {
  sortRows,
  passesFilters,
  pipelineStageBadge,
  pipelineStatusBadge,
  pipelineCombinedCell: pipelineCombinedCell,
  candidateOpinionText,
  candidateOpinionHtml,
  serviceName,
  contactEmail,
  testPeriodDisplay,
  testPeriodHtml,
  displayName,
  renderStarRating,
  iconSvg,
  renderCompanyTable,
  renderCompanyCell,
  listableLeadRows,
  rowHasListablePresence,
  isListableLead,
  isMainTabLead,
  isShelvedLead,
  excludedTabRows
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void boot());
} else {
  void boot();
}
