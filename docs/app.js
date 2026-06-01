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
  { id: "report", label: "리포트 필요", apply: () => setFilters({ report: "yes", exclude: "active" }, { keepPreset: true }) },
  { id: "meeting", label: "미팅 필요", apply: () => setFilters({ meeting: "yes", exclude: "active" }, { keepPreset: true }) },
  { id: "contact", label: "담당자 확보", apply: () => setFilters({ contact: "yes", exclude: "active" }, { keepPreset: true }) },
  { id: "failures", label: "수집 실패 포함", apply: () => setFilters({ grade: "", stage: "", contact: "", report: "", meeting: "", exclude: "active" }, { keepPreset: true }) },
  { id: "all", label: "전체", apply: () => setFilters({ grade: "", stage: "", contact: "", report: "", meeting: "", exclude: "" }, { keepPreset: true }) }
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

function companyNameById(id) {
  const row = state.rows.find((r) => r.companyId === id);
  return row ? row.companyName : id;
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
  const stage = byId("stage").value;
  const contact = byId("contact").value;
  const report = byId("report").value;
  const meeting = byId("meeting").value;
  const exclude = byId("exclude").value;

  const haystack = `${row.companyName} ${row.domain} ${row.email}`.toLowerCase();
  if (q && !haystack.includes(q)) return false;
  if (grade && row.leadGrade !== grade) return false;
  if (stage && row.salesStage !== stage) return false;
  if (contact && row.contactSecured !== contact) return false;
  if (report && row.reportRequired !== report) return false;
  if (meeting && row.meetingRequired !== meeting) return false;
  if (exclude === "active" && row.excluded) return false;
  if (exclude === "excluded" && !row.excluded) return false;
  if (state.activePreset === "failures" && !hasFailedPosts(row)) return false;
  return true;
}

function sortRows(rows) {
  const mode = byId("sort").value;
  const list = [...rows];

  if (mode === "priority" || mode === "grade" || mode === "recent" || mode === "name") {
    list.sort((a, b) => {
      if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
      if (mode === "name") return a.companyName.localeCompare(b.companyName, "ko");
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

  const { column, direction } = state.tableSort;
  const factor = direction === "asc" ? 1 : -1;
  list.sort((a, b) => {
    const av = a[column] ?? "";
    const bv = b[column] ?? "";
    if (column === "priorityScore") return (priorityValue(a) - priorityValue(b)) * factor;
    if (column === "lastCollectedAt") {
      return (new Date(av || 0) - new Date(bv || 0)) * factor;
    }
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return `${av}`.localeCompare(`${bv}`, "ko") * factor;
  });
  return list;
}

function yesNo(value) {
  return value === "yes" ? "예" : "아니오";
}

function renderKpi() {
  const s = state.gradeSummary;
  const items = [
    { label: "A 등급", value: s.A ?? 0 },
    { label: "B 등급", value: s.B ?? 0 },
    { label: "C 등급", value: s.C ?? 0 },
    { label: "담당자 확보", value: s.contactSecured ?? 0 },
    { label: "리포트 필요", value: s.reportRequired ?? 0 },
    { label: "수동 검토", value: state.manualReviewQueue.length }
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
      const preset = PRESETS.find((p) => p.id === state.activePreset);
      preset?.apply();
      renderPresets();
    });
  });
}

function sortHeader(column, label) {
  const active = state.tableSort.column === column;
  const indicator = active ? (state.tableSort.direction === "asc" ? "▲" : "▼") : "";
  return `<th class="sortable" data-col="${column}">${label}<span class="sort-indicator">${indicator}</span></th>`;
}

