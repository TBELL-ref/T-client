const state = {
  rawRows: [],
  rows: [],
  dedupeCandidates: [],
  manualReviewQueue: [],
  failureSummary: {},
  gradeSummary: {},
  activePreset: "",
  tableSort: { column: "priorityScore", direction: "desc" }
};

const PRESETS = [
  { id: "grade-a", label: "A등급", apply: () => setFilters({ grade: "A", exclude: "active" }, { keepPreset: true }) },
  { id: "proposal", label: "제안 추천", apply: () => setFilters({ action: "proposal", exclude: "active" }, { keepPreset: true }) },
  { id: "meeting", label: "미팅 추천", apply: () => setFilters({ action: "meeting", exclude: "active" }, { keepPreset: true }) },
  { id: "contact", label: "담당자 확보", apply: () => setFilters({ contact: "yes", exclude: "active" }, { keepPreset: true }) },
  { id: "startup", label: "스타트업·미확인", apply: () => setFilters({ tier: "startup", exclude: "active" }, { keepPreset: true }) },
  { id: "favorites", label: "즐겨찾기", apply: () => setFilters({ favorite: "yes", exclude: "active" }, { keepPreset: true }) },
  { id: "all", label: "전체", apply: () => setFilters({ grade: "", action: "", contact: "", exclude: "", tier: "", favorite: "" }, { keepPreset: true }) }
];

const GRADE_COLORS = { A: "#00c471", B: "#3b82f6", C: "#94a3b8" };

const byId = (id) => document.getElementById(id);

function iconSvg(name, size = 14) {
  if (window.TIcons?.svg) return window.TIcons.svg(name, { size });
  return "";
}

function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.dataset.icon;
    if (name) el.innerHTML = iconSvg(name, el.classList.contains("search-icon") ? 18 : 16);
  });
}

function displayName(row) {
  return row.companyNameKo || row.companyName || "-";
}

