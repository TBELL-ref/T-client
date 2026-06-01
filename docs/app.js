const state = {
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
  { id: "all", label: "전체", apply: () => setFilters({ grade: "", action: "", contact: "", exclude: "" }, { keepPreset: true }) }
];

const byId = (id) => document.getElementById(id);

function iconSvg(name) {
  const icons = {
    chevron:
      '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2" d="M9 6l6 6-6 6"/></svg>',
    external:
      '<svg viewBox="0 0 24 24" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="2" d="M14 3h7v7M10 14L21 3M21 14v7H3V3h7"/></svg>'
  };
  return icons[name] ?? "";
}

function displayName(row) {
  return row.companyNameKo || row.companyName || "-";
}

function tierBadge(row) {
  const label = row.companyTierLabel || "-";
  const tier = row.companyTier || "unknown";
  if (label === "-") return "";
  return `<span class="tier-badge tier-${tier}" title="기업 규모">${escapeHtml(label)}</span>`;
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
      .filter((a) => a.status === "추천")
      .map((a) => a.label)
      .join(" · ") ||
    "보류";
  return { ...row, actions, actionSummary };
}

function renderActionBadges(actions, compact = false) {
  const items = [actions.proposal, actions.meeting, actions.inquiry];
  const badges = items
    .map((a) => {
      const cls = a.status === "추천" ? "action-recommend" : "action-hold";
      const text = compact ? `${a.label} ${a.status}` : `${a.label} ${a.status}`;
      return `<span class="action-badge ${cls}">${escapeHtml(text)}</span>`;
    })
    .join("");
  return `<div class="action-badges">${badges}</div>`;
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

  const haystack = `${displayName(row)} ${row.companyName} ${row.domain}`.toLowerCase();
  if (q && !haystack.includes(q)) return false;
  if (grade && row.leadGrade !== grade) return false;
  if (action === "proposal" && actions.proposal.status !== "추천") return false;
  if (action === "meeting" && actions.meeting.status !== "추천") return false;
  if (action === "inquiry" && actions.inquiry.status !== "추천") return false;
  if (contact && row.contactSecured !== contact) return false;
  if (exclude === "active" && row.excluded) return false;
  if (exclude === "excluded" && !row.excluded) return false;
  return true;
}

function sortRows(rows) {
  const mode = byId("sort").value;
  const list = [...rows];

  list.sort((a, b) => {
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

function renderKpi() {
  const s = state.gradeSummary;
  const items = [
    { label: "A", value: s.A ?? 0 },
    { label: "B", value: s.B ?? 0 },
    { label: "C", value: s.C ?? 0 },
    { label: "제안 추천", value: s.proposalRecommend ?? s.reportRequired ?? 0 },
    { label: "미팅 추천", value: s.meetingRecommend ?? s.meetingRequired ?? 0 },
    { label: "문의 추천", value: s.inquiryRecommend ?? 0 }
  ];
  byId("kpi").innerHTML = items
    .map((item) => `<div class="kpi-card"><div class="kpi-label">${item.label}</div><div class="kpi-value">${item.value}</div></div>`)
    .join("");
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
            <tr class="${row.excluded ? "row-excluded" : ""}${hasFailedPosts(row) ? " row-failure" : ""}">
              <td class="cell-company">
                <div class="company-line">
                  <strong>${escapeHtml(displayName(row))}</strong>
                  ${tierBadge(row)}
                </div>
                <span>${escapeHtml(row.companyName !== displayName(row) ? row.companyName : row.domain || "-")}</span>
              </td>
              <td>${row.posts.length}건</td>
              <td><strong>${row.priorityScore}</strong></td>
              <td><span class="badge grade-${row.leadGrade}">${row.leadGrade}</span></td>
              <td class="cell-actions">${renderActionBadges(row.actions, true)}</td>
              <td><span class="badge">${row.contactSecured === "yes" ? "확보" : "미확보"}</span></td>
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
  });
}

function openDetail(row) {
  const modal = byId("detailModal");
  byId("detailTitle").textContent = displayName(row);
  const reasons = row.actionReasons ?? [
    row.actions.proposal.status === "추천" ? "제안 발송을 추천합니다." : null,
    row.actions.meeting.status === "추천" ? "초기 미팅을 추천합니다." : null,
    row.actions.inquiry.status === "추천" ? "이메일 문의를 추천합니다." : null
  ].filter(Boolean);

  byId("detailBody").innerHTML = `
    <section class="detail-section">
      <h3>회사</h3>
      <p><strong>${escapeHtml(displayName(row))}</strong> ${row.companyName !== displayName(row) ? `(${escapeHtml(row.companyName)})` : ""} ${tierBadge(row)}</p>
      <p class="muted">${escapeHtml(row.domain || "도메인 없음")} · ${row.leadGrade}등급 · ${row.priorityScore}점${row.companyTierLabel && row.companyTierLabel !== "-" ? ` · ${row.companyTierLabel}기업` : ""}</p>
      ${row.email ? `<p>${escapeHtml(row.email)} <span class="badge confidence-${row.emailConfidence}">${row.emailConfidence}</span></p>` : ""}
    </section>
    <section class="detail-section">
      <h3>다음 액션</h3>
      <div class="action-row">${renderActionBadges(row.actions)}</div>
      <ul class="reason-list">${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
    </section>
    <section class="detail-section">
      <h3>QA 채용 공고 (${row.posts.length}건)</h3>
      <table>
        <thead><tr><th>공고</th><th>출처</th><th>링크</th></tr></thead>
        <tbody>
          ${row.posts
            .map(
              (p) => `
            <tr>
              <td>${escapeHtml(p.title)}${p.failureReason ? `<div class="reason-text">${escapeHtml(p.failureReason)}</div>` : ""}</td>
              <td>${escapeHtml(p.sourceLabel || p.source)}</td>
              <td><a class="link" href="${escapeAttr(p.url)}" target="_blank" rel="noreferrer">${iconSvg("external")} 열기</a></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </section>
    ${
      row.scoreReason
        ? `<section class="detail-section muted-box"><h3>점수 근거</h3><p class="score-reason">${escapeHtml(row.scoreReason)}</p></section>`
        : ""
    }
    ${row.excludeReason ? `<p class="warn">제외: ${escapeHtml(row.excludeReason)}</p>` : ""}
  `;
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
                <td><a class="link" href="${escapeAttr(p.url)}" target="_blank" rel="noreferrer">${iconSvg("external")}</a></td>
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
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
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

async function boot() {
  try {
    const res = await fetch("./data/snapshot.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snapshot = await res.json();
    state.rows = (snapshot.rows ?? []).map(enrichRow);
    state.dedupeCandidates = snapshot.dedupeCandidates ?? [];
    state.manualReviewQueue = snapshot.manualReviewQueue ?? [];
    state.failureSummary = snapshot.failureSummary ?? {};
    state.gradeSummary = snapshot.gradeSummary ?? {};

    byId("meta").innerHTML = `<div>${formatDate(snapshot.generatedAt)}</div><div>회사 ${snapshot.totalCompanies || 0} · 공고 ${snapshot.totalPosts || 0}</div>`;

    ["search", "grade", "action", "contact", "exclude", "sort"].forEach((id) => {
      byId(id).addEventListener("input", () => {
        state.activePreset = "";
        renderPresets();
        refreshViews();
      });
    });

    bindModal();
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