function renderLeadsTable() {
  const filtered = sortRows(state.rows.filter(passesFilters));
  byId("resultCount").textContent = `${filtered.length}건 표시 / 전체 ${state.rows.length}건`;

  if (!filtered.length) {
    byId("leads").innerHTML = '<div class="empty-state">조건에 맞는 리드가 없습니다.</div>';
    return;
  }

  byId("leads").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            ${sortHeader("companyName", "회사")}
            ${sortHeader("priorityScore", "우선순위")}
            ${sortHeader("leadGrade", "등급")}
            ${sortHeader("salesStage", "단계")}
            <th>담당자</th>
            <th>이메일</th>
            <th>리포트</th>
            <th>미팅</th>
            ${sortHeader("lastCollectedAt", "마지막 수집")}
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          ${filtered
            .map(
              (row) => `
            <tr class="${row.excluded ? "row-excluded" : ""}${hasFailedPosts(row) ? " row-failure" : ""}">
              <td class="cell-company">
                <strong>${escapeHtml(row.companyName)}</strong>
                <span>${escapeHtml(row.domain || "-")}</span>
              </td>
              <td><strong>${row.priorityScore}</strong></td>
              <td><span class="badge grade-${row.leadGrade}">${row.leadGrade}</span></td>
              <td><span class="badge stage-${row.salesStage}">${row.salesStage}</span></td>
              <td><span class="badge">${row.contactSecured === "yes" ? "확보" : "미확보"}</span></td>
              <td>
                ${escapeHtml(row.email || "-")}
                <div><span class="badge confidence-${row.emailConfidence}">${row.emailConfidence}</span></div>
              </td>
              <td>${yesNo(row.reportRequired)}</td>
              <td>${yesNo(row.meetingRequired)}</td>
              <td>${formatDate(row.lastCollectedAt)}</td>
              <td>
                ${row.manualOverrideLocked ? '<span class="badge locked">수동</span> ' : ""}
                ${row.excludeReason ? `<div class="reason-text">${escapeHtml(row.excludeReason)}</div>` : ""}
                ${hasFailedPosts(row) ? `<div class="reason-text">실패 공고 ${row.posts.filter((p) => p.failureReason).length}건</div>` : ""}
                ${row.scoreReason ? `<div class="score-reason">${escapeHtml(row.scoreReason)}</div>` : ""}
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  byId("leads").querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (state.tableSort.column === col) {
        state.tableSort.direction = state.tableSort.direction === "asc" ? "desc" : "asc";
      } else {
        state.tableSort = { column: col, direction: "desc" };
      }
      byId("sort").value = "priority";
      renderLeadsTable();
    });
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
          <strong>${escapeHtml(row.companyName)}</strong>
          <span class="badge grade-${row.leadGrade}">${row.leadGrade}</span>
          <span class="badge">${row.priorityScore}점</span>
        </div>
        <span>${iconSvg("chevron")} 공고 ${row.posts.length}건</span>
      </div>
      <div class="group-body hidden" id="group-${idx}">
        <table>
          <thead>
            <tr>
              <th>공고명</th>
              <th>소스</th>
              <th>상태</th>
              <th>실패 사유</th>
              <th>링크</th>
            </tr>
          </thead>
          <tbody>
            ${row.posts
              .map(
                (p) => `
              <tr class="${p.failureReason ? "row-failure" : ""}">
                <td>${escapeHtml(p.title)}</td>
                <td>${escapeHtml(p.source)}</td>
                <td>${escapeHtml(p.status || "-")}</td>
                <td>${p.failureReason ? `<span class="reason-text">${escapeHtml(p.failureCategory || "failed")}: ${escapeHtml(p.failureReason)}</span>` : "-"}</td>
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
    header.addEventListener("click", () => {
      const body = byId(`group-${header.dataset.group}`);
      body.classList.toggle("hidden");
    });
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
        <thead>
          <tr>
            <th>회사 A</th>
            <th>회사 B</th>
            <th>매칭 근거</th>
            <th>검토 상태</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (c) => `
            <tr>
              <td class="cell-company">
                <strong>${escapeHtml(c.company_name_left || companyNameById(c.company_id_left))}</strong>
                <span>${escapeHtml(c.company_id_left)}</span>
              </td>
              <td class="cell-company">
                <strong>${escapeHtml(c.company_name_right || companyNameById(c.company_id_right))}</strong>
                <span>${escapeHtml(c.company_id_right)}</span>
              </td>
              <td class="score-reason">${escapeHtml(c.match_basis)}</td>
              <td><span class="badge status-${c.review_status}">${escapeHtml(c.review_status)}</span></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function renderManualQueue() {
  const items = state.manualReviewQueue;
  const summaryEntries = Object.entries(state.failureSummary);

  let html = "";
  if (summaryEntries.length) {
    html += `<div style="padding:12px 16px;border-bottom:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap;">${summaryEntries
      .map(([k, v]) => `<span class="badge">${escapeHtml(k)}: ${v}</span>`)
      .join("")}</div>`;
  }

  if (!items.length) {
    byId("manual").innerHTML = html + '<div class="empty-state">수동 검토 대기 항목이 없습니다.</div>';
    return;
  }

  html += `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>URL</th>
            <th>상태</th>
            <th>실패 분류</th>
            <th>실패 사유</th>
            <th>재시도</th>
            <th>마지막 처리</th>
            <th>메모</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr class="row-failure">
              <td><a class="link" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></td>
              <td><span class="badge status-${item.status}">${escapeHtml(item.status)}</span></td>
              <td>${escapeHtml(item.failureCategory || "-")}</td>
              <td class="reason-text">${escapeHtml(item.failureReason || "unknown")}</td>
              <td>${item.retryCount ?? 0}회</td>
              <td>${formatDate(item.lastProcessedAt)}</td>
              <td>${escapeHtml(item.notes || "-")}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
  byId("manual").innerHTML = html;
}

function escapeHtml(value) {
  return `${value ?? ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
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
    if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
    const snapshot = await res.json();
    state.rows = snapshot.rows ?? [];
    state.dedupeCandidates = snapshot.dedupeCandidates ?? [];
    state.manualReviewQueue = snapshot.manualReviewQueue ?? [];
    state.failureSummary = snapshot.failureSummary ?? {};
    state.gradeSummary = snapshot.gradeSummary ?? {};

    byId("meta").innerHTML = `
    <div>스냅샷: ${formatDate(snapshot.generatedAt)}</div>
    <div>회사 ${snapshot.totalCompanies || 0} · 공고 ${snapshot.totalPosts || 0}</div>`;

    ["search", "grade", "stage", "contact", "report", "meeting", "exclude", "sort"].forEach((id) => {
      byId(id).addEventListener("input", () => {
        state.activePreset = "";
        renderPresets();
        refreshViews();
      });
    });

    renderPresets();
    bindTabs();
    refreshViews();
    renderDedupe();
    renderManualQueue();
  } catch (err) {
    byId("meta").textContent = "데이터 로드 실패";
    byId("leads").innerHTML = `<div class="empty-state">스냅샷을 불러오지 못했습니다. (${escapeHtml(err.message)})</div>`;
  }
}

boot();