function favoriteStar(row, interactive = false) {
  if (!row.userFavorite && !interactive) return "";
  const filled = row.userFavorite ? "★" : "☆";
  const cls = row.userFavorite ? "star-on" : "star-off";
  if (!interactive || !window.TClientAdmin?.isUnlocked()) {
    return row.userFavorite ? `<span class="star ${cls}" title="즐겨찾기">${filled}</span>` : "";
  }
  return `<button type="button" class="star-btn ${cls}" data-fav="${escapeAttr(row.companyId)}" title="즐겨찾기">${filled}</button>`;
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

function renderProfileSection(row) {
  const p = row.profile ?? {};
  const rows = [
    ["법인명", p.companyNameLegal],
    ["사업자번호", p.bizNo],
    ["업태", p.bizType],
    ["종목", p.bizItem],
    ["기업규모", p.companyScale],
    ["사업자상태", p.bizStatus],
    ["등록일", p.foundedDate],
    ["종업원", p.employeeCount ? `${p.employeeCount}명` : ""],
    ["홈페이지", p.homepage ? `<a class="link" href="${escapeAttr(p.homepage)}" target="_blank" rel="noreferrer">${escapeHtml(p.homepage)}</a>` : ""],
    ["산업분류", p.industrySummary]
  ].filter(([, v]) => `${v ?? ""}`.trim());

  if (!rows.length) {
    return `<p class="muted">사업자·업종 정보 없음</p>`;
  }
  return `<table class="profile-table"><tbody>${rows
    .map(
      ([label, value]) =>
        `<tr><th>${escapeHtml(label)}</th><td>${typeof value === "string" && value.includes("<a ") ? value : escapeHtml(`${value}`)}</td></tr>`
    )
    .join("")}</tbody></table>`;
}

function sectionHead(title, editKey) {
  const admin = window.TClientAdmin?.isUnlocked();
  const btn = admin
    ? `<button type="button" class="btn-section-edit" data-toggle-edit="${editKey}">수정</button>`
    : "";
  return `<div class="section-head"><h3>${title}</h3>${btn}</div>`;
}

function actionSelect(id, value) {
  return `<select id="${id}"><option value="추천" ${value === "추천" ? "selected" : ""}>추천</option><option value="진행" ${value === "진행" ? "selected" : ""}>진행</option><option value="보류" ${value === "보류" ? "selected" : ""}>보류</option></select>`;
}

function renderScoreSection(row) {
  const breakdown = row.scoreBreakdown ?? [];
  if (!breakdown.length && !row.scoreReason) {
    return `<p class="muted">점수 정보 없음</p>`;
  }
  const lines = breakdown.length
    ? breakdown
        .map(
          (b) =>
            `<li><span class="score-label">${escapeHtml(b.label)}</span> <span class="score-pts">${escapeHtml(b.pts || "")}</span></li>`
        )
        .join("")
    : `<li class="muted">${escapeHtml(row.scoreReason)}</li>`;
  return `<ul class="score-breakdown">${lines}</ul><p class="score-total">합계 <strong>${escapeHtml(row.priorityScore)}</strong>점 · ${escapeHtml(row.leadGrade)}등급</p>`;
}

function saveAndRefreshDetail(companyId) {
  reloadRowsWithAdmin();
  refreshViews();
  const row = state.rows.find((r) => r.companyId === companyId);
  if (row) openDetail(row);
}

function bindDetailEdits(row) {
  const cid = row.companyId;
  const entry = () => window.TClientAdmin.getEntry(cid);

  document.querySelectorAll("[data-toggle-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.toggleEdit;
      byId(`edit-${key}`)?.classList.toggle("hidden");
    });
  });

  byId("save-contact")?.addEventListener("click", () => {
    window.TClientAdmin.setEntry(cid, {
      contact: {
        name: byId("edit-contact-name").value.trim(),
        email: byId("edit-contact-email").value.trim(),
        phone: byId("edit-contact-phone").value.trim()
      }
    });
    saveAndRefreshDetail(cid);
  });

  byId("save-profile")?.addEventListener("click", () => {
    window.TClientAdmin.setEntry(cid, {
      profile: {
        companyNameLegal: byId("edit-prof-legal").value.trim(),
        bizNo: byId("edit-prof-bizno").value.trim(),
        bizType: byId("edit-prof-type").value.trim(),
        bizItem: byId("edit-prof-item").value.trim(),
        companyScale: byId("edit-prof-scale").value.trim(),
        bizStatus: byId("edit-prof-status").value.trim(),
        foundedDate: byId("edit-prof-founded").value.trim(),
        employeeCount: byId("edit-prof-emp").value.trim(),
        homepage: byId("edit-prof-home").value.trim(),
        industrySummary: byId("edit-prof-industry").value.trim()
      },
      domain: byId("edit-prof-domain").value.trim()
    });
    saveAndRefreshDetail(cid);
  });

  byId("save-actions")?.addEventListener("click", () => {
    window.TClientAdmin.setEntry(cid, {
      actions: {
        proposal: byId("edit-act-proposal").value,
        meeting: byId("edit-act-meeting").value,
        inquiry: byId("edit-act-inquiry").value
      }
    });
    saveAndRefreshDetail(cid);
  });

  byId("save-classification")?.addEventListener("click", () => {
    window.TClientAdmin.setEntry(cid, {
      companyTier: byId("edit-tier").value,
      leadGrade: byId("edit-grade").value,
      companyNameKo: byId("edit-name-ko").value.trim(),
      hidden: byId("edit-hidden").checked,
      favorite: byId("edit-fav").checked,
      excludeReason: byId("edit-exclude").value.trim(),
      notes: byId("edit-notes").value.trim()
    });
    saveAndRefreshDetail(cid);
  });

  byId("save-score")?.addEventListener("click", () => {
    const parts = {};
    document.querySelectorAll(".score-part-input").forEach((inp) => {
      const v = inp.value.trim();
      if (v !== "") parts[inp.dataset.scorePart] = v;
    });
    const total = byId("edit-score-total").value.trim();
    if (total !== "") parts._total = total;
    window.TClientAdmin.setEntry(cid, { scoreParts: parts });
    saveAndRefreshDetail(cid);
    setAdminStatus("점수 반영됨 (로컬). GitHub 저장은 상단 관리.");
  });

  byId("save-post")?.addEventListener("click", () => {
    const title = byId("edit-post-title").value.trim();
    const url = byId("edit-post-url").value.trim();
    if (!url) return;
    const prev = entry().extraPosts ?? [];
    window.TClientAdmin.setEntry(cid, {
      extraPosts: [...prev, { title: title || "QA 공고", url, source: "manual", sourceLabel: "수동" }]
    });
    saveAndRefreshDetail(cid);
  });
}

function reloadRowsWithAdmin() {
  state.rows = state.rawRows.map((row) => {
    const enriched = enrichRow(row);
    return window.TClientAdmin ? window.TClientAdmin.applyToRow(enriched) : enriched;
  });
}

