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
  activeTab: "in_progress",
  detailRow: null,
  detailEditSections: {},
  detailOpenSections: new Set(),
  meetingEditId: null,
  meetingAddOpen: false,
  contactEditIndex: null,
  contactAddOpen: false,
  mergeSourceRow: null,
  detailBusy: false,
  mergeBusy: false,
  addLeadBusy: false,
  notionReorder: null,
  filtersOpen: false,
  tableSort: { column: "priorityScore", direction: "desc" },
  leadsPage: 1,
  newPage: 1,
  postsPage: 1,
  excludedPage: 1,
  actionKpiFocus: "inProgress"
};

const PAGE_SIZE = 10;

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

function multilineHtml(text) {
  const raw = `${text ?? ""}`.trim();
  if (!raw) return "";
  return escapeHtml(raw).replace(/\r?\n/g, "<br>");
}

/** Supports newlines and `**bold**` (stored as plain text). */
function richTextHtml(text) {
  const raw = `${text ?? ""}`;
  if (!raw.trim()) return "";
  let html = "";
  let lastIndex = 0;
  const re = /\*\*([^*\n]+)\*\*/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      html += escapeHtml(raw.slice(lastIndex, match.index));
    }
    html += `<strong class="rich-bold">${escapeHtml(match[1])}</strong>`;
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < raw.length) html += escapeHtml(raw.slice(lastIndex));
  return html.replace(/\r?\n/g, "<br>");
}

function wrapTextareaSelection(textarea, wrap = "**") {
  if (!textarea) return;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const val = textarea.value ?? "";
  const selected = val.slice(start, end) || "굵게";
  textarea.value = val.slice(0, start) + wrap + selected + wrap + val.slice(end);
  textarea.focus();
  const selStart = start + wrap.length;
  textarea.setSelectionRange(selStart, selStart + selected.length);
}

function richTextareaField(id, value, placeholder = "", rows = 3, extraAttrs = "") {
  return `<div class="rich-text-field">
    <div class="rich-text-toolbar">
      <button type="button" class="rich-text-tool-btn" data-rich-action="bold" title="선택 영역 굵게"><strong>B</strong></button>
      <span class="rich-text-hint muted">**굵게**</span>
    </div>
    <textarea id="${escapeAttr(id)}" class="inline-field inline-textarea" rows="${rows}" placeholder="${escapeAttr(placeholder)}"${extraAttrs ? ` ${extraAttrs}` : ""}>${escapeHtml(value ?? "")}</textarea>
  </div>`;
}

function isoToMeetingParts(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  let y = d.getFullYear();
  let mo = d.getMonth() + 1;
  let day = d.getDate();
  let h = d.getHours();
  let m = d.getMinutes();
  if (m < 15) m = 0;
  else if (m < 45) m = 30;
  else {
    m = 0;
    h += 1;
    if (h >= 24) {
      const next = new Date(y, mo - 1, day + 1, 0, 0, 0, 0);
      y = next.getFullYear();
      mo = next.getMonth() + 1;
      day = next.getDate();
      h = 0;
    }
  }
  return {
    date: `${y}-${pad(mo)}-${pad(day)}`,
    time: `${pad(h)}:${pad(m)}`,
    hour: h,
    minute: m
  };
}

function formatMeetingTimeLabel(hour, minute) {
  const period = hour < 12 ? "오전" : "오후";
  const h12 = hour % 12 || 12;
  return `${period} ${h12}:${String(minute).padStart(2, "0")}`;
}

function normalizeMeetingDateInput(raw) {
  const s = `${raw ?? ""}`.trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (!m) return "";
  const pad = (n) => String(Number(n)).padStart(2, "0");
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
}

function timePartsFromHourMinute(hour, minute) {
  const period = hour < 12 ? "am" : "pm";
  const hour12 = hour % 12 || 12;
  const mm = minute >= 45 ? 0 : minute >= 15 ? 30 : 0;
  return { period, hour: String(hour12), minute: String(mm) };
}