function toggleFavorite(companyId) {
  if (!window.TClientAdmin?.isUnlocked()) return;
  const entry = window.TClientAdmin.getEntry(companyId);
  window.TClientAdmin.setEntry(companyId, { favorite: !entry.favorite });
  reloadRowsWithAdmin();
  refreshViews();
}

function renderScoreEdit(row) {
  const breakdown = row.scoreBreakdown ?? [];
  if (!breakdown.length) return "";
  return breakdown
    .map((b) => {
      const defaultPts = `${b.pts ?? ""}`.replace(":", "") || "0";
      const val = b.override !== undefined && b.override !== "" ? b.override : "";
      return `<label>${escapeHtml(b.label)}
        <input type="number" class="score-part-input" data-score-part="${escapeAttr(b.part)}" value="${escapeAttr(val)}" placeholder="${escapeAttr(defaultPts)}" />
      </label>`;
    })
    .join("");
}

function rowTierClass(row) {
  if (row.companyTier === "enterprise") return " row-tier-enterprise";
  if (row.companyTier === "mid") return " row-tier-mid";
  return "";
}

function normalizeActions(row) {
  if (row.actions) return row.actions;
  const flag = (v) => (v === "yes" ? "추천" : "보류");
  return {
    proposal: { label: "제안", status: flag(row.reportRequired) },
    meeting: { label: "미팅", status: flag(row.meetingRequired) },
    inquiry: {
      label: "문의",
      status: row.contactSecured === "yes" && ["A", "B"].includes(row.leadGrade) ? "추천" : "보류"
    }
  };
}

function enrichRow(row) {
  const actions = normalizeActions(row);
  const actionSummary =
    row.actionSummary ||
    [actions.proposal, actions.meeting, actions.inquiry]
      .filter((a) => a.status === "추천" || a.status === "진행")
      .map((a) => a.label)
      .join(" · ") ||
    "보류";
  return { ...row, actions, actionSummary };
}

function renderActionBadges(actions, compact = false) {
  const items = [actions.proposal, actions.meeting, actions.inquiry];
  const badges = items
    .map((a) => {
      const cls =
        a.status === "추천"
          ? "action-recommend"
          : a.status === "진행"
            ? "action-progress"
            : "action-hold";
      const text = compact ? `${a.label} ${a.status}` : `${a.label} ${a.status}`;
      return `<span class="action-badge ${cls}">${escapeHtml(text)}</span>`;
    })
    .join("");
  return `<div class="action-badges">${badges}</div>`;
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
  refreshViews();
}

function passesFilters(row) {
  const q = byId("search").value.toLowerCase().trim();
  const grade = byId("grade").value;
  const action = byId("action").value;
  const contact = byId("contact").value;
  const exclude = byId("exclude").value;
  const actions = row.actions;

  const haystack = `${displayName(row)} ${row.companyName} ${row.domain} ${row.profile?.bizItem ?? ""} ${row.profile?.bizType ?? ""} ${row.profile?.companyScale ?? ""}`.toLowerCase();
  if (q && !haystack.includes(q)) return false;
  if (grade && row.leadGrade !== grade) return false;
  if (action === "proposal" && !["추천", "진행"].includes(actions.proposal.status)) return false;
  if (action === "meeting" && !["추천", "진행"].includes(actions.meeting.status)) return false;
  if (action === "inquiry" && !["추천", "진행"].includes(actions.inquiry.status)) return false;
  if (contact && row.contactSecured !== contact) return false;
  if (exclude === "active" && row.excluded) return false;
  if (exclude === "excluded" && !row.excluded) return false;
  const tierFilter = byId("tier")?.value;
  if (tierFilter === "startup" && !["startup", "unknown"].includes(row.companyTier)) return false;
  if (tierFilter === "enterprise" && row.companyTier !== "enterprise") return false;
  if (tierFilter === "mid" && row.companyTier !== "mid") return false;
  if (row.userHidden && !window.TClientAdmin?.isUnlocked()) return false;
  const favFilter = byId("favorite")?.value;
  if (favFilter === "yes" && !row.userFavorite) return false;
  if (!row.posts?.length) return false;
  return true;
}

function sortRows(rows) {
  const mode = byId("sort").value;
  const list = [...rows];

  list.sort((a, b) => {
    if (a.userFavorite !== b.userFavorite) return a.userFavorite ? -1 : 1;
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    if (mode === "name") return displayName(a).localeCompare(displayName(b), "ko");
    if (mode === "recent") return new Date(b.lastCollectedAt || 0) - new Date(a.lastCollectedAt || 0);
    if (mode === "grade") {
      const gradeOrder = { A: 3, B: 2, C: 1 };
      const diff = (gradeOrder[b.leadGrade] ?? 0) - (gradeOrder[a.leadGrade] ?? 0);
      if (diff !== 0) return diff;
    }
    return priorityValue(b) - priorityValue(a);
  });
  return list;
}

function computeGradeCounts() {
  const active = state.rows.filter((r) => !r.excluded && !r.userHidden);
  const counts = { A: 0, B: 0, C: 0 };
  for (const r of active) {
    if (counts[r.leadGrade] !== undefined) counts[r.leadGrade]++;
  }
  return counts;
}

function renderGradeDonut(counts) {
  const total = (counts.A || 0) + (counts.B || 0) + (counts.C || 0);
  if (!total) {
    return `<p class="muted">표시할 리드가 없습니다.</p>`;
  }
  const pctA = ((counts.A / total) * 100).toFixed(1);
  const pctB = ((counts.B / total) * 100).toFixed(1);
  const pctC = ((counts.C / total) * 100).toFixed(1);
  const endA = (counts.A / total) * 100;
  const endB = endA + (counts.B / total) * 100;
  const gradient = `conic-gradient(
    ${GRADE_COLORS.A} 0 ${endA}%,
    ${GRADE_COLORS.B} ${endA}% ${endB}%,
    ${GRADE_COLORS.C} ${endB}% 100%
  )`;

  const legend = ["A", "B", "C"]
    .map((g) => {
      const n = counts[g] || 0;
      const pct = total ? ((n / total) * 100).toFixed(1) : "0.0";
      return `<li>
        <span class="legend-dot" style="background:${GRADE_COLORS[g]}"></span>
        <span class="legend-grade grade-${g}">${g}</span>
        <span class="legend-count">${n}건</span>
        <span class="legend-pct">${pct}%</span>
      </li>`;
    })
    .join("");

  return `
    <div class="donut-panel">
      <div class="donut-ring" style="background:${gradient}" title="A ${pctA}% · B ${pctB}% · C ${pctC}%">
        <div class="donut-hole">
          <span class="donut-total">${total}</span>
          <span class="donut-label">활성 리드</span>
        </div>
      </div>
      <ul class="donut-legend">${legend}</ul>
    </div>`;
}