function composeTimeFromParts(period, hourStr, minuteStr) {
  if (!period || !hourStr || minuteStr === "") return "";
  const h12 = Number.parseInt(hourStr, 10);
  const mm = Number.parseInt(minuteStr, 10);
  if (!Number.isFinite(h12) || h12 < 1 || h12 > 12 || ![0, 30].includes(mm)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  let h24;
  if (period === "am") h24 = h12 === 12 ? 0 : h12;
  else h24 = h12 === 12 ? 12 : h12 + 12;
  return `${pad(h24)}:${pad(mm)}`;
}

function readMeetingSchedule(root) {
  return window.TMeetingPicker?.readSchedule(root) ?? { meetingAt: null, durationHours: null };
}

function initMeetingFormSelects(root = document) {
  window.TMeetingPicker?.init(root);
}

function mpickerDateField(id, value) {
  const dateVal = `${value ?? ""}`.slice(0, 10);
  return window.TMeetingPicker?.renderDatePicker?.(dateVal, { id }) ?? inlineInput(id, dateVal, "date");
}

function readMpickerDateIso(id) {
  const v = window.TMeetingPicker?.readDateValue?.(id) ?? "";
  return v ? `${v}T00:00:00Z` : "";
}

function meetingScheduleFieldsHtml(iso, durationHours) {
  return window.TMeetingPicker?.renderScheduleFields(iso, durationHours) ?? "";
}

function parseMeetingDateTime(dateStr, timeStr) {
  const date = `${dateStr ?? ""}`.trim();
  const time = `${timeStr ?? ""}`.trim();
  if (!date || !time) return null;
  const [y, mo, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (![y, mo, d, hh, mm].every(Number.isFinite)) return null;
  const dt = new Date(y, mo - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

function parseMeetingDuration(raw) {
  const v = `${raw ?? ""}`.trim();
  if (!v) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatMeetingDuration(hours) {
  const n = Number.parseFloat(hours);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n === 0.5) return "30분";
  const whole = Math.floor(n);
  const half = n - whole >= 0.49;
  if (half && whole === 0) return "30분";
  if (half) return `${whole}시간 30분`;
  return `${whole}시간`;
}

function meetingDurationSelectValue(hours) {
  const n = Number.parseFloat(hours);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
}

function formatMeetingAt(iso) {
  const parts = isoToMeetingParts(iso);
  if (!parts) return "";
  const [y, mo, day] = parts.date.split("-").map(Number);
  const dateStr = new Date(y, mo - 1, day).toLocaleDateString("ko-KR");
  return `${dateStr} ${formatMeetingTimeLabel(parts.hour, parts.minute)}`;
}

function clearMeetingUiState() {
  state.meetingEditId = null;
  state.meetingAddOpen = false;
}

function clearContactUiState() {
  state.contactEditIndex = null;
  state.contactAddOpen = false;
}

function detailIconBtn(icon, title, { className = "", attrs = "", size = 16 } = {}) {
  return `<button type="button" class="detail-icon-btn${className ? ` ${className}` : ""}" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}" ${attrs}>${iconSvg(icon, size)}</button>`;
}

function readMeetingCard(card) {
  if (!card) return null;
  const schedule = readMeetingSchedule(card);
  return {
    id: card.dataset.noteId,
    meetingAt: schedule.meetingAt,
    durationHours: schedule.durationHours,
    location: card.querySelector('[data-meeting-field="location"]')?.value.trim() ?? "",
    attendees: card.querySelector('[data-meeting-field="attendees"]')?.value.trim() ?? "",
    summary: card.querySelector('[data-meeting-field="summary"]')?.value.trim() ?? "",
    nextAction: card.querySelector('[data-meeting-field="next"]')?.value.trim() ?? ""
  };
}

function refreshMeetingsPanel(row) {
  if (!row?.companyId) return;
  const embed = document.querySelector(`[data-company-meetings="${row.companyId}"]`);
  if (!embed) {
    paintDetailModal();
    return;
  }
  const admin = window.TClientAdmin?.isUnlocked?.();
  embed.outerHTML = renderMeetingsEmbed(row, admin);
  const freshEmbed = document.querySelector(`[data-company-meetings="${row.companyId}"]`);
  initMeetingFormSelects(freshEmbed);
  void hydrateDetailExtras(row);
}

function renderMeetingEditCard(n) {
  const summaryId = `meeting-summary-${n.id}`;
  return `<li class="meeting-mini-item meeting-edit-card" data-note-id="${escapeAttr(n.id)}">
    <div class="detail-form-grid cols-2 detail-form-compact meeting-edit-fields meeting-form-surface">
      <div class="inline-row span-2 meeting-schedule-row">
        <span class="inline-label">일시</span>
        ${meetingScheduleFieldsHtml(n.meetingAt, n.durationHours)}
      </div>
      <div class="inline-row"><span class="inline-label">장소</span><input type="text" class="inline-field" data-meeting-field="location" value="${escapeAttr(n.location ?? "")}" /></div>
      <div class="inline-row span-2"><span class="inline-label">참석</span><input type="text" class="inline-field" data-meeting-field="attendees" value="${escapeAttr(n.attendees ?? "")}" /></div>
      <div class="inline-row span-2 inline-row-top"><span class="inline-label">요약</span>${richTextareaField(summaryId, n.summary ?? "", "미팅 내용", 3, 'data-meeting-field="summary"')}</div>
      <div class="inline-row span-2"><span class="inline-label">다음</span><input type="text" class="inline-field" data-meeting-field="next" value="${escapeAttr(n.nextAction ?? "")}" /></div>
    </div>
    <div class="meeting-edit-actions">
      ${detailIconBtn("check", "저장", { className: "detail-icon-btn-primary meeting-save-btn", attrs: `data-note-id="${escapeAttr(n.id)}"`, size: 15 })}
      ${detailIconBtn("x", "취소", { className: "meeting-cancel-btn", size: 15 })}
      ${detailIconBtn("trash", "삭제", { className: "detail-icon-btn-danger meeting-del-btn", attrs: `data-note-id="${escapeAttr(n.id)}"`, size: 15 })}
    </div>
  </li>`;
}

function renderMeetingViewItem(n, admin) {
  if (admin && state.meetingEditId === n.id) return renderMeetingEditCard(n);
  const when = formatMeetingAt(n.meetingAt) || "일시 미정";
  const dur = formatMeetingDuration(n.durationHours);
  const date = escapeHtml(dur ? `${when} · ${dur}` : when);
  const next = n.nextAction ? richTextHtml(n.nextAction) : '<span class="muted">—</span>';
  const metaParts = [];
  if (n.location) metaParts.push(`<div class="meeting-mini-meta">장소 · ${escapeHtml(n.location)}</div>`);
  if (n.attendees) metaParts.push(`<div class="meeting-mini-meta">참석 · ${escapeHtml(n.attendees)}</div>`);
  const bodyParts = [];
  if (metaParts.length) bodyParts.push(`<div class="meeting-mini-meta-block">${metaParts.join("")}</div>`);
  if (n.summary) bodyParts.push(`<div class="meeting-mini-summary rich-text">${richTextHtml(n.summary)}</div>`);
  const body = bodyParts.length ? bodyParts.join("") : '<span class="muted">내용 없음</span>';
  const actions = admin
    ? `<div class="meeting-item-actions">
        ${detailIconBtn("pencil", "수정", { className: "meeting-edit-btn", attrs: `data-note-id="${escapeAttr(n.id)}"`, size: 15 })}
        ${detailIconBtn("trash", "삭제", { className: "detail-icon-btn-danger meeting-del-btn", attrs: `data-note-id="${escapeAttr(n.id)}"`, size: 15 })}
      </div>`
    : "";
  return `<li class="meeting-mini-item">
    <details class="meeting-mini-details">
      <summary class="meeting-mini-head">
        <span class="meeting-mini-date">${date}</span>
        <span class="meeting-mini-next">${next}</span>
      </summary>
      <div class="meeting-mini-body">${body}</div>
    </details>
    ${actions}
  </li>`;
}

function fileChipInnerHtml(file, size = 15) {
  const ext = window.TCompanyFiles?.extFromFile?.(file) ?? "";
  if (window.TCompanyFiles?.extUsesBadge?.(ext)) {
    const label = escapeHtml(window.TCompanyFiles.extBadgeLabel(file));
    return `<span class="file-type-mark file-type-${escapeAttr(ext)}" aria-hidden="true"><span class="file-type-mark-body"></span><span class="file-type-mark-label">${label}</span></span>`;
  }
  return iconSvg(window.TCompanyFiles?.extIconName?.(file) ?? "fileText", size);
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
  return `<div class="cell-opinion text-preline">${multilineHtml(text.trim())}</div>`;
}

function renderDetailHeaderMemo(memo) {
  const plain = `${memo ?? ""}`.trim();
  if (!plain) return "";
  const lines = plain.split(/\r?\n/);
  const needsToggle = lines.length > 1;
  if (!needsToggle) {
    return `<span class="detail-header-memo">${escapeHtml(plain)}</span>`;
  }
  return `<details class="detail-header-memo-details">
    <summary class="detail-header-memo-summary">
      <span class="detail-header-memo-preview">${escapeHtml(lines[0])}…</span>
      <span class="detail-header-memo-chevron" aria-hidden="true">${iconSvg("chevron", 14)}</span>
    </summary>
    <div class="detail-header-memo-full text-preline">${multilineHtml(plain)}</div>
  </details>`;
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

function pipelineOperationalStatuses() {
  return (pipelineLabels().PIPELINE_STATUSES ?? []).filter((s) => s !== "closed");
}

function pipelineStatusForTag(status) {
  const resolved = pipelineLabels().resolvePipelineStatus?.(status) ?? status;
  if (resolved === "closed") return "active";
  return resolved;
}

function pipelineStageStepIndex(stage) {
  const P = pipelineLabels();
  const resolved = P.resolvePipelineStage?.(stage) ?? stage;
  return P.PIPELINE_STAGE_ORDER?.[resolved] ?? 1;
}

function renderPipelineStatusTag(row, { edit = false } = {}) {
  const { pipelineStatus } = resolveRowPipeline(row);
  const tagStatus = pipelineStatusForTag(pipelineStatus);
  const label = pipelineLabels().pipelineStatusLabel?.(tagStatus) ?? tagStatus;
  if (edit) {
    return `<div class="pipeline-status-col">${pipelineStatusSelectOperational("edit-pipeline-status", tagStatus)}</div>`;
  }
  return `<div class="pipeline-status-col">
    <span class="pipeline-status-tag pipeline-status-tag-${tagStatus}" title="상태: ${escapeAttr(label)}">
      <span class="pipeline-status-dot" aria-hidden="true"></span>
      ${escapeHtml(label)}
    </span>
  </div>`;
}

const PIPELINE_STAGE_SHORT_LABEL = {
  candidate: "후보",
  test_in_progress: "테스트",
  proposal: "전달·제안",
  meeting: "미팅",
  contract: "계약"
};

const PIPELINE_STAGE_ICON = {
  candidate: "user",
  test_in_progress: "flask",
  proposal: "send",
  meeting: "users",
  contract: "fileText"
};

function pipelineStageIconHtml(stageId, size = 16) {
  const icon = PIPELINE_STAGE_ICON[stageId] ?? "circle";
  return `<span class="pipeline-step-icon" aria-hidden="true">${iconSvg(icon, size)}</span>`;
}

function renderPipelineStageStepper(row, { edit = false } = {}) {
  const P = pipelineLabels();
  const stages = P.PIPELINE_STAGES ?? [];
  const labels = P.PIPELINE_STAGE_LABEL ?? {};
  const { pipelineStage } = resolveRowPipeline(row);
  const currentIdx = pipelineStageStepIndex(pipelineStage);
  const hidden = edit ? `<input type="hidden" id="edit-pipeline-stage" value="${escapeAttr(pipelineStage)}" />` : "";

  const items = stages.map((stageId, i) => {
    const idx = i + 1;
    const state = idx < currentIdx ? "done" : idx === currentIdx ? "current" : "upcoming";
    const tip = labels[stageId] ?? PIPELINE_STAGE_SHORT_LABEL[stageId] ?? stageId;
    const displayLabel = labels[stageId] ?? PIPELINE_STAGE_SHORT_LABEL[stageId] ?? stageId;
    const doneBadge =
      state === "done" ? `<span class="pipeline-step-done-badge" aria-hidden="true">${iconSvg("check", 8)}</span>` : "";
    const stepInner = `<div class="pipeline-step-node">${pipelineStageIconHtml(stageId)}${doneBadge}</div><span class="pipeline-step-label">${escapeHtml(displayLabel)}</span>`;
    return edit
      ? `<button type="button" class="pipeline-step is-${state}" data-pipeline-stage-btn="${escapeAttr(stageId)}" title="${escapeAttr(tip)}" aria-label="${escapeAttr(tip)}">${stepInner}</button>`
      : `<div class="pipeline-step is-${state}" role="listitem" title="${escapeAttr(tip)}" aria-label="${escapeAttr(tip)}">${stepInner}</div>`;
  });

  return `${hidden}<div class="pipeline-stepper-shell">
    <div class="pipeline-stepper${edit ? " is-edit" : ""}" role="${edit ? "group" : "list"}" aria-label="영업 단계">${items.join("")}</div>
  </div>`;
}

function renderPipelineMetaCol(row, { edit = false } = {}) {
  return `<div class="pipeline-meta-col">
    ${renderPipelineStatusTag(row, { edit })}
    ${renderPipelineClosedReasonCol(row, { edit })}
  </div>`;
}

function renderPipelineClosedReasonCol(row, { edit = false } = {}) {
  const { pipelineStatus, closedReason } = resolveRowPipeline(row);
  if (edit) {
    return `<div class="pipeline-closed-reason-col">${closedReasonSelect("edit-closed-reason", closedReason ?? "")}</div>`;
  }
  if (pipelineStatus !== "closed" || !closedReason) return "";
  const label = pipelineLabels().closedReasonLabel?.(closedReason) ?? closedReason;
  return `<div class="pipeline-closed-reason-col">
    <span class="pipeline-closed-reason-tag" title="종결 사유: ${escapeAttr(label)}">${escapeHtml(label)}</span>
  </div>`;
}

function renderSalesPipelineBar(row, { edit = false } = {}) {
  return `<div class="sales-pipeline-shell">
    <div class="sales-pipeline-bar">
      ${renderPipelineStageStepper(row, { edit })}
      ${renderPipelineMetaCol(row, { edit })}
    </div>
  </div>`;
}

function pipelineStatusSelectOperational(id, value) {
  const P = pipelineLabels();
  const list = pipelineOperationalStatuses();
  const labels = P.PIPELINE_STATUS_LABEL ?? {};
  const resolved = pipelineStatusForTag(value);
  return `<select id="${escapeAttr(id)}" class="pipeline-status-select">${list
    .map((s) => `<option value="${escapeAttr(s)}"${resolved === s ? " selected" : ""}>${escapeHtml(labels[s] ?? s)}</option>`)
    .join("")}</select>`;
}

function syncPipelineStepperUi(root = byId("detailBody")) {
  const hidden = root?.querySelector("#edit-pipeline-stage");
  const stepper = root?.querySelector(".pipeline-stepper.is-edit");
  if (!hidden || !stepper) return;
  const currentIdx = pipelineStageStepIndex(hidden.value);
  const steps = stepper.querySelectorAll("[data-pipeline-stage-btn]");
  steps.forEach((btn, i) => {
    const idx = i + 1;
    const state = idx < currentIdx ? "done" : idx === currentIdx ? "current" : "upcoming";
    btn.classList.remove("is-done", "is-current", "is-upcoming");
    btn.classList.add(`is-${state}`);
    const node = btn.querySelector(".pipeline-step-node");
    if (!node) return;
    let badge = node.querySelector(".pipeline-step-done-badge");
    if (state === "done") {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "pipeline-step-done-badge";
        badge.setAttribute("aria-hidden", "true");
        badge.innerHTML = iconSvg("check", 8);
        node.appendChild(badge);
      }
    } else {
      badge?.remove();
    }
  });
}

function bindSalesPipelineControls() {
  const body = byId("detailBody");
  if (!body || body.dataset.pipelineBound === "1") return;
  body.dataset.pipelineBound = "1";

  body.addEventListener("click", (e) => {
    const stageBtn = e.target?.closest?.("[data-pipeline-stage-btn]");
    if (!stageBtn || !isSectionEdit("sales")) return;
    e.preventDefault();
    const hidden = byId("edit-pipeline-stage");
    if (hidden) hidden.value = stageBtn.dataset.pipelineStageBtn;
    syncPipelineStepperUi(body);
  });

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

function sortCuratedTabRows(rows) {
  const mode = byId("sort")?.value || "notion";
  if (mode === "notion") return sortByNotionPriority(rows);
  return sortRows(rows);
}

function sortRecommendedRows(rows) {
  return sortCuratedTabRows(rows);
}

function sortInProgressRows(rows) {
  return sortCuratedTabRows(rows);
}

function sortByNotionPriority(rows) {
  return [...rows].sort((a, b) => {
    const rankDiff = notionPriorityValue(a) - notionPriorityValue(b);
    if (rankDiff !== 0) return rankDiff;
    return displayName(a).localeCompare(displayName(b), "ko");
  });
}

const NOTION_REORDER_TABS = new Set(["recommended", "in_progress"]);

const TAB_DEFAULT_SORT = {
  in_progress: "notion",
  recommended: "notion",
  new: "new",
  leads: "recent",
  posts: "recent",
  excluded: "score"
};

function defaultSortForTab(tab = state.activeTab) {
  return TAB_DEFAULT_SORT[tab] ?? "score";
}

function applySortForTab(tab = state.activeTab, { forceDefault = false } = {}) {
  const sortEl = byId("sort");
  if (!sortEl) return;
  const onCuratedTab = NOTION_REORDER_TABS.has(tab);
  sortEl.querySelectorAll("option").forEach((opt) => {
    if (opt.value === "notion") {
      opt.hidden = !onCuratedTab;
      opt.disabled = !onCuratedTab;
    }
  });
  if (sortEl.value === "priority" || sortEl.value === "grade") sortEl.value = "score";
  if (forceDefault || (!onCuratedTab && sortEl.value === "notion")) {
    sortEl.value = defaultSortForTab(tab);
  }
  syncCustomSelects();
}

function updateSortOptionsForTab(tab = state.activeTab) {
  applySortForTab(tab, { forceDefault: false });
}

function isNotionReorderTab(tab = state.activeTab) {
  return NOTION_REORDER_TABS.has(tab);
}

function isNotionReorderActive() {
  return Boolean(state.notionReorder?.active);
}

function getRecommendedTabRows() {
  const P = window.TPipeline;
  return sortByNotionPriority(
    state.rows.filter((r) => P?.rowMatchesRecommendedTab?.(r) && isMainTabLead(r))
  );
}

function getInProgressTabRows() {
  const P = window.TPipeline;
  return sortByNotionPriority(
    state.rows.filter((r) => P?.rowMatchesInProgressTab?.(r) && isMainTabLead(r))
  );
}

function getCuratedNotionRows() {
  const P = window.TPipeline;
  return sortByNotionPriority(
    state.rows.filter(
      (r) => isMainTabLead(r) && (P?.rowMatchesRecommendedTab?.(r) || P?.rowMatchesInProgressTab?.(r))
    )
  );
}

function getCuratedOrderedIds() {
  return getCuratedNotionRows().map((r) => r.companyId);
}

function getNotionTabRowIds(tab) {
  return (tab === "recommended" ? getRecommendedTabRows() : getInProgressTabRows()).map((r) => r.companyId);
}

function mergeTabReorder(curatedIds, tabIds, newTabOrder) {
  const tabSet = new Set(tabIds);
  const queue = [...newTabOrder];
  return curatedIds.map((id) => (tabSet.has(id) ? queue.shift() : id));
}

function sameIdSet(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

function updateNotionReorderUi() {
  const startBtn = byId("notionReorderStart");
  const bar = byId("notionReorderBar");
  const admin = window.TClientAdmin?.isUnlocked?.();
  const onTab = isNotionReorderTab();
  const savingStatus = state.notionReorder?.savingStatus ?? null;
  const saving = Boolean(savingStatus);
  const saveBtn = byId("notionReorderSave");
  const pushBtn = byId("notionReorderSavePush");
  const cancelBtn = byId("notionReorderCancel");
  const hintEl = byId("notionReorderHint");
  const progress = state.notionReorder?.saveProgress;

  startBtn?.classList.toggle("hidden", !admin || !onTab || isNotionReorderActive());
  startBtn?.closest(".search-row-reorder")?.classList.toggle("hidden", !admin || !onTab);
  bar?.classList.toggle("hidden", !isNotionReorderActive());
  bar?.setAttribute("aria-hidden", isNotionReorderActive() ? "false" : "true");
  bar?.classList.toggle("notion-reorder-busy", saving);
  document.body.classList.toggle("notion-reorder-active", isNotionReorderActive());
  byId("notionReorderSavePush")?.classList.toggle("hidden", !admin);

  if (saveBtn) {
    saveBtn.disabled = saving;
    saveBtn.textContent =
      savingStatus === "pushing" ? "저장 · Notion 반영 중…" : saving ? "저장 중…" : "순서 저장";
  }
  if (pushBtn) {
    pushBtn.disabled = saving;
    pushBtn.textContent = saving ? "저장 · Notion 반영 중…" : "저장 + Notion 반영";
  }
  if (cancelBtn) cancelBtn.disabled = saving;

  if (hintEl) {
    if (savingStatus === "pushing") {
      hintEl.textContent =
        progress?.total > 0
          ? `순번 저장 중… (${progress.current}/${progress.total}) · Notion 반영 대기`
          : "순번 저장 중… · Notion 반영 대기";
    } else if (saving) {
      hintEl.textContent =
        progress?.total > 0
          ? `순번 저장 중… (${progress.current}/${progress.total})`
          : "순번 저장 중…";
    } else {
      hintEl.textContent = "☰ 핸들을 드래그해 순번을 바꾸세요. 행 클릭은 상세로 이동하지 않습니다.";
    }
  }
}

function startNotionReorder() {
  if (!window.TClientAdmin?.isUnlocked?.()) {
    showToast("관리자 로그인이 필요합니다.", "error");
    return;
  }
  if (!isNotionReorderTab()) return;
  const tab = state.activeTab;
  const draftIds = getNotionTabRowIds(tab);
  if (!draftIds.length) {
    showToast("순서를 변경할 회사가 없습니다.", "error");
    return;
  }
  const sortEl = byId("sort");
  if (sortEl && sortEl.value !== "notion") sortEl.value = "notion";
  state.notionReorder = { active: true, tab, draftIds, dragId: null, savingStatus: null, saveProgress: null };
  updateNotionReorderUi();
  window.TDetailPanel?.renderTabPanels?.(state.activeTab);
}

function cancelNotionReorder() {
  state.notionReorder = null;
  updateNotionReorderUi();
  window.TDetailPanel?.renderTabPanels?.(state.activeTab);
}

function notionReorderRowsForTab(tab) {
  const ids = state.notionReorder?.draftIds ?? getNotionTabRowIds(tab);
  const byIdMap = new Map(state.rows.map((r) => [r.companyId, r]));
  return ids.map((id) => byIdMap.get(id)).filter(Boolean);
}

function moveNotionReorderId(dragId, targetId) {
  if (!state.notionReorder?.active || state.notionReorder?.savingStatus || !dragId || !targetId || dragId === targetId) return;
  const ids = [...state.notionReorder.draftIds];
  const from = ids.indexOf(dragId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return;
  ids.splice(from, 1);
  ids.splice(to, 0, dragId);
  state.notionReorder.draftIds = ids;
  window.TDetailPanel?.renderTabPanels?.(state.activeTab);
}

function bindNotionReorderTable(panelId) {
  const panel = byId(panelId);
  if (!panel || !isNotionReorderActive()) return;
  let dragId = null;
  panel.querySelectorAll(".reorder-handle").forEach((handle) => {
    handle.addEventListener("dragstart", (e) => {
      dragId = handle.closest("tr")?.dataset?.reorderId ?? null;
      if (!dragId) return;
      state.notionReorder.dragId = dragId;
      e.dataTransfer?.setData("text/plain", dragId);
      e.dataTransfer.effectAllowed = "move";
      handle.closest("tr")?.classList.add("reorder-dragging");
    });
    handle.addEventListener("dragend", () => {
      dragId = null;
      state.notionReorder.dragId = null;
      panel.querySelectorAll("tr.reorder-dragging, tr.reorder-drop-target").forEach((tr) => {
        tr.classList.remove("reorder-dragging", "reorder-drop-target");
      });
    });
  });
  panel.querySelectorAll("tr[data-reorder-id]").forEach((tr) => {
    tr.addEventListener("dragover", (e) => {
      if (!dragId) return;
      e.preventDefault();
      tr.classList.add("reorder-drop-target");
    });
    tr.addEventListener("dragleave", () => tr.classList.remove("reorder-drop-target"));
    tr.addEventListener("drop", (e) => {
      e.preventDefault();
      tr.classList.remove("reorder-drop-target");
      const targetId = tr.dataset.reorderId;
      const fromId = e.dataTransfer?.getData("text/plain") || dragId;
      moveNotionReorderId(fromId, targetId);
    });
  });
}

async function saveNotionReorder({ pushNotion = false } = {}) {
  if (!state.notionReorder?.active) return;
  if (!window.TClientAdmin?.isUnlocked?.()) {
    showToast("관리자 로그인이 필요합니다.", "error");
    return;
  }
  if (state.notionReorder.savingStatus) return;

  const tab = state.notionReorder.tab;
  const tabIds = getNotionTabRowIds(tab);
  const draftIds = state.notionReorder.draftIds;
  if (!sameIdSet(draftIds, tabIds)) {
    showToast("순서 목록이 올바르지 않습니다. 취소 후 다시 시도해 주세요.", "error");
    return;
  }

  const merged = mergeTabReorder(getCuratedOrderedIds(), tabIds, draftIds);
  state.notionReorder.savingStatus = pushNotion ? "pushing" : "saving";
  state.notionReorder.saveProgress = { current: 0, total: merged.length };
  updateNotionReorderUi();

  try {
    await window.TSalesManagement.batchSetNotionPriorities(merged, {
      onProgress: ({ current, total }) => {
        if (!state.notionReorder?.active) return;
        state.notionReorder.saveProgress = { current, total };
        updateNotionReorderUi();
      }
    });
    await window.TSalesManagement.loadAll(true);
    reloadRowsWithAdmin();
    refreshViews();
    cancelNotionReorder();
    showToast(pushNotion ? "순서를 저장했습니다. Notion 반영을 시작합니다." : "순번 순서가 저장되었습니다.");
    if (pushNotion) {
      await window.TClientAdmin.triggerNotionPush?.();
      notionPushUi.triggeredAt = Date.now();
      notionPushUi.sawRunning = false;
      scheduleNotionPushWatch();
    }
  } catch (err) {
    if (state.notionReorder) {
      state.notionReorder.savingStatus = null;
      state.notionReorder.saveProgress = null;
      updateNotionReorderUi();
    }
    showToast(err.message || "순서 저장 실패", "error");
  }
}

function reorderHandleCell(no) {
  return `<td class="col-reorder-handle"><button type="button" class="reorder-handle" draggable="true" aria-label="순서 변경">☰</button><span class="reorder-no">${no > 0 ? escapeHtml(String(no)) : "—"}</span></td>`;
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
  const scale = `${row.profile?.companyScale ?? ""}`.trim();
  const hint =
    tier === "enterprise"
      ? scale && /대/.test(scale) ? `대기업 (${scale}) — 스타트업 타깃 아님` : "대기업 — 스타트업 타깃 아님"
      : tier === "mid"
        ? scale && /중/.test(scale) ? `중견 (${scale}) — 우선순위 낮음` : "중견 — 우선순위 낮음"
        : tier === "startup"
          ? scale && /(중소|소|스타트)/.test(scale) ? `스타트업 (${scale})` : "스타트업 후보"
          : scale || "규모 미확인";
  return `<span class="tier-badge tier-${tier}" title="${escapeHtml(hint)}">${escapeHtml(label)}</span>`;
}

const PORTAL_HOST_HINT = /jobkorea|saramin|wanted\.co\.kr/i;

function scaleRedundantWithTier(row) {
  const tier = row.companyTier || "unknown";
  const scale = `${row.profile?.companyScale ?? ""}`.trim();
  if (!scale || tier === "unknown") return false;
  if (tier === "enterprise" && /대기업|^대$/.test(scale)) return true;
  if (tier === "mid" && /중견|^중$/.test(scale)) return true;
  if (tier === "startup" && /(중소|스타트|^소$)/.test(scale)) return true;
  return false;
}

function scaleBadge(row) {
  const scale = row.profile?.companyScale;
  if (!scale || scaleRedundantWithTier(row)) return "";
  const short = scale.length > 3 ? scale.slice(0, 2) : scale;
  return `<span class="scale-badge" title="기업규모: ${escapeAttr(scale)}">${escapeHtml(short)}</span>`;
}

function bizStatusBadge(row, { compact = false } = {}) {
  const status = row.profile?.bizStatus;
  if (!status) return "";
  const closed = /폐업|휴업|말소/.test(status);
  const cls = closed ? "biz-status-closed" : "biz-status-active";
  if (compact || /계속/.test(status)) {
    const icon = closed ? iconSvg("ban", 11) : iconSvg("building", 11);
    return `<span class="meta-chip biz-status-badge ${cls}" title="${escapeAttr(status)}">${icon}</span>`;
  }
  return `<span class="biz-status-badge ${cls}" title="${escapeAttr(status)}">${escapeHtml(status.split(/\s+/)[0])}</span>`;
}

function companyMetaChips(row, { compact = false } = {}) {
  return [tierBadge(row), scaleBadge(row), bizStatusBadge(row, { compact })].filter(Boolean).join("");
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
  const list = normalizeContactList(row);
  for (const c of list) {
    if (c.email && c.email.includes("@")) return c.email;
    if (c.name && c.name.includes("@")) return c.name;
  }
  const email = `${row.email ?? ""}`.trim();
  if (email && email.includes("@")) return email;
  return "";
}

function normalizeContactEntry(raw = {}) {
  return {
    name: `${raw.name ?? ""}`.trim(),
    email: `${raw.email ?? ""}`.trim(),
    phone: `${raw.phone ?? ""}`.trim()
  };
}

function hasContactData(c) {
  return Boolean(c?.name || c?.email || c?.phone);
}

function normalizeContactList(row) {
  const c = row.contact ?? {};
  if (Array.isArray(c.contacts) && c.contacts.length) {
    return c.contacts.map(normalizeContactEntry).filter(hasContactData);
  }
  const single = normalizeContactEntry({
    name: c.name,
    email: c.email || row.email || "",
    phone: c.phone
  });
  return hasContactData(single) ? [single] : [];
}

function buildContactPatch(contacts) {
  const list = contacts.map(normalizeContactEntry).filter(hasContactData);
  const primary = list[0] ?? { name: "", email: "", phone: "" };
  return { ...primary, contacts: list };
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

function inlineTextarea(id, value, placeholder = "", rows = 4) {
  return `<textarea id="${escapeAttr(id)}" class="inline-field inline-textarea" rows="${rows}" placeholder="${escapeAttr(placeholder)}">${escapeHtml(value ?? "")}</textarea>`;
}

function inlineSelect(id, value, options, extraClass = "") {
  const current = `${value ?? ""}`;
  const cls = extraClass ? `inline-field inline-select ${extraClass}` : "inline-field inline-select";
  const opts = options
    .map(([v, l]) => `<option value="${escapeAttr(v)}"${current === `${v}` ? " selected" : ""}>${escapeHtml(l)}</option>`)
    .join("");
  return `<select id="${id}" class="${cls}">${opts}</select>`;
}

function tierSelectCompact(id, value) {
  return inlineSelect(
    id,
    value,
    [
      ["", "자동"],
      ["startup", "소"],
      ["mid", "중"],
      ["enterprise", "대"],
      ["unknown", "?"]
    ],
    "summary-tier-select"
  );
}

function gradeSelectCompact(id, value) {
  return inlineSelect(
    id,
    value,
    [
      ["", "—"],
      ["A", "A"],
      ["B", "B"],
      ["C", "C"]
    ],
    "score-grade-select"
  );
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

function isSectionEdit(key) {
  return Boolean(state.detailEditSections[key]);
}

function setSectionEdit(key, on) {
  if (!key) return;
  if (on) state.detailEditSections[key] = true;
  else delete state.detailEditSections[key];
}

function clearSectionEdits() {
  state.detailEditSections = {};
}

function detailSubPanel(title, body, extraClass = "") {
  return `<div class="detail-subpanel${extraClass ? ` ${extraClass}` : ""}">
    <div class="detail-subpanel-title">${escapeHtml(title)}</div>
    <div class="detail-subpanel-body">${body}</div>
  </div>`;
}

function detailSectionCard(title, body, sectionKey, extraClass = "", { icon = "fileText", open = true, flat = false, editable = true, headerExtra = "" } = {}) {
  const admin = window.TClientAdmin?.isUnlocked?.();
  const editing = sectionKey && isSectionEdit(sectionKey);
  const actionBtns =
    admin && editable && sectionKey
      ? `<div class="detail-section-actions${editing ? " is-editing" : ""}">${editing
          ? `${detailIconBtn("x", "취소", { attrs: `data-section-cancel="${escapeAttr(sectionKey)}"` })}
             ${detailIconBtn("check", "저장", { className: "detail-icon-btn-primary", attrs: `data-section-save="${escapeAttr(sectionKey)}"` })}`
          : detailIconBtn("pencil", "수정", { attrs: `data-section-edit="${escapeAttr(sectionKey)}"` })}</div>`
      : "";
  const actions = headerExtra || actionBtns ? `<div class="drawer-section-head-actions">${headerExtra}${actionBtns}</div>` : "";

  if (flat) {
    return `<section class="detail-block detail-block-flat drawer-edit-panel${editing ? " is-section-edit" : ""} ${extraClass}">
      <div class="detail-block-head-row">
        <h4 class="detail-block-title">${escapeHtml(title)}</h4>
        ${actions}
      </div>
      <div class="detail-block-content">${body}</div>
    </section>`;
  }

  const shouldOpen = open || editing;
  return `<details class="drawer-section ${extraClass}${editing ? " is-section-edit" : ""}" data-section-key="${escapeAttr(sectionKey || "")}"${shouldOpen ? " open" : ""}>
    <summary class="drawer-section-head">
      <span class="drawer-section-icon" aria-hidden="true">${iconSvg(icon, 18)}</span>
      <span class="drawer-section-title">${escapeHtml(title)}</span>
      ${actions}
      <span class="drawer-section-chevron" aria-hidden="true">+</span>
    </summary>
    <div class="drawer-section-body">${body}</div>
  </details>`;
}

function detailCard(title, body, extraClass = "", opts = {}) {
  return detailSectionCard(title, body, "", extraClass, { ...opts, editable: false });
}

function drawerStatRow(label, value) {
  return `<div class="drawer-stat-row"><span class="drawer-stat-label">${escapeHtml(label)}</span><span class="drawer-stat-value">${value}</span></div>`;
}

function renderDrawerStatsCompact(row) {
  const items = [];
  if (row.leadGrade) {
    items.push(`<span class="drawer-stat-chip drawer-stat-grade grade-${row.leadGrade}">${row.leadGrade}</span>`);
  }
  if (row.notionPriority > 0) {
    items.push(`<span class="drawer-stat-chip">No. ${escapeHtml(String(row.notionPriority))}</span>`);
  }
  items.push(`<span class="drawer-stat-chip">담당 ${row.contactSecured === "yes" ? "확보" : "미확보"}</span>`);
  const { pipelineStage, pipelineStatus } = resolveRowPipeline(row);
  const stageLabel = pipelineLabels().pipelineStageLabel?.(pipelineStage);
  if (stageLabel) {
    const statusSuffix =
      pipelineStatus === "active"
        ? "진행"
        : pipelineStatus === "pending"
          ? "대기"
          : pipelineLabels().pipelineStatusLabel?.(pipelineStatus) ?? "";
    const label = statusSuffix ? `${stageLabel} ${statusSuffix}` : stageLabel;
    items.push(`<span class="drawer-stat-chip">${escapeHtml(label)}</span>`);
  }
  return items.join("");
}

function renderDetailHeaderSub(row) {
  const line1 = companySubline(row);
  const memo = `${row.salesMemo ?? row.manualNotes ?? ""}`.trim();
  const parts = [];
  if (line1) parts.push(`<span class="detail-header-meta">${escapeHtml(line1)}</span>`);
  if (memo) parts.push(renderDetailHeaderMemo(memo));
  return parts.join("");
}

function captureDetailOpenSections() {
  const open = new Set();
  byId("detailBody")?.querySelectorAll("details.drawer-section[data-section-key]").forEach((el) => {
    if (el.open && el.dataset.sectionKey) open.add(el.dataset.sectionKey);
  });
  return open;
}

function applyDetailOpenSections(openSections) {
  if (!openSections?.size) return;
  byId("detailBody")?.querySelectorAll("details.drawer-section[data-section-key]").forEach((el) => {
    if (openSections.has(el.dataset.sectionKey)) el.open = true;
  });
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

function renderProfileEnrichStrip(p, admin) {
  if (!admin) return "";
  return `
      <div class="bizno-fetch-row bizno-fetch-row-compact">
        <div class="inline-row bizno-fetch-line">
          <span class="inline-label">사업자번호</span>
          <div class="bizno-fetch-controls">
            ${inlineInput("edit-prof-bizno", formatBizNoDisplay(p.bizNo ?? ""), "text", "000-00-00000")}
            <button type="button" class="btn-primary btn-sm" id="btn-enrich-bizno">정보 자동 수집</button>
          </div>
        </div>
        <p class="enrich-bizno-status muted" id="enrich-bizno-status">bizno.net 자동 조회</p>
      </div>`;
}

function renderProfileSection(row, sectionEdit = false, p = {}, domain = "", admin = false) {
  const fields = [
    ["서비스명", "edit-prof-service", p.serviceName || p.service_name],
    ["서비스 주소", "edit-prof-service-url", p.serviceUrl || p.service_url],
    ["도메인", "edit-prof-domain", domain],
    ["법인명", "edit-prof-legal", p.companyNameLegal],
    ["사업자번호", "edit-prof-bizno", formatBizNoDisplay(p.bizNo)],
    ["업태", "edit-prof-type", p.bizType],
    ["종목", "edit-prof-item", p.bizItem],
    ["기업규모", "edit-prof-scale", p.companyScale],
    ["사업자상태", "edit-prof-status", p.bizStatus],
    ["등록일", "edit-prof-founded", p.foundedDate],
    ["종업원", "edit-prof-emp", p.employeeCount],
    ["홈페이지", "edit-prof-home", p.homepage],
    ["산업분류", "edit-prof-industry", p.industrySummary]
  ].filter(([, , v]) => sectionEdit || `${v ?? ""}`.trim());

  if (!fields.length && !sectionEdit && !admin) return `<p class="muted">사업자·업종 정보 없음</p>`;

  const enrichStrip = renderProfileEnrichStrip(p, admin);

  if (sectionEdit) {
    const tableFields = fields.filter(([, id]) => id !== "edit-prof-bizno");
    return `${enrichStrip}<div class="detail-form-grid cols-2 detail-form-compact">${tableFields
      .map(([label, id, val]) => {
        const wide = id === "edit-prof-industry" || id === "edit-prof-home" || id === "edit-prof-service-url";
        return `<div class="inline-row${wide ? " span-2" : ""}"><span class="inline-label">${escapeHtml(label)}</span>${inlineInput(id, val, id.includes("home") || id.includes("service-url") ? "url" : "text")}</div>`;
      })
      .join("")}</div>`;
  }

  if (!fields.length) return `${enrichStrip}<p class="muted">사업자·업종 정보 없음</p>`;

  return `${enrichStrip}<dl class="detail-kv detail-kv-profile">${fields
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
  const opts = [['', '미종결'], ...list.map((r) => [r, labels[r] ?? r])];
  return `<select id="${escapeAttr(id)}" class="pipeline-status-select pipeline-closed-reason-select">${opts
    .map(([v, l]) => `<option value="${escapeAttr(v)}"${resolved === v ? " selected" : ""}>${escapeHtml(l)}</option>`)
    .join("")}</select>`;
}

function renderContactItem(c) {
  const parts = [];
  if (c.name) parts.push(`<span class="sales-contact-name">${escapeHtml(c.name)}</span>`);
  if (c.email) {
    parts.push(`<a class="link sales-contact-email" href="mailto:${escapeAttr(c.email)}">${escapeHtml(c.email)}</a>`);
  }
  if (c.phone) parts.push(`<span class="sales-contact-phone">${escapeHtml(c.phone)}</span>`);
  return parts.join('<span class="sales-contact-sep" aria-hidden="true">|</span>');
}

function readContactCard(card) {
  if (!card) return normalizeContactEntry({});
  return normalizeContactEntry({
    name: card.querySelector('[data-contact-field="name"]')?.value,
    email: card.querySelector('[data-contact-field="email"]')?.value,
    phone: card.querySelector('[data-contact-field="phone"]')?.value
  });
}

async function persistContactsPatch(row, contacts) {
  const cid = row.companyId;
  window.TClientAdmin.setEntry(cid, { contact: buildContactPatch(contacts) });
  await window.TClientAdmin.flushPersist?.();
  reloadRowsWithAdmin();
  refreshViews();
  const updated = state.rows.find((r) => r.companyId === cid) ?? row;
  state.detailRow = updated;
  window.__TCLIENT_DETAIL_ROW = updated;
  refreshContactsPanel(updated);
}

function refreshContactsPanel(row) {
  if (!row?.companyId) return;
  const embed = document.querySelector(`[data-company-contacts="${row.companyId}"]`);
  if (!embed) {
    paintDetailModal();
    return;
  }
  const admin = window.TClientAdmin?.isUnlocked?.();
  embed.outerHTML = renderContactsEmbed(row, admin);
  hydrateIcons(byId("detailBody"));
}

function renderContactEditCard(c, index, { isNew = false } = {}) {
  return `<div class="sales-contact-item sales-contact-edit-card" data-contact-index="${index}"${isNew ? ' data-contact-new="1"' : ""}>
    <div class="detail-form-grid cols-3 detail-form-compact sales-contact-edit-fields">
      <div class="inline-row"><span class="inline-label">이름</span><input type="text" class="inline-field" data-contact-field="name" value="${escapeAttr(c.name ?? "")}" placeholder="이름" /></div>
      <div class="inline-row"><span class="inline-label">이메일</span><input type="email" class="inline-field" data-contact-field="email" value="${escapeAttr(c.email ?? "")}" placeholder="이메일" /></div>
      <div class="inline-row"><span class="inline-label">전화</span><input type="tel" class="inline-field" data-contact-field="phone" value="${escapeAttr(c.phone ?? "")}" placeholder="전화" /></div>
    </div>
    <div class="contact-edit-actions">
      ${detailIconBtn("check", "저장", { className: "detail-icon-btn-primary contact-save-btn", attrs: `data-contact-index="${index}"`, size: 15 })}
      ${detailIconBtn("x", "취소", { className: "contact-cancel-btn", size: 15 })}
    </div>
  </div>`;
}

function renderContactViewItem(c, index, admin) {
  if (admin && state.contactEditIndex === index) return renderContactEditCard(c, index);
  const actions = admin
    ? `<div class="contact-item-actions">
        ${detailIconBtn("pencil", "수정", { className: "contact-edit-btn", attrs: `data-contact-index="${index}"`, size: 15 })}
        ${detailIconBtn("trash", "삭제", { className: "detail-icon-btn-danger contact-del-btn", attrs: `data-contact-index="${index}"`, size: 15 })}
      </div>`
    : "";
  return `<div class="sales-contact-item" data-contact-index="${index}">
    <div class="sales-contact-item-body">${renderContactItem(c)}</div>
    ${actions}
  </div>`;
}

function renderContactsEmbed(row, admin) {
  const addOpen = state.contactAddOpen && state.detailRow?.companyId === row.companyId;
  const list = normalizeContactList(row);
  const toolbar = `<div class="contact-toolbar">
    <span class="sales-subsection-label">담당자 정보</span>
    ${admin ? detailIconBtn(addOpen ? "x" : "plus", addOpen ? "추가 취소" : "담당자 추가", { attrs: 'id="contact-add-toggle"', size: 16 }) : ""}
  </div>`;
  const items = list.map((c, i) => renderContactViewItem(c, i, admin)).join("");
  const addRow = addOpen ? renderContactEditCard({ name: "", email: "", phone: "" }, list.length, { isNew: true }) : "";
  const body =
    list.length || addOpen
      ? `<div class="sales-contacts-list">${items}${addRow}</div>`
      : `<p class="muted detail-empty-hint sales-contact-empty">담당자 정보 없음</p>`;
  return `<div class="sales-contacts-embed" data-company-contacts="${escapeAttr(row.companyId)}">${toolbar}${body}</div>`;
}

function renderTestView(row) {
  const start = row.testStartedAt ? escapeHtml(formatDate(row.testStartedAt)) : '<span class="muted">—</span>';
  const end = row.testEndedAt ? escapeHtml(formatDate(row.testEndedAt)) : '<span class="muted">—</span>';
  const memo = `${row.testNotes ?? ""}`.trim();
  return `<div class="test-compact-view">
    <div class="test-dates-row"><span class="test-date-item"><span class="test-date-label">시작</span> ${start}</span><span class="test-date-sep" aria-hidden="true">|</span><span class="test-date-item"><span class="test-date-label">종료</span> ${end}</span></div>
    ${memo ? `<div class="test-memo text-preline">${multilineHtml(memo)}</div>` : ""}
  </div>`;
}

function renderScoreSection(row, edit, admin = false) {
  const breakdown = row.scoreBreakdown ?? [];
  const entry = window.TClientAdmin?.getEntry(row.companyId) ?? {};
  const gradeVal = entry.leadGrade || row.leadGrade || "";
  const totalGradeRow = edit
    ? `<label class="score-edit-row score-edit-row-inline score-edit-total score-edit-head-row">
        <span class="score-edit-label">총점 · 등급</span>
        <div class="score-total-grade-row">
          ${inlineInput("edit-score-total", row.priorityScore, "number")}
          ${gradeSelectCompact("edit-grade", gradeVal)}
        </div>
      </label>`
    : "";
  if (!breakdown.length && !row.scoreReason) {
    if (edit) {
      return `${totalGradeRow}<p class="muted detail-empty-hint">점수 세부 항목 없음</p>`;
    }
    return `<p class="muted detail-empty-hint">점수 정보 없음</p>`;
  }
  if (edit && breakdown.length) {
    return `<div class="score-edit-grid score-edit-grid-compact">${breakdown
      .map((b) => {
        const defaultPts = `${b.pts ?? ""}`.replace(":", "") || "0";
        const val = b.override !== undefined && b.override !== "" ? b.override : "";
        return `<label class="score-edit-row score-edit-row-inline">
          <span class="score-edit-label">${escapeHtml(b.label)} <em>${escapeHtml(b.pts || "")}</em></span>
          <input type="number" class="inline-field score-part-input" data-score-part="${escapeAttr(b.part)}" value="${escapeAttr(val)}" placeholder="${escapeAttr(defaultPts)}" />
        </label>`;
      })
      .join("")}${totalGradeRow}</div>`;
  }
  const lines = breakdown.length
    ? breakdown
        .map(
          (b) =>
            `<div class="score-grid-cell"><span class="score-grid-label">${escapeHtml(b.label)}</span><span class="score-grid-pts">${escapeHtml(b.pts || "")}</span></div>`
        )
        .join("")
    : `<div class="score-grid-cell is-wide"><span class="score-grid-label">${escapeHtml(row.scoreReason)}</span></div>`;
  return `<div class="score-compact">
    <div class="score-compact-head">
      <span class="score-compact-total">${escapeHtml(row.priorityScore)}점</span>
      <span class="score-compact-grade grade-${escapeHtml(row.leadGrade || "C")}">${escapeHtml(row.leadGrade || "-")}</span>
    </div>
    <div class="score-grid-3x2">${lines}</div>
  </div>`;
}

function renderMeetingsEmbed(row, admin) {
  const addOpen = state.meetingAddOpen && state.detailRow?.companyId === row.companyId;
  const toolbar = `<div class="meeting-toolbar">
    <span class="sales-subsection-label">미팅 기록</span>
    ${admin ? detailIconBtn(addOpen ? "x" : "plus", addOpen ? "추가 취소" : "미팅 추가", { attrs: 'id="meeting-add-toggle"', size: 16 }) : ""}
  </div>`;
  const addForm =
    admin && addOpen
      ? `<div class="detail-form-grid cols-2 detail-form-compact meeting-add-row meeting-form-surface">
          <div class="inline-row span-2 meeting-schedule-row">
            <span class="inline-label">일시</span>
            ${meetingScheduleFieldsHtml(null, null)}
          </div>
          <div class="inline-row"><span class="inline-label">장소</span>${inlineInput("edit-meeting-location", "", "text")}</div>
          <div class="inline-row span-2"><span class="inline-label">참석</span>${inlineInput("edit-meeting-attendees", "", "text")}</div>
          <div class="inline-row span-2 inline-row-top"><span class="inline-label">요약</span>${richTextareaField("edit-meeting-summary", "", "미팅 내용", 3)}</div>
          <div class="inline-row span-2"><span class="inline-label">다음</span>${inlineInput("edit-meeting-next", "", "text")}</div>
        </div>
        <div class="meeting-add-actions">${detailIconBtn("check", "등록", { className: "detail-icon-btn-primary", attrs: 'id="meeting-add-btn"', size: 15 })}</div>`
      : "";
  return `<div class="sales-meetings-embed" data-company-meetings="${escapeAttr(row.companyId)}">
    ${toolbar}
    ${addForm}
    <div class="meeting-list-wrap"><p class="muted">미팅 기록 로딩…</p></div>
  </div>`;
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

async function withDetailBusy(text, fn) {
  if (state.detailBusy) return;
  state.detailBusy = true;
  setDetailLoading(true, text);
  try {
    return await fn();
  } finally {
    state.detailBusy = false;
    setDetailLoading(false);
  }
}

async function withButtonBusy(btn, busyLabel, fn) {
  if (!btn || btn.disabled) return;
  const prevText = btn.textContent;
  btn.disabled = true;
  if (busyLabel) btn.textContent = busyLabel;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    if (busyLabel && prevText != null) btn.textContent = prevText;
  }
}

function setMergeLoading(show, text = "병합 중…") {
  const panel = byId("mergeModal")?.querySelector(".modal-panel");
  const layer = byId("mergeLoading");
  const label = byId("mergeLoadingText");
  if (!layer) return;
  if (label) label.textContent = text;
  layer.classList.toggle("hidden", !show);
  layer.setAttribute("aria-hidden", show ? "false" : "true");
  panel?.classList.toggle("modal-busy", show);
  state.mergeBusy = show;
}

function finishDetailSave(companyId, { toastMessage = "정상 저장되었습니다.", exitSection = null } = {}) {
  if (exitSection) setSectionEdit(exitSection, false);
  reloadRowsWithAdmin();
  refreshViews();
  const row = state.rows.find((r) => r.companyId === companyId);
  if (!row) return;
  state.detailRow = row;
  window.__TCLIENT_DETAIL_ROW = row;
  window.__TCLIENT_DETAIL_EDIT = Object.keys(state.detailEditSections).length > 0;
  paintDetailModal();
  if (toastMessage) showToast(toastMessage);
}

function saveAndRefreshDetail(companyId) {
  finishDetailSave(companyId, { toastMessage: "" });
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
  const patch = {
    profile,
    domain: profile.domain || undefined,
    ...(profile.companyNameLegal ? { companyNameKo: profile.companyNameLegal } : {})
  };
  window.TClientAdmin.setEntry(row.companyId, patch);
  await window.TClientAdmin.flushPersist?.();
  reloadRowsWithAdmin();
  const updated = state.rows.find((r) => r.companyId === row.companyId) ?? row;
  if (window.TClientAdmin.recalculateCompanyScore) {
    window.TClientAdmin.recalculateCompanyScore(updated);
    await window.TClientAdmin.flushPersist?.();
    reloadRowsWithAdmin();
  }
  refreshViews();
  setEnrichBiznoStatus("수집 완료 · 저장되었습니다.");
  finishDetailSave(row.companyId, { exitSection: null, toastMessage: "회사 정보 수집이 완료되었습니다." });
}

async function waitForServerEnrichCore(row, bizNo, digits, onTick) {
  const prevProfile = window.TClientAdmin.getEntry(row.companyId).profile ?? {};
  window.TClientAdmin.setEntry(row.companyId, {
    profile: { ...prevProfile, bizNo: window.TEnrichBizno.formatBizNo?.(digits) || bizNo }
  });

  await window.TClientAdmin.dispatchEnrichCompany(row.companyId, bizNo);
  onTick?.();
  return window.TClientAdmin.waitForEnrichedProfile(row.companyId, digits, {
    timeoutMs: 90000,
    intervalMs: 3000,
    onTick
  });
}

async function waitForServerEnrich(row, bizNo, digits) {
  const started = Date.now();
  const tick = () => {
    const sec = Math.floor((Date.now() - started) / 1000);
    setDetailLoading(true, `서버에서 회사 정보 수집 중… (${sec}초)`);
    setEnrichBiznoStatus(`GitHub Actions가 bizno.net을 조회합니다. (${sec}초 경과)`);
  };
  return waitForServerEnrichCore(row, bizNo, digits, tick);
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

  if (state.detailBusy) return;

  await withDetailBusy("회사 정보를 수집하고 있습니다…", async () => {
    if (btn) btn.disabled = true;
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
      if (btn) btn.disabled = false;
    }
  });
}

async function runRecalcScore(row) {
  if (!window.TClientAdmin?.recalculateCompanyScore || state.detailBusy) return;
  const btn = byId("btn-recalc-score");
  await withDetailBusy("점수를 재집계합니다…", async () => {
    if (btn) btn.disabled = true;
    try {
      const fresh = state.rows.find((r) => r.companyId === row.companyId) ?? row;
      const result = window.TClientAdmin.recalculateCompanyScore(fresh);
      finishDetailSave(row.companyId, {
        toastMessage: `점수 재집계 완료 (${result.score}점 · ${result.grade}등급)`,
        exitSection: null
      });
    } catch (err) {
      showToast(err.message || "재집계 실패", "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

async function saveDetailSection(row, section) {
  return withDetailBusy("저장 중…", async () => {
  const cid = row.companyId;
  const pool = document.querySelector('input[name="edit-pool-class"]:checked')?.value ?? "normal";
  const prevSm = window.TSalesManagement?.get(cid) ?? {};

  const salesPatch = (fields) => fields;

  const persistCompany = async (overridePatch, sales = null) => {
    if (sales && window.TClientAdmin.isUnlocked()) {
      await window.TSalesManagement.upsert(cid, sales, row);
    }
    if (overridePatch && Object.keys(overridePatch).length) {
      window.TClientAdmin.setEntry(cid, overridePatch);
    }
    await window.TClientAdmin.flushPersist?.();
    finishDetailSave(cid, { exitSection: section, toastMessage: "저장되었습니다." });
  };

  if (section === "summary") {
    await persistCompany(
      {
        companyNameKo: byId("edit-name-ko")?.value.trim(),
        companyTier: byId("edit-tier")?.value,
        excludeReason: byId("edit-exclude")?.value.trim()
      },
      salesPatch({
        isHidden: pool === "hidden",
        isRecommended: pool === "recommended",
        isCandidate: false,
        recommendedSince: pool === "recommended" ? prevSm.recommendedSince || new Date().toISOString() : "",
        candidateSince: "",
        memo: byId("edit-notes")?.value.trim()
      })
    );
    return;
  }

  if (section === "sales") {
    const closedReason = byId("edit-closed-reason")?.value ?? "";
    const isClosed = Boolean(closedReason);
    const operationalStatus = byId("edit-pipeline-status")?.value ?? "pending";
    await persistCompany(
      null,
      salesPatch({
        pipelineStage: byId("edit-pipeline-stage")?.value ?? "",
        pipelineStatus: isClosed ? "closed" : operationalStatus,
        closedReason: isClosed ? closedReason : ""
      })
    );
    return;
  }

  if (section === "progress") {
    await persistCompany(
      null,
      salesPatch({
        testStartedAt: readMpickerDateIso("edit-test-started"),
        testEndedAt: readMpickerDateIso("edit-test-ended"),
        testNotes: byId("edit-test-notes")?.value.trim()
      })
    );
    return;
  }

  if (section === "eval") {
    const gradeEl = byId("edit-grade");
    const gradePatch = gradeEl ? { leadGrade: gradeEl.value } : {};
    const parts = {};
    document.querySelectorAll(".score-part-input").forEach((inp) => {
      const v = inp.value.trim();
      if (v !== "") parts[inp.dataset.scorePart] = v;
    });
    const total = byId("edit-score-total")?.value.trim() ?? "";
    if (total !== "") parts._total = total;
    const companyPatch = { ...gradePatch, ...(Object.keys(parts).length ? { scoreParts: parts } : {}) };
    await persistCompany(
      Object.keys(companyPatch).length ? companyPatch : null,
      salesPatch({
        recommendScore: parseStarSelect(byId("edit-cand-score")?.value),
        pilotDifficulty: parseStarSelect(byId("edit-cand-pilot")?.value),
        recommendScoreReason: byId("edit-recommend-reason")?.value.trim(),
        pilotDifficultyReason: byId("edit-pilot-reason")?.value.trim(),
        evaluationNotes: byId("edit-eval-notes")?.value.trim()
      })
    );
    return;
  }

  if (section === "profile") {
    await persistCompany({
      profile: {
        serviceName: byId("edit-prof-service")?.value.trim(),
        serviceUrl: byId("edit-prof-service-url")?.value.trim(),
        companyNameLegal: byId("edit-prof-legal")?.value.trim(),
        bizNo: formatBizNoDisplay(byId("edit-prof-bizno")?.value.trim()),
        bizType: byId("edit-prof-type")?.value.trim(),
        bizItem: byId("edit-prof-item")?.value.trim(),
        companyScale: byId("edit-prof-scale")?.value.trim(),
        bizStatus: byId("edit-prof-status")?.value.trim(),
        foundedDate: byId("edit-prof-founded")?.value.trim(),
        employeeCount: byId("edit-prof-emp")?.value.trim(),
        homepage: byId("edit-prof-home")?.value.trim(),
        industrySummary: byId("edit-prof-industry")?.value.trim()
      },
      domain: byId("edit-prof-domain")?.value.trim()
    });
    return;
  }

  if (section === "posts") {
    const postUrl = byId("edit-post-url")?.value.trim();
    const overridePatch = {};
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
    await persistCompany(overridePatch);
    return;
  }
  });
}

function bindDetailHeaderEdits() {
  const drawer = byId("detailDrawer");
  if (!drawer || drawer.dataset.headerEditBound === "1") return;
  drawer.dataset.headerEditBound = "1";

  byId("detailEditBtn")?.addEventListener("click", () => {
    if (!window.TClientAdmin?.isUnlocked?.()) {
      window.openAdminPopover?.();
      return;
    }
    setSectionEdit("summary", true);
    paintDetailModal();
  });

  byId("detail-summary-cancel")?.addEventListener("click", () => {
    setSectionEdit("summary", false);
    paintDetailModal();
  });

  byId("detail-summary-save")?.addEventListener("click", async () => {
    const row = state.detailRow;
    if (!row) return;
    try {
      await saveDetailSection(row, "summary");
    } catch (err) {
      showToast(err.message || "저장 실패", "error");
    }
  });
}

function bindDetailSectionEdits() {
  const body = byId("detailBody");
  if (!body || body.dataset.sectionBound === "1") return;
  body.dataset.sectionBound = "1";

  body.addEventListener("change", (e) => {
    if (e.target?.id === "edit-tier") syncSummaryTierChip(e.target);
  });

  body.addEventListener("click", async (e) => {
    const row = state.detailRow;
    if (!row) return;

    if (e.target?.closest?.(".detail-section-actions button")) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (e.target?.closest?.(".meeting-mini-details summary, .cell-opinion-details summary")) {
      e.stopPropagation();
    }

    const contactEditBtn = e.target?.closest?.(".contact-edit-btn");
    if (contactEditBtn && window.TClientAdmin?.isUnlocked?.()) {
      e.preventDefault();
      state.contactEditIndex = Number.parseInt(contactEditBtn.dataset.contactIndex, 10);
      state.contactAddOpen = false;
      refreshContactsPanel(row);
      return;
    }

    const contactCancelBtn = e.target?.closest?.(".contact-cancel-btn");
    if (contactCancelBtn) {
      e.preventDefault();
      state.contactEditIndex = null;
      state.contactAddOpen = false;
      refreshContactsPanel(row);
      return;
    }

    const contactSaveBtn = e.target?.closest?.(".contact-save-btn");
    if (contactSaveBtn && window.TClientAdmin?.isUnlocked?.()) {
      e.preventDefault();
      const card = contactSaveBtn.closest(".sales-contact-edit-card");
      const updated = readContactCard(card);
      if (!hasContactData(updated)) {
        showToast("이름, 이메일, 전화 중 하나 이상 입력하세요.", "error");
        return;
      }
      const list = normalizeContactList(row);
      const idx = Number.parseInt(card?.dataset.contactIndex ?? contactSaveBtn.dataset.contactIndex, 10);
      if (card?.dataset.contactNew === "1" || Number.isNaN(idx)) {
        list.push(updated);
      } else {
        list[idx] = updated;
      }
      try {
        await withDetailBusy("담당자 저장 중…", async () => {
          await persistContactsPatch(row, list);
          state.contactEditIndex = null;
          state.contactAddOpen = false;
        });
        showToast("담당자 정보가 저장되었습니다.");
      } catch (err) {
        showToast(err.message || "담당자 저장 실패", "error");
      }
      return;
    }

    if (e.target?.closest?.("#contact-add-toggle") && window.TClientAdmin?.isUnlocked?.()) {
      e.preventDefault();
      state.contactAddOpen = !state.contactAddOpen;
      if (state.contactAddOpen) state.contactEditIndex = null;
      refreshContactsPanel(row);
      return;
    }

    const contactDelBtn = e.target?.closest?.(".contact-del-btn");
    if (contactDelBtn && window.TClientAdmin?.isUnlocked?.()) {
      e.preventDefault();
      const idx = Number.parseInt(contactDelBtn.dataset.contactIndex, 10);
      const list = normalizeContactList(row);
      if (idx < 0 || idx >= list.length) return;
      list.splice(idx, 1);
      try {
        await withDetailBusy("담당자 삭제 중…", async () => {
          await persistContactsPatch(row, list);
          if (state.contactEditIndex === idx) state.contactEditIndex = null;
        });
        showToast("담당자가 삭제되었습니다.");
      } catch (err) {
        showToast(err.message || "담당자 삭제 실패", "error");
      }
      return;
    }

    const editBtn = e.target?.closest?.("[data-section-edit]");
    if (editBtn) {
      const sectionKey = editBtn.dataset.sectionEdit;
      setSectionEdit(sectionKey, true);
      if (sectionKey) state.detailOpenSections.add(sectionKey);
      paintDetailModal();
      return;
    }

    const cancelBtn = e.target?.closest?.("[data-section-cancel]");
    if (cancelBtn) {
      const sectionKey = cancelBtn.dataset.sectionCancel;
      setSectionEdit(sectionKey, false);
      if (sectionKey) state.detailOpenSections.add(sectionKey);
      paintDetailModal();
      return;
    }

    const saveBtn = e.target?.closest?.("[data-section-save]");
    if (saveBtn) {
      try {
        await saveDetailSection(row, saveBtn.dataset.sectionSave);
      } catch (err) {
        showToast(err.message || "저장 실패", "error");
      }
      return;
    }

    if (e.target?.closest?.("#btn-enrich-bizno")) {
      void runEnrichBizNo(row);
      return;
    }

    if (e.target?.closest?.("#btn-recalc-score")) {
      void runRecalcScore(row);
      return;
    }

    const fileDelBtn = e.target?.closest?.(".file-del-btn");
    if (fileDelBtn && isSectionEdit("progress")) {
      e.preventDefault();
      try {
        await withDetailBusy("파일 삭제 중…", async () => {
          await window.TCompanyFiles.remove(fileDelBtn.dataset.fileId, row.companyId, fileDelBtn.dataset.storagePath || "");
          await hydrateDetailExtras(row);
        });
      } catch (err) {
        showToast(err.message || "파일 삭제 실패", "error");
      }
      return;
    }

    if (e.target?.closest?.("#file-upload-btn") && isSectionEdit("progress")) {
      e.preventDefault();
      const fileInput = byId("edit-file-input");
      const file = fileInput?.files?.[0];
      if (!file) {
        showToast("업로드할 파일을 선택하세요.", "error");
        return;
      }
      try {
        await withDetailBusy("파일 업로드 중…", async () => {
          await window.TCompanyFiles.uploadFile(row.companyId, file, {
            title: byId("edit-file-title")?.value.trim() || file.name
          });
          if (fileInput) fileInput.value = "";
          const fileNameEl = byId("edit-file-name");
          if (fileNameEl) fileNameEl.textContent = "없음";
          const titleEl = byId("edit-file-title");
          if (titleEl) titleEl.value = "";
          await hydrateDetailExtras(row);
        });
        showToast("파일이 업로드되었습니다.");
      } catch (err) {
        showToast(err.message || "파일 업로드 실패", "error");
      }
      return;
    }

    if (e.target?.closest?.("[data-rich-action='bold']")) {
      e.preventDefault();
      const field = e.target.closest(".rich-text-field")?.querySelector("textarea");
      wrapTextareaSelection(field);
      return;
    }

    const meetingEditBtn = e.target?.closest?.(".meeting-edit-btn");
    if (meetingEditBtn && window.TClientAdmin?.isUnlocked?.()) {
      e.preventDefault();
      state.meetingEditId = meetingEditBtn.dataset.noteId || null;
      state.meetingAddOpen = false;
      void hydrateDetailExtras(row);
      return;
    }

    const meetingCancelBtn = e.target?.closest?.(".meeting-cancel-btn");
    if (meetingCancelBtn) {
      e.preventDefault();
      state.meetingEditId = null;
      void hydrateDetailExtras(row);
      return;
    }

    const meetingSaveBtn = e.target?.closest?.(".meeting-save-btn");
    if (meetingSaveBtn && window.TClientAdmin?.isUnlocked?.()) {
      e.preventDefault();
      const card = meetingSaveBtn.closest(".meeting-edit-card");
      const patch = readMeetingCard(card);
      if (!patch?.id) return;
      try {
        await withDetailBusy("미팅 저장 중…", async () => {
          await window.TMeetingNotes.upsert(row.companyId, patch);
          state.meetingEditId = null;
          await hydrateDetailExtras(row);
        });
        showToast("미팅이 저장되었습니다.");
      } catch (err) {
        showToast(err.message || "미팅 저장 실패", "error");
      }
      return;
    }

    if (e.target?.closest?.("#meeting-add-toggle") && window.TClientAdmin?.isUnlocked?.()) {
      e.preventDefault();
      state.meetingAddOpen = !state.meetingAddOpen;
      if (state.meetingAddOpen) state.meetingEditId = null;
      refreshMeetingsPanel(row);
      return;
    }

    if (e.target?.closest?.("#meeting-add-toggle-inline") && window.TClientAdmin?.isUnlocked?.()) {
      e.preventDefault();
      state.meetingAddOpen = true;
      state.meetingEditId = null;
      refreshMeetingsPanel(row);
      return;
    }

    const meetingDelBtn = e.target?.closest?.(".meeting-del-btn");
    if (meetingDelBtn && window.TClientAdmin?.isUnlocked?.()) {
      e.preventDefault();
      try {
        await withDetailBusy("미팅 삭제 중…", async () => {
          await window.TMeetingNotes.remove(meetingDelBtn.dataset.noteId, row.companyId);
          if (state.meetingEditId === meetingDelBtn.dataset.noteId) state.meetingEditId = null;
          await hydrateDetailExtras(row);
        });
        showToast("미팅이 삭제되었습니다.");
      } catch (err) {
        showToast(err.message || "미팅 삭제 실패", "error");
      }
      return;
    }

    if (e.target?.closest?.("#meeting-add-btn") && window.TClientAdmin?.isUnlocked?.()) {
      e.preventDefault();
      const addRow = document.querySelector(".meeting-add-row");
      const schedule = readMeetingSchedule(addRow);
      try {
        await withDetailBusy("미팅 추가 중…", async () => {
          await window.TMeetingNotes.upsert(row.companyId, {
            meetingAt: schedule.meetingAt,
            durationHours: schedule.durationHours,
            location: byId("edit-meeting-location")?.value.trim(),
            attendees: byId("edit-meeting-attendees")?.value.trim(),
            summary: byId("edit-meeting-summary")?.value.trim(),
            nextAction: byId("edit-meeting-next")?.value.trim()
          });
          addRow?.querySelectorAll("input, select, textarea").forEach((el) => {
            if (el.tagName === "SELECT") el.selectedIndex = 0;
            else el.value = "";
          });
          await hydrateDetailExtras(row);
          state.meetingAddOpen = false;
          refreshMeetingsPanel(row);
        });
        showToast("미팅 기록이 추가되었습니다.");
      } catch (err) {
        showToast(err.message || "미팅 저장 실패", "error");
      }
    }
  });

  body.addEventListener("change", (e) => {
    if (e.target?.id !== "edit-file-input") return;
    const file = e.target.files?.[0];
    const fileNameEl = byId("edit-file-name");
    const titleEl = byId("edit-file-title");
    if (fileNameEl) fileNameEl.textContent = file?.name || "없음";
    if (titleEl && file?.name) titleEl.value = file.name;
  });
}

function bindDetailSectionToggles() {
  const body = byId("detailBody");
  if (!body || body.dataset.sectionToggleBound === "1") return;
  body.dataset.sectionToggleBound = "1";
  body.addEventListener(
    "toggle",
    (e) => {
      const el = e.target;
      if (!el?.matches?.("details.drawer-section[data-section-key]")) return;
      const key = el.dataset.sectionKey;
      if (!key) return;
      if (el.open) state.detailOpenSections.add(key);
      else state.detailOpenSections.delete(key);
    },
    true
  );
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
    const applied = window.TClientAdmin ? window.TClientAdmin.applyToRow(enriched) : enriched;
    return withFormattedProfileBizNo(applied);
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

function formatBizNoDisplay(bizNo) {
  if (window.TEnrichBizno?.formatBizNoDisplay) return window.TEnrichBizno.formatBizNoDisplay(bizNo);
  const digits = normalizeBizNoDigits(bizNo);
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  return `${bizNo ?? ""}`.trim();
}

function withFormattedProfileBizNo(row) {
  if (!row?.profile?.bizNo) return row;
  const formatted = formatBizNoDisplay(row.profile.bizNo);
  if (formatted === row.profile.bizNo) return row;
  return { ...row, profile: { ...row.profile, bizNo: formatted } };
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
    bizNo: formatBizNoDisplay(p.bizNo ?? ""),
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
  const formatted = formatBizNoDisplay(bizNo || enrichProfile?.bizNo || "");
  const patch = {
    profile: { ...(enrichProfile ?? {}), ...(formatted ? { bizNo: formatted } : {}) }
  };
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

function profileFromStoredProfile(p) {
  if (!p) return null;
  let domain = `${p.domain ?? ""}`.trim();
  if (!domain && p.homepage) {
    try {
      const url = `${p.homepage}`.startsWith("http") ? p.homepage : `https://${p.homepage}`;
      domain = new URL(url).hostname.replace(/^www\./i, "");
    } catch {
      /* ignore */
    }
  }
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
    industrySummary: p.industrySummary ?? "",
    domain
  };
}

function getCustomCompanyRow(companyId) {
  return window.TClientAdmin?.getCustomCompanies?.()?.find((r) => r.companyId === companyId) ?? null;
}

function applyEnrichToManualCompany(companyId, enrichProfile, nameFallback = "") {
  if (!enrichProfile) return null;
  const companyName = enrichProfile.companyNameLegal?.trim() || `${nameFallback}`.trim();
  const profile = profilePatchFromEnrich(enrichProfile);
  const patch = {
    companyNameKo: companyName,
    companyName: companyName,
    domain: enrichProfile.domain || undefined,
    profile
  };
  window.TClientAdmin.updateCustomCompany(companyId, patch);
  window.TClientAdmin.setEntry(companyId, {
    companyNameKo: companyName,
    ...(enrichProfile.domain ? { domain: enrichProfile.domain } : {}),
    profile
  });
  return getCustomCompanyRow(companyId);
}

async function enrichProfileByBizNo(bizNo, companyId, onStatus) {
  const digits = normalizeBizNoDigits(bizNo);
  if (digits.length !== 10) return null;

  onStatus?.("사업자 정보 조회 중…");
  const browser = await lookupEnrichProfile(bizNo);
  if (browser) return browser;

  if (!companyId || !window.TClientAdmin?.dispatchEnrichCompany) return null;

  const started = Date.now();
  const tick = () => {
    const sec = Math.floor((Date.now() - started) / 1000);
    onStatus?.(`서버에서 사업자 정보 조회 중… (${sec}초)`);
  };
  try {
    const waited = await waitForServerEnrichCore({ companyId }, bizNo, digits, tick);
    if (waited.ok && waited.profile) return profileFromStoredProfile(waited.profile);
  } catch {
    /* ignore */
  }
  return null;
}

function resolveManualCompanyName(enrichProfile, nameHint = "") {
  return enrichProfile?.companyNameLegal?.trim() || `${nameHint ?? ""}`.trim() || "수동 등록 회사";
}

async function resolveCompanyForManualPost(url, bizNo, nameHint = "", onStatus) {
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

  let resolvedEnrich = enrichProfile;
  const companyNameKo = resolveManualCompanyName(resolvedEnrich, nameHint);
  const domain = resolvedEnrich?.domain || domainFromPostUrl(url);
  const row = buildManualCompanyRow({
    companyNameKo,
    domain,
    bizNo: resolvedEnrich?.bizNo || bizNo || "",
    profile: profilePatchFromEnrich(resolvedEnrich)
  });
  if (!window.TClientAdmin.addCustomCompany(row)) return { row: null, created: false, enrichProfile: resolvedEnrich };
  try {
    await window.TCompanies.upsertManual(row);
    if (bizNo && !resolvedEnrich) {
      resolvedEnrich = await enrichProfileByBizNo(bizNo, row.companyId, onStatus);
      if (resolvedEnrich) {
        applyEnrichToManualCompany(row.companyId, resolvedEnrich, nameHint);
        await window.TCompanies.upsertManual(getCustomCompanyRow(row.companyId) ?? row);
      }
    }
  } catch (err) {
    await window.TClientAdmin.removeCustomCompany(row.companyId);
    throw err;
  }
  const saved = getCustomCompanyRow(row.companyId) ?? row;
  return { row: saved, created: true, enrichProfile: resolvedEnrich };
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
    profile: profile ?? (bizNo ? { bizNo: formatBizNoDisplay(bizNo) } : {}),
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
  const list = normalizeContactList(row);
  if (!list.length) return row.contactSecured === "yes" ? "확보" : "미확보";
  const first = list[0];
  if (list.length === 1) return escapeHtml(first.name || first.email || "확보");
  const label = first.name || first.email || "담당자";
  return `${escapeHtml(label)} 외 ${list.length - 1}명`;
}

function companyNameById(id) {
  const row = state.rows.find((r) => r.companyId === id);
  return row ? displayName(row) : id;
}

function priorityValue(row) {
  return Number.parseInt(`${row.priorityScore ?? 0}`, 10) || 0;
}

function notionPriorityValue(row) {
  const n = Number.parseInt(`${row.notionPriority ?? 0}`, 10);
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
}

function hasFailedPosts(row) {
  return row.posts.some((p) => p.failureReason);
}

function syncCustomSelects() {
  document.querySelectorAll(".cselect select.select-pill").forEach((sel) => {
    const wrap = sel.parentElement;
    const trigger = wrap?.querySelector(".cselect-trigger");
    const opt = sel.options[sel.selectedIndex];
    if (trigger && opt) trigger.textContent = opt.textContent.trim();
    wrap?.querySelectorAll(".cselect-opt").forEach((li) => {
      const option = sel.querySelector(`option[value="${CSS.escape(li.dataset.value)}"]`);
      const hidden = option?.hidden || option?.disabled;
      li.hidden = hidden;
      li.style.display = hidden ? "none" : "";
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

function resolveBizStatusBucket(row) {
  const status = `${row.profile?.bizStatus ?? ""}`.trim();
  if (!status) return "unknown";
  if (/폐업|휴업|말소/.test(status)) return "closed";
  if (/계속/.test(status)) return "active";
  return "unknown";
}

function resetTabFilters() {
  byId("search").value = "";
  ["grade", "pipelineStage", "pipelineStatus", "contact", "tier", "bizStatus"].forEach((id) => {
    const el = byId(id);
    if (el) el.value = "";
  });
  state.leadsPage = 1;
  state.postsPage = 1;
  state.excludedPage = 1;
  toggleFilterAdvanced(false);
  syncCustomSelects();
}

function resetFilters() {
  resetTabFilters();
  applySortForTab(state.activeTab, { forceDefault: true });
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

/** KPI·배너·등급 분포: 활성(제외·숨김 아님) 리드만 */
function isActiveLead(row) {
  return isListableLead(row) && !isShelvedLead(row);
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

function defaultActionKpiForTab(tabId) {
  const map = {
    leads: "total",
    posts: "posts",
    recommended: "recommended",
    in_progress: "inProgress",
    excluded: "excluded"
  };
  return map[tabId] ?? null;
}

function activeActionKpiIds() {
  const tab = state.activeTab;
  if (tab === "in_progress") {
    const focus = state.actionKpiFocus;
    if (focus === "contractWon" || focus === "inProgress") return [focus];
    return ["inProgress"];
  }
  const id = defaultActionKpiForTab(tab);
  return id ? [id] : [];
}

function highlightActionKpiCards() {
  const activeIds = new Set(activeActionKpiIds());
  byId("dashboard")?.querySelectorAll("[data-kpi-id]").forEach((card) => {
    card.classList.toggle("kpi-card-active", activeIds.has(card.dataset.kpiId));
  });
}

const ACTION_KPI_TAB_MAP = {
  total: "leads",
  posts: "posts",
  recommended: "recommended",
  inProgress: "in_progress",
  contractWon: "in_progress",
  excluded: "excluded"
};

const ACTION_KPI_TAB_LABEL = {
  leads: "회사",
  posts: "공고",
  recommended: "추천",
  in_progress: "진행",
  excluded: "제외"
};

function bindActionKpiCards() {
  const dash = byId("dashboard");
  if (!dash || dash.dataset.kpiBound === "1") return;
  dash.dataset.kpiBound = "1";
  dash.addEventListener("click", (e) => {
    const card = e.target?.closest?.("[data-kpi-id]");
    if (!card) return;
    const tabId = ACTION_KPI_TAB_MAP[card.dataset.kpiId];
    if (tabId) switchTab(tabId, { resetFilters: true, kpiFocus: card.dataset.kpiId });
  });
  dash.addEventListener("keydown", (e) => {
    const card = e.target?.closest?.("[data-kpi-id]");
    if (!card || (e.key !== "Enter" && e.key !== " ")) return;
    const tabId = ACTION_KPI_TAB_MAP[card.dataset.kpiId];
    if (!tabId) return;
    e.preventDefault();
    switchTab(tabId, { resetFilters: true, kpiFocus: card.dataset.kpiId });
  });
}

function passesFilters(row) {
  const q = byId("search").value.toLowerCase().trim();
  const grade = byId("grade").value;
  const stageFilter = byId("pipelineStage")?.value ?? "";
  const statusFilter = byId("pipelineStatus")?.value ?? "";
  const contact = byId("contact").value;
  const bizStatusFilter = byId("bizStatus")?.value ?? "";
  const { pipelineStage, pipelineStatus } = resolveRowPipeline(row);

  const haystack = `${displayName(row)} ${row.companyName} ${row.domain} ${row.profile?.bizItem ?? ""} ${row.profile?.bizType ?? ""} ${row.profile?.companyScale ?? ""} ${row.profile?.bizStatus ?? ""}`.toLowerCase();
  if (q && !haystack.includes(q)) return false;
  if (grade && row.leadGrade !== grade) return false;
  if (stageFilter && pipelineStage !== stageFilter) return false;
  if (statusFilter && pipelineStatus !== statusFilter) return false;
  if (contact && row.contactSecured !== contact) return false;
  if (bizStatusFilter && resolveBizStatusBucket(row) !== bizStatusFilter) return false;
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

function sortRows(rows) {
  let mode = byId("sort")?.value || "score";
  if (mode === "priority" || mode === "grade") mode = "score";
  const list = [...rows];

  list.sort((a, b) => {
    if (mode === "notion") {
      const rankDiff = notionPriorityValue(a) - notionPriorityValue(b);
      if (rankDiff !== 0) return rankDiff;
      const byScore = priorityValue(b) - priorityValue(a);
      if (byScore !== 0) return byScore;
      return displayName(a).localeCompare(displayName(b), "ko");
    }

    if (mode === "score") {
      const gradeOrder = { A: 3, B: 2, C: 1 };
      const diff = (gradeOrder[b.leadGrade] ?? 0) - (gradeOrder[a.leadGrade] ?? 0);
      if (diff !== 0) return diff;
      const byScore = priorityValue(b) - priorityValue(a);
      if (byScore !== 0) return byScore;
      const sa = pipelineLabels().stageOrder?.(a.pipelineStage) ?? 0;
      const sb = pipelineLabels().stageOrder?.(b.pipelineStage) ?? 0;
      if (sa !== sb) return sb - sa;
      return displayName(a).localeCompare(displayName(b), "ko");
    }

    if (mode === "recent") {
      const byLast = new Date(b.lastCollectedAt || 0) - new Date(a.lastCollectedAt || 0);
      if (byLast !== 0) return byLast;
      const byFirst = new Date(b.firstCollectedAt || 0) - new Date(a.firstCollectedAt || 0);
      if (byFirst !== 0) return byFirst;
      return displayName(a).localeCompare(displayName(b), "ko");
    }

    if (mode === "new") {
      const byFirst = new Date(b.firstCollectedAt || 0) - new Date(a.firstCollectedAt || 0);
      if (byFirst !== 0) return byFirst;
      const byLast = new Date(b.lastCollectedAt || 0) - new Date(a.lastCollectedAt || 0);
      if (byLast !== 0) return byLast;
      return displayName(a).localeCompare(displayName(b), "ko");
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
  const P = pipelineLabels();
  const posts = active.reduce((n, r) => n + (r.posts?.length ?? 0), 0);
  return {
    total: active.length,
    posts,
    recommended: active.filter((r) => P.rowMatchesRecommendedTab?.(r)).length,
    inProgress: active.filter((r) => P.rowMatchesInProgressTab?.(r)).length,
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
    { id: "posts", icon: "fileText", value: kpi.posts, label: "공고", tone: "muted" },
    { id: "excluded", icon: "ban", value: kpi.excluded, label: "제외", tone: "muted" },
    { id: "recommended", icon: "target", value: kpi.recommended, label: "추천", tone: "emphasis-3" },
    { id: "inProgress", icon: "fileText", value: kpi.inProgress, label: "진행", tone: "emphasis-2" },
    { id: "contractWon", icon: "briefcase", value: kpi.contractWon, label: "계약 성공", tone: "emphasis-1" }
  ];

  return `<div class="action-kpi-grid">${cards
    .map((c) => {
      const tabId = ACTION_KPI_TAB_MAP[c.id];
      const tabLabel = tabId ? ACTION_KPI_TAB_LABEL[tabId] : "";
      const clickClass = tabId ? " kpi-card-clickable" : "";
      const clickAttrs = tabId
        ? ` role="button" tabindex="0" title="${escapeAttr(`${tabLabel} 탭으로 이동`)}"`
        : "";
      return `
    <div class="kpi-card kpi-card-${c.tone}${clickClass}" data-kpi-id="${c.id}"${clickAttrs}>
      <span class="kpi-card-icon" aria-hidden="true">${iconSvg(c.icon, 20)}</span>
      <span class="kpi-card-value">${c.value}</span>
      <span class="kpi-card-label">${escapeHtml(c.label)}</span>
    </div>`;
    })
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

function renderCompanyCell(row, { showPoolBadge = true, showManualBadge = true, compactMeta = false } = {}) {
  const svc = serviceName(row);
  const svcUrl = serviceUrl(row);
  const svcHtml = svc
    ? svcUrl
      ? `<a class="cell-service link" href="${escapeAttr(svcUrl)}" target="_blank" rel="noreferrer">${escapeHtml(svc)}</a>`
      : `<span class="cell-service">${escapeHtml(svc)}</span>`
    : "";
  const metaChips = companyMetaChips(row, { compact: compactMeta });
  return `<div class="cell-company">
      <div class="company-line">
        <strong>${escapeHtml(displayName(row))}</strong>
        ${newBadge(row)}
        ${showManualBadge ? manualBadge(row) : ""}
        ${showPoolBadge ? poolClassBadge(row) : ""}
        ${metaChips ? `<span class="company-meta-chips">${metaChips}</span>` : ""}
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
      if (e.target.closest("a, button, summary, .cell-opinion-details")) return;
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

function refreshDetailAdminButtons() {
  const admin = Boolean(window.TClientAdmin?.isUnlocked?.());
  const summaryEditing = isSectionEdit("summary");
  const specs = [
    { id: "detailMergeBtn", lockedTitle: "관리자 로그인 후 병합" },
    { id: "detailEditBtn", lockedTitle: "관리자 로그인 후 요약 수정" },
    { id: "detailDeleteBtn", lockedTitle: "관리자 로그인 후 삭제" }
  ];
  for (const spec of specs) {
    const btn = byId(spec.id);
    if (!btn) continue;
    btn.classList.toggle("hidden", !admin || (summaryEditing && spec.id === "detailEditBtn"));
    btn.classList.toggle("is-locked", !admin);
    btn.classList.toggle("is-active", summaryEditing && spec.id === "detailEditBtn");
    btn.title = admin ? btn.dataset.titleActive || btn.title : spec.lockedTitle;
  }
  byId("detailSummaryEditActions")?.classList.toggle("hidden", !admin || !summaryEditing);
}

function renderDetailTitleHtml(row) {
  const nameTags = companyMetaChips(row, { compact: true });
  const companyLine = `<span class="detail-title-row-inline">
    <span class="detail-title-company">${escapeHtml(displayName(row))}</span>
    ${nameTags ? `<span class="detail-header-name-tags company-meta-chips">${nameTags}</span>` : ""}
  </span>`;
  const svc = serviceName(row);
  return svc ? `${companyLine}<span class="detail-title-service">${escapeHtml(svc)}</span>` : companyLine;
}

function paintDetailHeader(row) {
  byId("detailTitle").innerHTML = renderDetailTitleHtml(row);
  const sub = byId("detailHeaderSub");
  if (sub) {
    sub.innerHTML = renderDetailHeaderSub(row);
    sub.classList.toggle("hidden", !companySubline(row) && !`${row.salesMemo ?? row.manualNotes ?? ""}`.trim());
  }
  const chips = byId("detailHeaderChips");
  if (chips) {
    const items = [newBadge(row)].filter(Boolean);
    chips.innerHTML = items.join("");
    chips.classList.toggle("hidden", !items.length);
  }
  const stats = byId("detailHeaderStats");
  if (stats) {
    stats.innerHTML = renderDrawerStatsCompact(row);
  }
  refreshDetailAdminButtons();
  hydrateIcons(byId("detailDrawer"));
}

function syncSummaryTierChip(select = byId("edit-tier")) {
  const wrap = select?.closest?.(".summary-tier-chip");
  if (!wrap) return;
  wrap.classList.remove("is-tier-auto", "is-tier-startup", "is-tier-mid", "is-tier-enterprise", "is-tier-unknown");
  const v = `${select.value ?? ""}`.trim();
  wrap.classList.add(`is-tier-${v || "auto"}`);
}

function renderSummaryEditForm(row, e, tierVal, pool) {
  const tierKey = tierVal || "auto";
  const nameVal = e.companyNameKo || row.companyNameKo || "";
  return `<div class="summary-edit-form">
    <div class="summary-edit-head">
      <div class="summary-name-field">
        <input type="text" id="edit-name-ko" class="summary-name-input" value="${escapeAttr(nameVal)}" placeholder="회사명" autocomplete="organization" />
        <div class="summary-tier-chip is-tier-${escapeAttr(tierKey)}" title="규모">
          <span class="summary-tier-dot" aria-hidden="true"></span>
          ${tierSelectCompact("edit-tier", tierVal)}
        </div>
      </div>
      <div class="summary-pool-field">
        <span class="summary-pool-label">분류</span>
        <div class="summary-pool-segmented" role="group" aria-label="분류">
          <label class="summary-pool-opt" data-pool="normal">
            <input type="radio" name="edit-pool-class" value="normal"${pool === "normal" ? " checked" : ""} />
            <span class="summary-pool-opt-inner">${iconSvg("user", 13)}<span>후보</span></span>
          </label>
          <label class="summary-pool-opt" data-pool="recommended">
            <input type="radio" name="edit-pool-class" value="recommended"${pool === "recommended" ? " checked" : ""} />
            <span class="summary-pool-opt-inner">${iconSvg("target", 13)}<span>추천</span></span>
          </label>
          <label class="summary-pool-opt" data-pool="hidden">
            <input type="radio" name="edit-pool-class" value="hidden"${pool === "hidden" ? " checked" : ""} />
            <span class="summary-pool-opt-inner">${iconSvg("archive", 13)}<span>숨김</span></span>
          </label>
        </div>
      </div>
    </div>
    <div class="summary-edit-row">
      <label class="summary-edit-field summary-edit-exclude" for="edit-exclude">
        <span class="summary-field-label">제외 사유</span>
        ${inlineInput("edit-exclude", e.excludeReason ?? row.excludeReason ?? "", "text", "없으면 비워두세요")}
      </label>
    </div>
    <label class="summary-edit-field summary-edit-memo" for="edit-notes">
      <span class="summary-field-label">의견</span>
      ${inlineTextarea("edit-notes", row.salesMemo ?? row.manualNotes ?? "", "의견을 입력하세요", 3)}
    </label>
  </div>`;
}

function renderDetailBody(row, admin = false) {
  const e = window.TClientAdmin?.getEntry(row.companyId) ?? {};
  const p = { ...(row.profile ?? {}), ...(e.profile ?? {}) };
  const c = row.contact ?? {};
  const tierVal = e.companyTier || row.companyTier || "";
  const email = c.email || row.email || "";
  const pool = poolClassOf(row);

  const editSummary = isSectionEdit("summary");
  const editSales = isSectionEdit("sales");
  const editProgress = isSectionEdit("progress");
  const editEval = isSectionEdit("eval");
  const editProfile = isSectionEdit("profile");
  const editPosts = isSectionEdit("posts");

  const summaryBlock = editSummary ? renderSummaryEditForm(row, e, tierVal, pool) : "";

  const salesWithMeetings = `<div class="sales-section-stack">
    ${renderSalesPipelineBar(row, { edit: editSales })}
    ${renderContactsEmbed(row, admin)}
    ${renderMeetingsEmbed(row, admin)}
  </div>`;

  const evalViewBlock = editEval
    ? `<div class="detail-form-grid cols-2 detail-form-compact">
        <div class="inline-row"><span class="inline-label">추천</span>${inlineSelect("edit-cand-score", scoreSelectValue(row.recommendScore), [["","(선택)"],["5","★★★★★"],["4","★★★★☆"],["3","★★★☆☆"],["2","★★☆☆☆"],["1","★☆☆☆☆"]])}</div>
        <div class="inline-row"><span class="inline-label">파일럿</span>${inlineSelect("edit-cand-pilot", scoreSelectValue(row.pilotDifficulty), [["","(선택)"],["1","★☆☆"],["2","★★☆"],["3","★★★"]])}</div>
        <div class="inline-row span-2"><span class="inline-label">추천 근거</span>${inlineInput("edit-recommend-reason", row.recommendScoreReason ?? "")}</div>
        <div class="inline-row span-2"><span class="inline-label">파일럿 근거</span>${inlineInput("edit-pilot-reason", row.pilotDifficultyReason ?? "")}</div>
        <div class="inline-row span-2"><span class="inline-label">평가 메모</span>${inlineInput("edit-eval-notes", row.evaluationNotes ?? "")}</div>
      </div>`
    : `<div class="detail-eval-summary">
        <div class="detail-score-box"><span class="detail-score-label">추천</span>${renderStarRating(row.recommendScore, 5)}</div>
        <div class="detail-score-box"><span class="detail-score-label">파일럿</span>${renderStarRating(row.pilotDifficulty, 3)}</div>
        ${row.recommendScoreReason ? `<p class="detail-prose text-preline"><strong>추천 근거</strong> ${multilineHtml(row.recommendScoreReason)}</p>` : ""}
        ${row.pilotDifficultyReason ? `<p class="detail-prose text-preline"><strong>파일럿 근거</strong> ${multilineHtml(row.pilotDifficultyReason)}</p>` : ""}
      </div>`;
  const ratingBody = `<div class="rating-section-stack">${evalViewBlock}<div class="rating-score-block">${renderScoreSection(row, editEval, admin)}</div></div>`;

  const testBlock = editProgress
    ? `<div class="detail-form-grid cols-2 detail-form-compact">
        <div class="inline-row"><span class="inline-label">시작</span>${mpickerDateField("edit-test-started", row.testStartedAt)}</div>
        <div class="inline-row"><span class="inline-label">종료</span>${mpickerDateField("edit-test-ended", row.testEndedAt)}</div>
        <div class="inline-row span-2 inline-row-top"><span class="inline-label">메모</span>${inlineTextarea("edit-test-notes", row.testNotes ?? "", "", 2)}</div>
      </div>`
    : renderTestView(row);

  const filesBlock = editProgress && admin
    ? `<div class="detail-files-section" data-company-files="${escapeAttr(row.companyId)}">
        <div class="file-upload-row file-upload-compact">
          <label class="file-upload-picker">
            <span class="btn-ghost btn-sm">파일</span>
            <input type="file" id="edit-file-input" class="file-input-hidden" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.hwp,.hwpx,.png,.jpg,.jpeg,.zip" />
          </label>
          <span id="edit-file-name" class="file-upload-name muted">없음</span>
          ${inlineInput("edit-file-title", "", "text", "제목(선택)")}
          <button type="button" class="btn-primary btn-sm" id="file-upload-btn">업로드</button>
        </div>
        <div class="file-list-wrap"><p class="muted">파일 목록 로딩…</p></div>
      </div>`
    : `<div class="detail-files-section" data-company-files="${escapeAttr(row.companyId)}"><div class="file-list-wrap"><p class="muted">결과보고서 로딩…</p></div></div>`;
  const progressBody = `<div class="progress-section-stack">
    <div class="progress-test-block">${testBlock}</div>
    <div class="progress-files-block">${filesBlock}</div>
  </div>`;

  const postsBlock = editPosts
    ? `<div class="posts-panel">
        <div class="detail-table-wrap">
          <table class="detail-table detail-table-compact">
            <thead><tr><th>공고</th><th>출처</th><th class="col-actions"></th></tr></thead>
            <tbody>${row.posts
              .map(
                (post) => `
              <tr>
                <td class="post-cell-title">${escapeHtml(post.title)}</td>
                <td><span class="post-source-chip">${escapeHtml(post.sourceLabel || post.source)}</span></td>
                <td class="cell-post-link">
                  <a class="post-action-link" href="${escapeAttr(post.url)}" target="_blank" rel="noreferrer" title="열기">${iconSvg("external", 14)}</a>
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
        <div class="detail-form-grid cols-2 detail-form-compact post-add-row">
          <div class="inline-row"><span class="inline-label">제목</span>${inlineInput("edit-post-title", "", "text", "QA 엔지니어")}</div>
          <div class="inline-row"><span class="inline-label">URL</span>${inlineInput("edit-post-url", "", "url", "https://...")}</div>
        </div>
      </div>`
    : row.posts.length
      ? `<ul class="post-card-list">${row.posts
          .map(
            (post) => `
          <li class="post-card">
            <div class="post-card-main">
              <span class="post-card-title">${escapeHtml(post.title)}</span>
              <span class="post-source-chip">${escapeHtml(post.sourceLabel || post.source)}</span>
            </div>
            <div class="post-card-actions">
              <a class="post-action-link" href="${escapeAttr(post.url)}" target="_blank" rel="noreferrer" title="공고 열기">${iconSvg("external", 14)}</a>
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

  const evalHeaderExtra =
    admin && !editEval
      ? detailIconBtn("rotate", "재집계", { attrs: 'id="btn-recalc-score"', size: 15 })
      : "";
  const sections = [];
  sections.push(detailSectionCard("영업 관리", salesWithMeetings, "sales", "", { icon: "briefcase", open: true }));
  sections.push(detailSectionCard("테스트 · 결과", progressBody, "progress", "", { icon: "target", open: false }));
  sections.push(detailSectionCard("추천 · 점수", ratingBody, "eval", "detail-block-warm", { icon: "star", open: false, headerExtra: evalHeaderExtra }));
  sections.push(detailSectionCard(`공고 · ${row.posts.length}건`, postsBlock, "posts", "", { icon: "building", open: false }));
  sections.push(
    detailSectionCard("프로필", renderProfileSection(row, editProfile, p, e.domain || row.domain || "", admin), "profile", "", {
      icon: "layers",
      open: false
    })
  );

  const anyEdit = Object.keys(state.detailEditSections).length > 0;
  const summaryPanel = editSummary
    ? `<section class="detail-summary-panel is-editing">${summaryBlock}</section>`
    : "";
  return `
    <div class="detail-shell${anyEdit ? " is-edit" : ""}">
      ${summaryPanel}
      <div class="detail-menu-sections">${sections.join("")}</div>
    </div>
    ${row.excludeReason ? `<p class="warn detail-warn">제외 사유: ${escapeHtml(row.excludeReason)}</p>` : ""}`;
}

async function hydrateDetailExtras(row) {
  if (!row?.companyId) return;
  const filesEl = document.querySelector(`[data-company-files="${row.companyId}"]`);
  const meetEl = document.querySelector(`[data-company-meetings="${row.companyId}"]`);
  const filesListEl = filesEl?.querySelector(".file-list-wrap") ?? filesEl;
  const meetListEl = meetEl?.querySelector(".meeting-list-wrap") ?? meetEl;
  const admin = window.TClientAdmin?.isUnlocked?.();
  const editFiles = isSectionEdit("progress") && admin;

  function renderMeetingList(notes) {
    if (!meetListEl) return;
    meetListEl.innerHTML = notes.length
      ? `<ul class="meeting-list meeting-list-mini">${notes.map((n) => renderMeetingViewItem(n, admin)).join("")}</ul>`
      : `<p class="muted detail-empty-hint">미팅 기록이 없습니다.${admin ? ` ${detailIconBtn("plus", "미팅 추가", { attrs: 'id="meeting-add-toggle-inline"', size: 15 })}` : ""}</p>`;
  }

  function renderFileList(files) {
    if (!filesListEl) return;
    const href = (f) => window.TCompanyFiles.resolveHref(f);
    filesListEl.innerHTML = files.length
      ? `<ul class="file-list file-list-compact">${files
          .map(
            (f) =>
              `<li><a class="link file-list-link" href="${escapeAttr(href(f))}" target="_blank" rel="noreferrer"><span class="file-ext-icon file-ext-${escapeAttr(window.TCompanyFiles.extFromFile(f) || "file")}" aria-hidden="true">${fileChipInnerHtml(f, 14)}</span> ${escapeHtml(window.TCompanyFiles.resolveTitle(f))}</a> <span class="muted">${escapeHtml(formatDate(f.uploadedAt))}</span>${
                editFiles
                  ? ` <button type="button" class="btn-ghost btn-sm file-del-btn" data-file-id="${escapeAttr(f.id)}" data-storage-path="${escapeAttr(f.storagePath || "")}">삭제</button>`
                  : ""
              }</li>`
          )
          .join("")}</ul>`
      : `<p class="muted">등록된 파일이 없습니다.${admin ? " 수정 모드에서 업로드하세요." : ""}</p>`;
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
    if (meetEl) initMeetingFormSelects(meetEl);
    window.__TCLIENT_MEETING_CACHE = window.__TCLIENT_MEETING_CACHE ?? {};
    window.__TCLIENT_MEETING_CACHE[row.companyId] = notes;
  } catch {
    if (meetListEl) meetListEl.innerHTML = '<p class="muted">미팅 기록을 불러오지 못했습니다. (migration 013 필요)</p>';
  }
}

function paintDetailModal() {
  const row = state.detailRow;
  if (!row) return;
  setDetailLoading(false);
  const admin = window.TClientAdmin?.isUnlocked();
  const openSections = captureDetailOpenSections();
  openSections.forEach((key) => state.detailOpenSections.add(key));
  Object.keys(state.detailEditSections).forEach((key) => state.detailOpenSections.add(key));
  paintDetailHeader(row);
  window.TMeetingPicker?.closeAllPanels?.();
  byId("detailBody").innerHTML = renderDetailBody(row, admin);
  applyDetailOpenSections(state.detailOpenSections);
  if (admin) {
    window.TUiSelect?.init(byId("detailDrawer"));
    initMeetingFormSelects(byId("detailDrawer"));
  }
  void hydrateDetailExtras(row);
  void window.TDetailPanel?.syncNewToggle?.(row);
  hydrateIcons(byId("detailDrawer"));
  syncSummaryTierChip();
  if (window.TDetailPanel) window.TDetailPanel.renderBody = renderDetailBody;
}

async function openDetail(row, sectionToEdit = null) {
  state.detailRow = row;
  clearSectionEdits();
  clearMeetingUiState();
  clearContactUiState();
  if (sectionToEdit && window.TClientAdmin?.isUnlocked?.()) {
    setSectionEdit(sectionToEdit, true);
  }
  window.__TCLIENT_DETAIL_ROW = row;
  window.__TCLIENT_DETAIL_EDIT = Object.keys(state.detailEditSections).length > 0;
  hidePortfolioPopover();
  if (window.TClientAdmin?.isUnlocked?.()) {
    try {
      await window.TCompanyUserState.markViewed(row.companyId);
      refreshViews();
    } catch {
      /* migration 013 */
    }
  }
  state.detailOpenSections = new Set(["sales"]);
  if (sectionToEdit) state.detailOpenSections.add(sectionToEdit);
  paintDetailModal();
  const drawer = byId("detailDrawer");
  drawer?.classList.remove("hidden");
  drawer?.setAttribute("aria-hidden", "false");
  document.body.classList.add("detail-drawer-open");
  window.TDetailPanel?.refreshTabs?.();
}

function closeDetail() {
  if (state.detailBusy) return;
  state.detailRow = null;
  clearSectionEdits();
  clearMeetingUiState();
  clearContactUiState();
  state.detailOpenSections = new Set();
  window.__TCLIENT_DETAIL_ROW = null;
  window.__TCLIENT_DETAIL_EDIT = false;
  hidePortfolioPopover();
  const drawer = byId("detailDrawer");
  drawer?.classList.add("hidden");
  drawer?.setAttribute("aria-hidden", "true");
  document.body.classList.remove("detail-drawer-open");
}

function openAddLeadModal() {
  if (!window.TClientAdmin?.isUnlocked()) {
    showToast("관리자 로그인이 필요합니다.", "error");
    return;
  }
  setAddLeadLoading(false);
  const modal = byId("addLeadModal");
  byId("add-lead-post-url").value = "";
  byId("add-lead-name").value = "";
  byId("add-lead-bizno").value = "";
  byId("add-lead-domain").value = "";
  syncAddLeadNoPostHint();
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  byId("add-lead-post-url")?.focus();
  hydrateIcons(modal);
}

function setAddLeadLoading(show, text = "등록 중…") {
  const panel = byId("addLeadModal")?.querySelector(".modal-panel");
  const layer = byId("addLeadLoading");
  const label = byId("addLeadLoadingText");
  const submitBtn = byId("add-lead-submit");
  if (!layer) return;
  if (label) label.textContent = text;
  layer.classList.toggle("hidden", !show);
  layer.setAttribute("aria-hidden", show ? "false" : "true");
  panel?.classList.toggle("modal-busy", show);
  if (submitBtn) submitBtn.disabled = show;
  state.addLeadBusy = show;
}

function closeAddLeadModal() {
  if (state.addLeadBusy) return;
  const modal = byId("addLeadModal");
  modal?.classList.add("hidden");
  modal?.setAttribute("aria-hidden", "true");
}

function syncAddLeadNoPostHint() {
  const url = normalizePostUrlInput(byId("add-lead-post-url")?.value);
  byId("add-lead-no-post-hint")?.classList.toggle("hidden", Boolean(url));
}

function submitAddLead() {
  void submitAddLeadAsync();
}

async function submitAddLeadAsync() {
  if (state.addLeadBusy) return;
  const url = normalizePostUrlInput(byId("add-lead-post-url")?.value);
  const name = byId("add-lead-name")?.value.trim();
  const bizNo = byId("add-lead-bizno")?.value.trim();
  const domain = byId("add-lead-domain")?.value.trim();

  if (url) {
    await submitManualPostAsync(url, bizNo, name);
    return;
  }

  if (!name) {
    showToast("회사명 또는 공고 URL을 입력하세요.", "error");
    return;
  }

  if (bizNo && normalizeBizNoDigits(bizNo).length !== 10) {
    showToast("사업자번호 10자리를 입력하세요.", "error");
    return;
  }
  if (bizNo && findCompanyByBizNo(bizNo)) {
    showToast(`이미 등록된 사업자번호입니다: ${displayName(findCompanyByBizNo(bizNo))}`, "error");
    return;
  }

  setAddLeadLoading(true, bizNo ? "사업자 정보 조회 · 회사 등록 중…" : "회사 등록 중…");
  let ok = false;
  let savedRow = null;
  let enriched = false;
  let pendingCompanyId = null;
  try {
    let enrichProfile = bizNo ? await lookupEnrichProfile(bizNo) : null;
    const companyName = resolveManualCompanyName(enrichProfile, name);
    const row = buildManualCompanyRow({
      companyNameKo: companyName,
      domain: enrichProfile?.domain || domain,
      bizNo: enrichProfile?.bizNo || bizNo,
      profile: profilePatchFromEnrich(enrichProfile)
    });
    if (!window.TClientAdmin.addCustomCompany(row)) {
      showToast("이미 등록된 회사입니다.", "error");
      return;
    }
    pendingCompanyId = row.companyId;

    if (bizNo && !enrichProfile) {
      enrichProfile = await enrichProfileByBizNo(bizNo, row.companyId, (msg) => setAddLeadLoading(true, msg));
      if (enrichProfile) {
        applyEnrichToManualCompany(row.companyId, enrichProfile, name);
        enriched = true;
      }
    } else if (enrichProfile) {
      enriched = true;
    }

    savedRow = getCustomCompanyRow(row.companyId) ?? row;
    await window.TCompanies.upsertManual(savedRow);
    await window.TClientAdmin.flushPersist?.();
    if (window.TClientAdmin.isUnlocked()) {
      await window.TSalesManagement?.upsert?.(
        savedRow.companyId,
        { isHidden: true, isRecommended: false, pipelineStage: "candidate", pipelineStatus: "pending" },
        savedRow
      );
    }
    reloadRowsWithAdmin();
    refreshViews();
    ok = true;
  } catch (err) {
    if (pendingCompanyId) await window.TClientAdmin.removeCustomCompany(pendingCompanyId);
    showToast(err.message || "회사 등록 실패", "error");
  } finally {
    setAddLeadLoading(false);
  }
  if (ok && savedRow) {
    closeAddLeadModal();
    showToast(
      enriched
        ? "회사가 추가되었습니다. 사업자 정보가 반영되었으며 숨김 분류로 등록됩니다."
        : "회사가 추가되었습니다. 공고가 없어 숨김 분류로 등록됩니다."
    );
    openDetail(state.rows.find((r) => r.companyId === savedRow.companyId) ?? savedRow, "profile");
  }
}

async function submitManualPostAsync(url, bizNoRaw = "", nameHint = "") {
  try {
    new URL(url);
  } catch {
    showToast("올바른 URL을 입력하세요.", "error");
    return;
  }
  const conflict = findPostConflict(url);
  if (conflict) {
    if (conflict.hidden && window.TClientAdmin?.isUnlocked?.()) {
      setAddLeadLoading(true, "공고 복원 중…");
      let ok = false;
      const targetRow = conflict.row;
      try {
        const entry = window.TClientAdmin.getEntry(conflict.row.companyId);
        const key = window.TPostUrl?.postUrlKey(url) ?? url.toLowerCase();
        const nextHidden = (entry.hiddenPosts ?? []).filter(
          (u) => (window.TPostUrl?.postUrlKey(u) ?? `${u}`.toLowerCase()) !== key
        );
        window.TClientAdmin.setEntry(conflict.row.companyId, { hiddenPosts: nextHidden });
        await window.TClientAdmin.flushPersist?.();
        reloadRowsWithAdmin();
        refreshViews();
        ok = true;
      } finally {
        setAddLeadLoading(false);
      }
      if (ok) {
        closeAddLeadModal();
        showToast(`숨김 처리됐던 공고를 복원했습니다: ${displayName(targetRow)}`);
        openDetail(targetRow);
      }
      return;
    }
    const name = displayName(conflict.row);
    const stored = conflict.storedUrl ?? url;
    const hint =
      stored.toLowerCase() !== url.toLowerCase() ? " (동일 공고 — URL 형식만 다름)" : "";
    showToast(`이미 등록된 공고입니다: ${name}${hint}`, "error");
    openDetail(conflict.row);
    return;
  }

  const bizNo = bizNoRaw || byId("add-lead-bizno")?.value.trim();
  const digits = normalizeBizNoDigits(bizNo);
  if (bizNo && digits.length !== 10) {
    showToast("사업자번호 10자리를 입력하세요.", "error");
    return;
  }

  setAddLeadLoading(true, bizNo ? "사업자 정보 조회 · 공고 등록 중…" : "공고 등록 중…");
  let ok = false;
  let result = null;
  try {
    const { row, created, enrichProfile } = await resolveCompanyForManualPost(url, bizNo, nameHint, (msg) =>
      setAddLeadLoading(true, msg)
    );
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
    ok = true;
    result = { row, created, enrichProfile, bizNo };
  } finally {
    setAddLeadLoading(false);
  }
  if (ok && result) {
    closeAddLeadModal();
    const { row, created, enrichProfile, bizNo: savedBizNo } = result;
    if (savedBizNo && !enrichProfile && !findCompanyByBizNo(savedBizNo)) {
      showToast(
        nameHint
          ? `공고가 추가됐습니다. 사업자 조회에 실패해 입력한 회사명(${nameHint})으로 등록했습니다.`
          : "공고가 추가됐습니다. bizno.net에서 회사를 찾지 못해 이름은 수동 등록 상태입니다."
      );
    } else if (created) {
      showToast(enrichProfile ? "공고와 회사(사업자 조회)가 추가되었습니다." : "공고와 회사가 추가되었습니다.");
    } else {
      showToast("기존 회사에 공고가 추가되었습니다.");
    }
    const target = state.rows.find((r) => r.companyId === row.companyId) ?? row;
    openDetail(target, "posts");
  }
}

function deleteCompany(row) {
  void deleteCompanyAsync(row);
}

async function deleteCompanyAsync(row) {
  if (!row?.companyId || !window.TClientAdmin?.isUnlocked() || state.detailBusy) return;

  const admin = window.TClientAdmin;
  const name = displayName(row);

  if (!window.confirm(`「${name}」 회사를 DB에서 완전히 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`)) return;

  try {
    await withDetailBusy("삭제 중…", async () => {
      const companyId = row.companyId;
      await admin.markCompanyDeleted(companyId);
      if (window.TCompanies?.isManualCompanyId?.(companyId)) {
        try {
          await window.TCompanies.deleteManual(companyId);
        } catch (err) {
          if (!/not found/i.test(`${err.message ?? ""}`)) throw err;
        }
      }
      try {
        await window.TCompanies.deleteCompany(companyId);
      } catch (err) {
        if (!/not found/i.test(`${err.message ?? ""}`)) throw err;
      }
      window.TSalesManagement?.removeLocal?.(companyId);
      await admin.flushPersist?.();
    });
  } catch (err) {
    showToast(err.message || "삭제 실패", "error");
    return;
  }

  state.snapshotRows = state.snapshotRows.filter((r) => r.companyId !== row.companyId);
  closeDetail();
  reloadRowsWithAdmin();
  refreshViews();
  showToast("회사가 삭제되었습니다.");
}

async function deletePostFromCompany(row, postUrl, isManualPost) {
  if (!row?.companyId || !postUrl || !window.TClientAdmin?.isUnlocked() || state.detailBusy) return;

  const admin = window.TClientAdmin;
  const companyName = displayName(row);
  const post = (row.posts ?? []).find((p) => p.url === postUrl);

  if (!window.confirm(`「${companyName}」 공고를 삭제할까요?`)) return;

  try {
    await withDetailBusy("공고 삭제 중…", async () => {
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
    });
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
    badge.innerHTML = `<span class="merge-source-label">삭제·합쳐질 회사</span><strong>${escapeHtml(displayName(row))}</strong>${manualBadge(row)}`;
  }
  if (hint) {
    hint.textContent = "아래에서 최종적으로 남길 회사를 검색해 선택하세요. 선택한 회사로 공고·메모·프로필이 합쳐집니다.";
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
  if (state.mergeBusy) return;
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
    .filter((r) => !window.TClientAdmin?.isCompanyDeleted?.(r.companyId))
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
      <span class="merge-pick-name">${escapeHtml(displayName(r))}${manualBadge(r)}<span class="merge-pick-action">이 회사에 합치기</span></span>
      <span class="merge-pick-meta">${escapeHtml(r.domain || "-")} · ${escapeHtml(r.leadGrade || "-")} · 공고 ${r.posts?.length ?? 0}건</span>
    </button>`
    )
    .join("");
}

function confirmMergeToTarget(targetId) {
  void confirmMergeToTargetAsync(targetId);
}

async function confirmMergeToTargetAsync(targetId) {
  if (state.mergeBusy) return;
  const sourceRow = state.mergeSourceRow;
  const sourceId = sourceRow?.companyId;
  const targetRow = state.rows.find((r) => r.companyId === targetId);
  if (!sourceId || !targetRow || !window.TClientAdmin?.isUnlocked()) return;

  if (
    !window.confirm(
      `「${displayName(sourceRow)}」(삭제)의 데이터를 「${displayName(targetRow)}」(유지)에 합칠까요?\n공고·메모·프로필이 유지 회사로 합쳐지고, 삭제 회사는 ${window.TClientAdmin?.isCustomCompany?.(sourceId) ? "완전 삭제" : "숨김"} 처리됩니다.`
    )
  )
    return;

  if (!window.TClientAdmin.mergeCompanies(sourceId, targetId, { sourceRow, targetRow })) {
    showToast("병합에 실패했습니다.", "error");
    return;
  }

  setMergeLoading(true, "병합 저장 중…");
  try {
    const targetEntry = window.TClientAdmin.getEntry(targetId);
    if (window.TSalesManagement?.mergeFromCompanies) {
      await window.TSalesManagement.mergeFromCompanies(sourceId, targetId, targetEntry, targetRow, sourceRow);
    }
    await window.TClientAdmin.flushPersist?.();
  } catch (err) {
    showToast(err.message || "병합 저장 실패", "error");
    return;
  } finally {
    setMergeLoading(false);
  }

  closeMergeModal();
  reloadRowsWithAdmin();
  refreshViews();

  const survivor = state.rows.find((r) => r.companyId === targetId);
  if (survivor) {
    await openDetail(survivor);
    showToast(`「${displayName(survivor)}」로 병합되었습니다.`);
  } else {
    closeDetail();
    showToast("회사 병합이 완료되었습니다.");
  }
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
    if (state.mergeBusy) return;
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

function bindAddLeadModal() {
  const modal = byId("addLeadModal");
  if (!modal) return;
  byId("btnAddLead")?.addEventListener("click", openAddLeadModal);
  byId("add-lead-submit")?.addEventListener("click", submitAddLead);
  byId("add-lead-post-url")?.addEventListener("input", syncAddLeadNoPostHint);
  byId("add-lead-bizno")?.addEventListener("blur", (e) => {
    const formatted = formatBizNoDisplay(e.target.value.trim());
    if (formatted) e.target.value = formatted;
  });
  modal.querySelectorAll("[data-close-add]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAddLeadModal();
    });
  });
  byId("add-lead-post-url")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAddLead();
  });
  byId("add-lead-name")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitAddLead();
  });
}

function bindModal() {
  window.TDetailPanel.renderBody = renderDetailBody;
  window.TDetailPanel.bind?.();
  window.openMergeModal = openMergeModal;
  bindDetailHeaderEdits();
  bindDetailSectionEdits();
  bindSalesPipelineControls();
  bindDetailSectionToggles();
  byId("detailBody")?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.(".post-delete-btn");
    if (!btn || !state.detailRow || !window.TClientAdmin?.isUnlocked()) return;
    deletePostFromCompany(state.detailRow, btn.dataset.postUrl, btn.dataset.postManual === "1");
  });
  byId("detailBody")?.addEventListener(
    "blur",
    (e) => {
      if (e.target?.id !== "edit-prof-bizno") return;
      const formatted = formatBizNoDisplay(e.target.value.trim());
      if (formatted) e.target.value = formatted;
    },
    true
  );
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (isMergeModalOpen()) {
      if (!state.mergeBusy) closeMergeModal();
      return;
    }
    const drawer = byId("detailDrawer");
    if (drawer && !drawer.classList.contains("hidden") && !state.detailBusy) closeDetail();
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

/** 상단 갱신일 — 스냅샷 메타 기준 */
function paintMetaBanner() {
  const meta = byId("meta");
  if (!meta) return;
  const generatedAt =
    state.snapshotGeneratedAt ||
    state.userOverridesAppliedAt ||
    null;
  meta.innerHTML = generatedAt
    ? `<span class="meta-updated">${escapeHtml(formatDate(generatedAt))} 갱신</span>`
    : `<span class="meta-updated muted">갱신일 없음</span>`;
}

function switchTab(tabId, { resetFilters: shouldReset = false, kpiFocus = undefined } = {}) {
  const tabIds = ["in_progress", "recommended", "new", "leads", "posts", "excluded"];
  if (!tabIds.includes(tabId)) return;
  if (isNotionReorderActive() && tabId !== state.notionReorder?.tab) cancelNotionReorder();
  if (shouldReset) resetTabFilters();
  applySortForTab(tabId, { forceDefault: shouldReset });
  document.querySelectorAll(".tabs-bar .tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tabId);
  });
  state.activeTab = tabId;
  state.actionKpiFocus = kpiFocus !== undefined ? kpiFocus : defaultActionKpiForTab(tabId);
  window.__TCLIENT_ACTIVE_TAB = tabId;
  state.leadsPage = 1;
  state.newPage = 1;
  state.postsPage = 1;
  state.excludedPage = 1;
  tabIds.forEach((id) => byId(id)?.classList.add("hidden"));
  byId(tabId)?.classList.remove("hidden");
  const toolbar = document.querySelector(".toolbar");
  const tabular = tabId === "recommended" || tabId === "new" || tabId === "in_progress";
  toolbar?.classList.toggle("toolbar-candidates", tabular);
  if (tabular && state.filtersOpen) toggleFilterAdvanced(false);
  refreshViews();
}

function bindTabs() {
  document.querySelectorAll(".tabs-bar .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchTab(btn.dataset.tab, { resetFilters: true });
    });
  });
}

function refreshViews() {
  window.__TCLIENT_ROWS = state.rows;
  window.__TCLIENT_ACTIVE_TAB = state.activeTab;
  updateSortOptionsForTab();
  paintMetaBanner();
  renderKpi();
  window.TDetailPanel?.renderTabPanels?.(state.activeTab);
  if (state.activeTab === "leads" || state.activeTab === "posts" || state.activeTab === "excluded") {
    renderLeadsTable();
    renderAllPosts();
    renderExcludedTable();
  }
  updateNotionReorderUi();
}

function setAdminStatus(msg) {
  const el = byId("adminStatus");
  if (el) el.textContent = msg;
}

function setAdminUi(unlocked, { passwordSetup = false } = {}) {
  const badge = byId("adminBadge");
  if (badge) {
    badge.classList.remove("hidden");
    if (unlocked) {
      const email = window.TClientAdmin?.getUserEmail?.() ?? "";
      badge.textContent = email || "로그인";
      badge.title = email ? `로그인: ${email}` : "로그인됨";
      badge.classList.remove("is-guest");
    } else {
      badge.textContent = "비로그인";
      badge.title = "로그인 필요";
      badge.classList.add("is-guest");
    }
  }
  byId("adminTools")?.classList.toggle("hidden", !unlocked);
  byId("adminLoginForm")?.classList.toggle("hidden", unlocked || passwordSetup);
  byId("adminPasswordSetupForm")?.classList.toggle("hidden", !passwordSetup);
  document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !unlocked));
  refreshDetailAdminButtons();
  hydrateIcons(byId("btnAddLead"));
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

let notionSyncUi = { triggeredAt: 0, sawRunning: false, watchTimer: null };

function clearNotionSyncWatch() {
  if (notionSyncUi.watchTimer) {
    clearTimeout(notionSyncUi.watchTimer);
    notionSyncUi.watchTimer = null;
  }
}

function scheduleNotionSyncWatch() {
  clearNotionSyncWatch();
  const tick = async () => {
    if (!notionSyncUi.triggeredAt) return;
    await updateNotionSyncUi();
    if (notionSyncUi.triggeredAt) {
      notionSyncUi.watchTimer = setTimeout(tick, 4000);
    }
  };
  notionSyncUi.watchTimer = setTimeout(tick, 4000);
}

async function updateNotionSyncUi() {
  const badge = byId("notionSyncStatusBadge");
  const pullBtn = byId("notionSyncPullBtn");
  if (!badge) return;
  try {
    const status = await window.TClientAdmin?.getNotionSyncStatus?.();
    const busy = status?.status === "running";

    badge.classList.toggle("hidden", !busy);
    if (busy) {
      const who = status.requestedByEmail ? ` · ${status.requestedByEmail}` : "";
      badge.textContent = `노션 동기화 중${who}`;
      badge.title = status.message || "Notion DB를 T-client에 반영 중입니다";
      notionSyncUi.sawRunning = true;
    }
    if (pullBtn) {
      pullBtn.disabled = busy;
      pullBtn.title = busy ? "Notion 동기화 진행 중입니다" : "";
    }

    if (notionSyncUi.triggeredAt && Date.now() - notionSyncUi.triggeredAt > 180000) {
      notionSyncUi.triggeredAt = 0;
      notionSyncUi.sawRunning = false;
      clearNotionSyncWatch();
      showToast("Notion 동기화 응답이 지연되고 있습니다. 잠시 후 다시 확인해 주세요.", "error");
      return;
    }

    if (notionSyncUi.triggeredAt && notionSyncUi.sawRunning && !busy) {
      const finishedAt = status?.finishedAt ? Date.parse(status.finishedAt) : Date.now();
      if (finishedAt >= notionSyncUi.triggeredAt - 5000) {
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
        notionSyncUi.triggeredAt = 0;
        notionSyncUi.sawRunning = false;
        clearNotionSyncWatch();
      }
    }
  } catch {
    badge.classList.add("hidden");
    if (pullBtn) {
      pullBtn.disabled = false;
      pullBtn.title = "";
    }
  } finally {
    await updateNotionAdminMenuButton();
  }
}

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

async function updateAdminJobUi() {
  await updateCrawlUi();
  await updateNotionSyncUi();
  await updateNotionPushUi();
}

let notionPushUi = { triggeredAt: 0, sawRunning: false, watchTimer: null };

function clearNotionPushWatch() {
  if (notionPushUi.watchTimer) {
    clearTimeout(notionPushUi.watchTimer);
    notionPushUi.watchTimer = null;
  }
}

function scheduleNotionPushWatch() {
  clearNotionPushWatch();
  const tick = async () => {
    if (!notionPushUi.triggeredAt) return;
    await updateNotionPushUi();
    if (notionPushUi.triggeredAt) notionPushUi.watchTimer = setTimeout(tick, 4000);
  };
  notionPushUi.watchTimer = setTimeout(tick, 4000);
}

async function updateNotionPushUi() {
  const badge = byId("notionPushStatusBadge");
  const pushBtn = byId("notionSyncPushBtn");
  const savePushBtn = byId("notionReorderSavePush");
  if (!badge) return;
  try {
    const status = await window.TClientAdmin?.getNotionPushStatus?.();
    const busy = status?.status === "running";
    badge.classList.toggle("hidden", !busy);
    if (busy) {
      const who = status.requestedByEmail ? ` · ${status.requestedByEmail}` : "";
      badge.textContent = `노션 반영 중${who}`;
      badge.title = status.message || "T-client 데이터를 Notion DB에 반영 중입니다";
      notionPushUi.sawRunning = true;
    }
    if (pushBtn) {
      pushBtn.disabled = busy;
      pushBtn.title = busy ? "Notion 반영 진행 중입니다" : "";
    }
    if (savePushBtn) savePushBtn.disabled = busy || isNotionReorderActive() || Boolean(state.notionReorder?.savingStatus);

    if (notionPushUi.triggeredAt && Date.now() - notionPushUi.triggeredAt > 180000) {
      notionPushUi.triggeredAt = 0;
      notionPushUi.sawRunning = false;
      clearNotionPushWatch();
      showToast("Notion 반영 응답이 지연되고 있습니다. 잠시 후 다시 확인해 주세요.", "error");
      return;
    }

    if (notionPushUi.triggeredAt && notionPushUi.sawRunning && !busy) {
      const finishedAt = status?.finishedAt ? Date.parse(status.finishedAt) : Date.now();
      if (finishedAt >= notionPushUi.triggeredAt - 5000) {
        if (status?.status === "error") {
          showToast(status.message || "Notion 반영에 실패했습니다.", "error");
        } else {
          showToast(status?.message || "Notion DB 반영이 완료되었습니다.");
        }
        notionPushUi.triggeredAt = 0;
        notionPushUi.sawRunning = false;
        clearNotionPushWatch();
      }
    }
  } catch {
    badge.classList.add("hidden");
    if (pushBtn) {
      pushBtn.disabled = false;
      pushBtn.title = "";
    }
  } finally {
    await updateNotionAdminMenuButton();
  }
}

async function updateNotionAdminMenuButton() {
  const openBtn = byId("adminOpenNotionModal");
  if (!openBtn) return;
  try {
    const [syncStatus, pushStatus] = await Promise.all([
      window.TClientAdmin?.getNotionSyncStatus?.(),
      window.TClientAdmin?.getNotionPushStatus?.(),
    ]);
    const syncBusy = syncStatus?.status === "running";
    const pushBusy = pushStatus?.status === "running";
    const busy = syncBusy || pushBusy;
    openBtn.disabled = busy;
    openBtn.title = busy
      ? syncBusy
        ? "Notion 동기화 진행 중입니다"
        : "Notion 반영 진행 중입니다"
      : "";
  } catch {
    openBtn.disabled = false;
    openBtn.title = "";
  }
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

async function openNotionSyncModal() {
  if (!window.TClientAdmin?.isUnlocked?.()) {
    showToast("관리자 로그인이 필요합니다.", "error");
    return;
  }
  closeAdminPopover();
  await updateNotionSyncUi();
  await updateNotionPushUi();
  const modal = byId("notionSyncModal");
  modal?.classList.remove("hidden");
  modal?.setAttribute("aria-hidden", "false");
  hydrateIcons(modal);
  byId("notionSyncPullBtn")?.focus();
}

function closeNotionSyncModal() {
  const modal = byId("notionSyncModal");
  modal?.classList.add("hidden");
  modal?.setAttribute("aria-hidden", "true");
}

async function runNotionSyncPull() {
  if (!window.TClientAdmin?.isUnlocked?.()) {
    showToast("로그인이 필요합니다.", "error");
    return;
  }
  const pullBtn = byId("notionSyncPullBtn");
  if (pullBtn?.disabled) return;
  if (pullBtn) pullBtn.disabled = true;
  try {
    const status = await window.TClientAdmin.getNotionSyncStatus();
    if (status?.status === "running") {
      showToast("Notion 동기화 진행 중입니다.", "error");
      await updateNotionSyncUi();
      return;
    }
    await window.TClientAdmin.triggerNotionSync();
    closeNotionSyncModal();
    notionSyncUi.triggeredAt = Date.now();
    notionSyncUi.sawRunning = false;
    showToast("Notion 동기화를 시작했습니다. 완료되면 자동으로 새로고침됩니다.");
    scheduleNotionSyncWatch();
  } catch (err) {
    showToast(err.message || String(err), "error");
    await updateNotionSyncUi();
  } finally {
    if (pullBtn) pullBtn.disabled = false;
  }
}

async function runNotionSyncPush() {
  if (!window.TClientAdmin?.isUnlocked?.()) {
    showToast("로그인이 필요합니다.", "error");
    return;
  }
  const pushBtn = byId("notionSyncPushBtn");
  if (pushBtn?.disabled) return;
  if (pushBtn) pushBtn.disabled = true;
  try {
    const status = await window.TClientAdmin.getNotionPushStatus();
    if (status?.status === "running") {
      showToast("Notion 반영이 진행 중입니다.", "error");
      await updateNotionPushUi();
      return;
    }
    await window.TClientAdmin.triggerNotionPush();
    closeNotionSyncModal();
    notionPushUi.triggeredAt = Date.now();
    notionPushUi.sawRunning = false;
    showToast("Notion 반영을 시작했습니다.");
    scheduleNotionPushWatch();
  } catch (err) {
    showToast(err.message || String(err), "error");
    await updateNotionPushUi();
  } finally {
    if (pushBtn) pushBtn.disabled = false;
  }
}

function bindNotionSyncModal() {
  byId("adminOpenNotionModal")?.addEventListener("click", () => {
    void openNotionSyncModal();
  });

  document.querySelectorAll("[data-close-notion-sync]").forEach((el) => {
    el.addEventListener("click", () => closeNotionSyncModal());
  });

  byId("notionSyncPullBtn")?.addEventListener("click", () => {
    void runNotionSyncPull();
  });

  byId("notionSyncPushBtn")?.addEventListener("click", () => {
    void runNotionSyncPush();
  });
}

const USER_MANUAL_PDF = "assets/t-client-user-manual.pdf";

function bindManualModal() {
  byId("adminManualDownloadBtn")?.addEventListener("click", () => {
    closeAdminPopover();
    window.open(USER_MANUAL_PDF, "_blank", "noopener,noreferrer");
  });
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
  byId("adminUnlockBtn")?.addEventListener("click", () => {
    toggleAdminPopover();
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest(".admin-anchor")) return;
    closeAdminPopover();
  });

  byId("adminLoginBtn")?.addEventListener("click", async () => {
    const btn = byId("adminLoginBtn");
    const email = byId("adminEmail")?.value ?? "";
    const password = byId("adminPassword")?.value ?? "";
    await withButtonBusy(btn, "로그인 중…", async () => {
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
  });

  byId("adminSetupEmailBtn")?.addEventListener("click", async () => {
    const btn = byId("adminSetupEmailBtn");
    const email = byId("adminEmail")?.value ?? "";
    if (!`${email}`.trim()) {
      showToast("이메일을 입력하세요.", "error");
      return;
    }
    await withButtonBusy(btn, "발송 중…", async () => {
      try {
        await window.TClientAdmin.sendPasswordSetupEmail(email);
        showToast("비밀번호 설정 메일을 보냈습니다. 메일의 링크에서 비밀번호를 설정하세요.");
      } catch (err) {
        showToast(err.message || String(err), "error");
      }
    });
  });

  byId("adminPasswordSaveBtn")?.addEventListener("click", async () => {
    const btn = byId("adminPasswordSaveBtn");
    const pwd = byId("adminNewPassword")?.value ?? "";
    const confirm = byId("adminConfirmPassword")?.value ?? "";
    if (pwd !== confirm) {
      showToast("비밀번호 확인이 일치하지 않습니다.", "error");
      return;
    }
    await withButtonBusy(btn, "저장 중…", async () => {
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

  bindCrawlModal();
  bindNotionSyncModal();
  bindManualModal();

  byId("notionReorderStart")?.addEventListener("click", startNotionReorder);
  byId("notionReorderCancel")?.addEventListener("click", cancelNotionReorder);
  byId("notionReorderSave")?.addEventListener("click", () => void saveNotionReorder({ pushNotion: false }));
  byId("notionReorderSavePush")?.addEventListener("click", () => void saveNotionReorder({ pushNotion: true }));

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

    ["search", "grade", "pipelineStage", "pipelineStatus", "contact", "tier", "bizStatus", "sort"].forEach((id) => {
      const el = byId(id);
      if (!el) return;
      el.addEventListener("input", () => {
        state.leadsPage = 1;
        state.postsPage = 1;
        refreshViews();
      });
    });

    bindModal();
    bindMergeModal();
    bindAddLeadModal();
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
    bindTabs();
    bindActionKpiCards();
    byId("filterToggleBtn")?.addEventListener("click", () => toggleFilterAdvanced());
    byId("filterResetBtn")?.addEventListener("click", resetFilters);
    document.querySelector(".toolbar")?.classList.toggle("toolbar-candidates", ["new", "recommended", "in_progress"].includes(state.activeTab));
    const tabFromUrl = new URLSearchParams(window.location.search).get("tab");
    window.TUiSelect?.init();
    if (tabFromUrl && byId(tabFromUrl)) {
      switchTab(tabFromUrl, { resetFilters: true });
    } else {
      applySortForTab(state.activeTab, { forceDefault: true });
      refreshViews();
    }
    updateNotionReorderUi();
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
  sortRecommendedRows,
  sortInProgressRows,
  sortByNotionPriority,
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
  fileChipInnerHtml,
  renderCompanyTable,
  renderCompanyCell,
  listableLeadRows,
  rowHasListablePresence,
  isListableLead,
  isMainTabLead,
  isShelvedLead,
  excludedTabRows,
  isNotionReorderActive,
  notionReorderRowsForTab,
  reorderHandleCell,
  bindNotionReorderTable
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void boot());
} else {
  void boot();
}