function renderDashboard() {
  const s = state.gradeSummary;
  const gradeCounts = computeGradeCounts();
  const totalCompanies = state.rows.filter((r) => !r.userHidden).length;
  const totalPosts = state.rows.reduce((n, r) => n + (r.posts?.length || 0), 0);
  const proposal = s.proposalRecommend ?? s.reportRequired ?? 0;
  const profile = s.profileComplete ?? 0;

  const stats = [
    { icon: "building", label: "수집 회사", value: totalCompanies, sub: "숨김 제외" },
    { icon: "briefcase", label: "QA 공고", value: totalPosts, sub: "전체 공고 수" },
    { icon: "target", label: "제안 추천", value: proposal, sub: "액션 기준" },
    { icon: "users", label: "프로필 확보", value: profile, sub: "사업자·업종" },
    { icon: "mail", label: "문의 추천", value: s.inquiryRecommend ?? 0, sub: "담당자·등급" },
    { icon: "layers", label: "제외", value: s.excluded ?? state.rows.filter((r) => r.excluded).length, sub: "비활성" }
  ];

  byId("dashboard").innerHTML = `
    <article class="dash-card dash-chart">
      <h2 class="dash-card-title">${iconSvg("chart", 18)} 등급 분포</h2>
      ${renderGradeDonut(gradeCounts)}
    </article>
    <div class="dash-stats">
      ${stats
        .map(
          (item) => `
        <div class="stat-card">
          <span class="stat-icon">${iconSvg(item.icon, 18)}</span>
          <span class="stat-label">${escapeHtml(item.label)}</span>
          <span class="stat-value">${item.value}</span>
          <span class="stat-sub">${escapeHtml(item.sub)}</span>
        </div>`
        )
        .join("")}
    </div>`;
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

function renderLeadsTable() {
  const filtered = sortRows(state.rows.filter(passesFilters));
  byId("resultCount").textContent = `${filtered.length}건 / 전체 ${state.rows.length}건`;

  if (!filtered.length) {
    byId("leads").innerHTML = '<div class="empty-state">조건에 맞는 리드가 없습니다.</div>';
    return;
  }

  byId("leads").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>회사</th>
            <th>공고</th>
            <th>우선순위</th>
            <th>등급</th>
            <th>다음 액션</th>
            <th>담당자</th>
            <th>수집일</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${filtered
            .map(
              (row, idx) => `
            <tr class="${row.excluded ? "row-excluded" : ""}${row.userHidden ? " row-hidden-admin" : ""}${hasFailedPosts(row) ? " row-failure" : ""}${rowTierClass(row)}">
              <td class="cell-company">
                <div class="company-line">
                  ${favoriteStar(row, true)}
                  <strong>${escapeHtml(displayName(row))}</strong>
                  ${tierBadge(row)}
                  ${scaleBadge(row)}
                  ${bizStatusBadge(row)}
                </div>
                <span class="company-sub">${escapeHtml(companySubline(row))}</span>
              </td>
              <td>${row.posts.length}건</td>
              <td><strong>${row.priorityScore}</strong></td>
              <td><span class="badge grade-${row.leadGrade}">${row.leadGrade}</span></td>
              <td class="cell-actions">${renderActionBadges(row.actions, true)}</td>
              <td><span class="badge">${contactDisplay(row)}</span></td>
              <td>${formatDate(row.lastCollectedAt)}</td>
              <td><button type="button" class="btn-detail" data-detail="${idx}">상세</button></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  filtered.forEach((row, idx) => {
    byId("leads").querySelector(`[data-detail="${idx}"]`)?.addEventListener("click", () => openDetail(row));
    byId("leads").querySelector(`[data-fav="${row.companyId}"]`)?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(row.companyId);
    });
  });
}

function openDetail(row) {
  const modal = byId("detailModal");
  const e = window.TClientAdmin?.getEntry(row.companyId) ?? {};
  const p = { ...(row.profile ?? {}), ...(e.profile ?? {}) };
  const c = row.contact ?? {};
  const admin = window.TClientAdmin?.isUnlocked();
  const reasons = row.actionReasons ?? [];

  byId("detailTitle").textContent = displayName(row);

  byId("detailBody").innerHTML = `
    <section class="detail-section">
      ${sectionHead("분류 · 등급", "classify")}
      <p><strong>${escapeHtml(displayName(row))}</strong> ${tierBadge(row)} <span class="badge grade-${row.leadGrade}">${row.leadGrade}</span></p>
      <p class="muted">${escapeHtml(companySubline(row))} · ${row.priorityScore}점</p>
      ${
        admin
          ? `<div id="edit-classify" class="section-edit hidden">
        <div class="admin-form compact">
          <label>표시 회사명 <input type="text" id="edit-name-ko" value="${escapeAttr(e.companyNameKo || row.companyNameKo || "")}" /></label>
          <label>규모(中·小·大)
            <select id="edit-tier">
              <option value="">(자동)</option>
              <option value="startup" ${(e.companyTier || row.companyTier) === "startup" ? "selected" : ""}>소·스타트업</option>
              <option value="mid" ${(e.companyTier || row.companyTier) === "mid" ? "selected" : ""}>중견</option>
              <option value="enterprise" ${(e.companyTier || row.companyTier) === "enterprise" ? "selected" : ""}>대기업</option>
              <option value="unknown" ${(e.companyTier || row.companyTier) === "unknown" ? "selected" : ""}>미확인</option>
            </select>
          </label>
          <label>등급 <select id="edit-grade"><option value="">(유지)</option><option value="A" ${(e.leadGrade || row.leadGrade) === "A" ? "selected" : ""}>A</option><option value="B" ${(e.leadGrade || row.leadGrade) === "B" ? "selected" : ""}>B</option><option value="C" ${(e.leadGrade || row.leadGrade) === "C" ? "selected" : ""}>C</option></select></label>
          <label><input type="checkbox" id="edit-fav" ${row.userFavorite ? "checked" : ""} /> 즐겨찾기</label>
          <label><input type="checkbox" id="edit-hidden" ${e.hidden ? "checked" : ""} /> 목록 숨김</label>
          <label>제외 사유 <input type="text" id="edit-exclude" value="${escapeAttr(e.excludeReason ?? row.excludeReason ?? "")}" /></label>
          <label>메모 <textarea id="edit-notes" rows="2">${escapeHtml(e.notes ?? row.manualNotes ?? "")}</textarea></label>
          <button type="button" class="btn-primary btn-sm" id="save-classification">적용</button>
        </div>
      </div>`
          : ""
      }
    </section>

    <section class="detail-section">
      ${sectionHead("담당자", "contact")}
      <p>${c.name ? `<strong>${escapeHtml(c.name)}</strong> · ` : ""}${row.email ? escapeHtml(row.email) : "<span class=\"muted\">이메일 없음</span>"}${c.phone ? ` · ${escapeHtml(c.phone)}` : ""}</p>
      ${
        admin
          ? `<div id="edit-contact" class="section-edit hidden">
        <div class="admin-form compact">
          <label>이름 <input type="text" id="edit-contact-name" value="${escapeAttr(c.name ?? "")}" /></label>
          <label>이메일 <input type="email" id="edit-contact-email" value="${escapeAttr(c.email ?? row.email ?? "")}" /></label>
          <label>전화 <input type="tel" id="edit-contact-phone" value="${escapeAttr(c.phone ?? "")}" /></label>
          <button type="button" class="btn-primary btn-sm" id="save-contact">적용</button>
        </div>
      </div>`
          : ""
      }
    </section>

    <section class="detail-section">
      ${sectionHead("회사 프로필", "profile")}
      ${renderProfileSection(row)}
      ${
        admin
          ? `<div id="edit-profile" class="section-edit hidden">
        <div class="admin-form compact">
          <label>도메인 <input type="text" id="edit-prof-domain" value="${escapeAttr(e.domain || row.domain || "")}" placeholder="example.com" /></label>
          <label>법인명 <input type="text" id="edit-prof-legal" value="${escapeAttr(p.companyNameLegal ?? "")}" /></label>
          <label>사업자번호 <input type="text" id="edit-prof-bizno" value="${escapeAttr(p.bizNo ?? "")}" /></label>
          <label>업태 <input type="text" id="edit-prof-type" value="${escapeAttr(p.bizType ?? "")}" /></label>
          <label>종목 <input type="text" id="edit-prof-item" value="${escapeAttr(p.bizItem ?? "")}" /></label>
          <label>기업규모 <input type="text" id="edit-prof-scale" value="${escapeAttr(p.companyScale ?? "")}" placeholder="중소기업" /></label>
          <label>사업자상태 <input type="text" id="edit-prof-status" value="${escapeAttr(p.bizStatus ?? "")}" /></label>
          <label>등록일 <input type="text" id="edit-prof-founded" value="${escapeAttr(p.foundedDate ?? "")}" /></label>
          <label>종업원 <input type="text" id="edit-prof-emp" value="${escapeAttr(p.employeeCount ?? "")}" /></label>
          <label>홈페이지 <input type="url" id="edit-prof-home" value="${escapeAttr(p.homepage ?? "")}" /></label>
          <label>산업분류 <input type="text" id="edit-prof-industry" value="${escapeAttr(p.industrySummary ?? "")}" /></label>
          <button type="button" class="btn-primary btn-sm" id="save-profile">적용</button>
        </div>
      </div>`
          : ""
      }
    </section>

    <section class="detail-section">
      ${sectionHead("다음 액션", "actions")}
      <div class="action-row">${renderActionBadges(row.actions)}</div>
      <ul class="reason-list">${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
      ${
        admin
          ? `<div id="edit-actions" class="section-edit hidden">
        <div class="admin-form compact action-edit-grid">
          <label>제안 ${actionSelect("edit-act-proposal", row.actions.proposal.status)}</label>
          <label>미팅 ${actionSelect("edit-act-meeting", row.actions.meeting.status)}</label>
          <label>문의 ${actionSelect("edit-act-inquiry", row.actions.inquiry.status)}</label>
          <button type="button" class="btn-primary btn-sm" id="save-actions">적용</button>
        </div>
      </div>`
          : ""
      }
    </section>

    <section class="detail-section">
      ${sectionHead(`QA 채용 공고 (${row.posts.length}건)`, "posts")}
      <table>
        <thead><tr><th>공고</th><th>출처</th><th>링크</th></tr></thead>
        <tbody>
          ${row.posts
            .map(
              (post) => `
            <tr>
              <td>${escapeHtml(post.title)}</td>
              <td>${escapeHtml(post.sourceLabel || post.source)}</td>
              <td><a class="link" href="${escapeAttr(post.url)}" target="_blank" rel="noreferrer">${iconSvg("external", 14)} 열기</a></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
      ${
        admin
          ? `<div id="edit-posts" class="section-edit hidden">
        <div class="admin-form compact">
          <label>공고 제목 <input type="text" id="edit-post-title" placeholder="QA 엔지니어" /></label>
          <label>URL <input type="url" id="edit-post-url" placeholder="https://..." /></label>
          <button type="button" class="btn-primary btn-sm" id="save-post">공고 추가</button>
        </div>
      </div>`
          : ""
      }
    </section>

    <section class="detail-section muted-box">
      ${sectionHead("점수 근거", "score")}
      ${renderScoreSection(row)}
      ${
        admin
          ? `<div id="edit-score" class="section-edit hidden">
        <div class="admin-form compact">
          ${renderScoreEdit(row)}
          <label>총점 직접 입력 <input type="number" id="edit-score-total" value="${escapeAttr(row.priorityScore)}" min="0" max="200" /></label>
          <p class="muted">항목·총점 비우면 자동 계산. 규모 변경은 「분류·등급 → 적용」으로 즉시 반영.</p>
          <button type="button" class="btn-primary btn-sm" id="save-score">적용</button>
        </div>
      </div>`
          : ""
      }
    </section>
    ${row.excludeReason ? `<p class="warn">제외: ${escapeHtml(row.excludeReason)}</p>` : ""}
  `;

  if (admin) bindDetailEdits(row);
  hydrateIcons(modal);
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeDetail() {
  const modal = byId("detailModal");
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function bindModal() {
  const modal = byId("detailModal");
  if (!modal) return;

  modal.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      closeDetail();
    });
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal || e.target.classList.contains("modal-backdrop")) {
      closeDetail();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
  });
}

function renderGroups() {
  const sorted = sortRows(state.rows.filter((r) => !r.excluded && passesFilters(r)));
  if (!sorted.length) {
    byId("groups").innerHTML = '<div class="empty-state">표시할 회사가 없습니다.</div>';
    return;
  }

  byId("groups").innerHTML = sorted
    .map(
      (row, idx) => `
    <div class="group-block">
      <div class="group-header" data-group="${idx}">
        <div>
          <strong>${escapeHtml(displayName(row))}</strong>
          ${tierBadge(row)}
          <span class="badge grade-${row.leadGrade}">${row.leadGrade}</span>
          <span class="badge">${row.actionSummary}</span>
        </div>
        <span>${iconSvg("chevron")} ${row.posts.length}건</span>
      </div>
      <div class="group-body hidden" id="group-${idx}">
        <table>
          <thead><tr><th>공고</th><th>출처</th><th>링크</th></tr></thead>
          <tbody>
            ${row.posts
              .map(
                (p) => `
              <tr class="${p.failureReason ? "row-failure" : ""}">
                <td>${escapeHtml(p.title)}</td>
                <td>${escapeHtml(p.sourceLabel || p.source)}</td>
                <td><a class="link" href="${escapeAttr(p.url)}" target="_blank" rel="noreferrer">${iconSvg("external", 14)}</a></td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>`
    )
    .join("");

  byId("groups").querySelectorAll(".group-header").forEach((header) => {
    header.addEventListener("click", () => byId(`group-${header.dataset.group}`).classList.toggle("hidden"));
  });
}

function renderDedupe() {
  const rows = state.dedupeCandidates;
  if (!rows.length) {
    byId("dedupe").innerHTML = '<div class="empty-state">중복 후보가 없습니다.</div>';
    return;
  }

  byId("dedupe").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>회사 A</th><th>회사 B</th><th>근거</th><th>상태</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (c) => `
            <tr>
              <td><strong>${escapeHtml(c.company_name_left || companyNameById(c.company_id_left))}</strong></td>
              <td><strong>${escapeHtml(c.company_name_right || companyNameById(c.company_id_right))}</strong></td>
              <td class="score-reason">${escapeHtml(c.match_basis)}</td>
              <td><span class="badge">${escapeHtml(c.review_status)}</span></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderManualQueue() {
  const items = state.manualReviewQueue;
  if (!items.length) {
    byId("manual").innerHTML = '<div class="empty-state">수동 검토 대기 없음</div>';
    return;
  }

  byId("manual").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>URL</th><th>분류</th><th>사유</th><th>재시도</th></tr></thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr class="row-failure">
              <td><a class="link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></td>
              <td>${escapeHtml(item.failureCategory || "-")}</td>
              <td class="reason-text">${escapeHtml(item.failureReason || "-")}</td>
              <td>${item.retryCount ?? 0}회</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
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

function bindTabs() {
  document.querySelectorAll(".tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs .tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      ["leads", "groups", "dedupe", "manual"].forEach((id) => byId(id).classList.add("hidden"));
      byId(btn.dataset.tab).classList.remove("hidden");
    });
  });
}

function refreshViews() {
  renderKpi();
  renderLeadsTable();
  renderGroups();
}

function setAdminStatus(msg) {
  const el = byId("adminStatus");
  if (el) el.textContent = msg;
}

function setAdminUi(unlocked) {
  byId("adminBadge")?.classList.toggle("hidden", !unlocked);
  byId("adminTools")?.classList.toggle("hidden", !unlocked);
  byId("adminLoginForm")?.classList.toggle("hidden", unlocked);
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !unlocked));
}

function closeAdminPopover() {
  const pop = byId("adminPopover");
  const btn = byId("adminUnlockBtn");
  pop?.classList.add("hidden");
  pop?.setAttribute("aria-hidden", "true");
  btn?.setAttribute("aria-expanded", "false");
}

function toggleAdminPopover() {
  const pop = byId("adminPopover");
  const btn = byId("adminUnlockBtn");
  const open = pop?.classList.toggle("hidden") === false;
  pop?.setAttribute("aria-hidden", open ? "false" : "true");
  btn?.setAttribute("aria-expanded", open ? "true" : "false");
  if (open && window.TClientAdmin.isUnlocked()) setAdminUi(true);
  if (open) byId("adminPassword")?.focus();
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
    const pw = byId("adminPassword").value;
    if (await window.TClientAdmin.unlock(pw)) {
      setAdminUi(true);
      setAdminStatus("관리자 모드");
      byId("adminPassword").value = "";
      refreshViews();
    } else {
      setAdminStatus("키가 올바르지 않습니다.");
    }
  });

  byId("adminPassword")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") byId("adminLoginBtn")?.click();
  });

  byId("adminLogout")?.addEventListener("click", () => {
    window.TClientAdmin.lock();
    setAdminUi(false);
    setAdminStatus("");
    closeAdminPopover();
    refreshViews();
  });

  byId("adminSaveGithub")?.addEventListener("click", async () => {
    setAdminStatus("저장 요청 중…");
    try {
      await window.TClientAdmin.saveToGitHub();
      setAdminStatus("반영됨 (1~2분 후 새로고침)");
    } catch (err) {
      setAdminStatus(err.message || String(err));
    }
  });

  byId("adminExport")?.addEventListener("click", () => window.TClientAdmin.exportJson());
  byId("adminImport")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await window.TClientAdmin.importJson(file);
      reloadRowsWithAdmin();
      refreshViews();
      setAdminStatus("가져오기 완료");
    } catch {
      setAdminStatus("JSON 형식 오류");
    }
    e.target.value = "";
  });

  if (window.TClientAdmin.isUnlocked()) setAdminUi(true);
}

async function boot() {
  try {
    await window.TClientAdmin.initDoc();
    const res = await fetch("./data/snapshot.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snapshot = await res.json();
    state.rawRows = snapshot.rows ?? [];
    state.rows = state.rawRows.map((row) => window.TClientAdmin.applyToRow(enrichRow(row)));
    state.dedupeCandidates = snapshot.dedupeCandidates ?? [];
    state.manualReviewQueue = snapshot.manualReviewQueue ?? [];
    state.failureSummary = snapshot.failureSummary ?? {};
    state.gradeSummary = snapshot.gradeSummary ?? {};

    byId("meta").innerHTML = `<strong>T-client</strong><span>${formatDate(snapshot.generatedAt)} 갱신</span><span>회사 ${snapshot.totalCompanies || 0} · 공고 ${snapshot.totalPosts || 0}</span>`;

    hydrateIcons();

    ["search", "grade", "action", "contact", "exclude", "tier", "favorite", "sort"].forEach((id) => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener("input", () => {
        state.activePreset = "";
        renderPresets();
        refreshViews();
      });
    });

    bindModal();
    bindAdmin();
    renderPresets();
    bindTabs();
    refreshViews();
    renderDedupe();
    renderManualQueue();
  } catch (err) {
    byId("meta").textContent = "로드 실패";
    byId("leads").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

boot();
