const state = {
  snapshotRows: [],
  rawRows: [],
  rows: [],
  dedupeCandidates: [],
  manualReviewQueue: [],
  failureSummary: {},
  gradeSummary: {},
  activePreset: "",
  activeTab: "leads",
  detailRow: null,
  detailEdit: false,
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

function manualBadge(row) {
  if (!row.isManual) return "";
  return `<span class="badge badge-manual" title="수동 등록">수동</span>`;
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

function detailTitle(text) {
  return `<h3 class="detail-title">${escapeHtml(text)}</h3>`;
}

function inlineInput(id, value, type = "text", placeholder = "") {
  return `<input type="${type}" id="${id}" class="inline-field" value="${escapeAttr(value ?? "")}" placeholder="${escapeAttr(placeholder)}" />`;
}

function inlineSelect(id, value, options) {
  const opts = options
    .map(([v, l]) => `<option value="${escapeAttr(v)}"${value === v ? " selected" : ""}>${escapeHtml(l)}</option>`)
    .join("");
  return `<select id="${id}" class="inline-field inline-select">${opts}</select>`;
}

function renderProfileSection(row, edit = false, p = {}, domain = "") {
  const fields = [
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
    const biznoBlock = `
      <div class="bizno-fetch-row">
        <div class="inline-row bizno-fetch-line">
          <span class="inline-label">사업자번호</span>
          <div class="bizno-fetch-controls">
            ${inlineInput("edit-prof-bizno", p.bizNo ?? "", "text", "000-00-00000")}
            <button type="button" class="btn-primary btn-sm" id="btn-enrich-bizno">정보 자동 수집</button>
          </div>
        </div>
        <p class="enrich-bizno-status muted" id="enrich-bizno-status">bizno.net에서 업종·규모·홈페이지를 가져옵니다.</p>
      </div>`;
    const tableFields = fields.filter(([, id]) => id !== "edit-prof-bizno");
    return `${biznoBlock}<table class="profile-table profile-inline"><tbody>${tableFields
      .map(
        ([label, id, val]) =>
          `<tr><th>${escapeHtml(label)}</th><td>${inlineInput(id, val, id.includes("home") ? "url" : "text")}</td></tr>`
      )
      .join("")}</tbody></table>`;
  }

  return `<table class="profile-table"><tbody>${fields
    .map(([label, , val]) => {
      const v = `${val ?? ""}`.trim();
      const cell =
        label === "홈페이지" && v
          ? `<a class="link" href="${escapeAttr(v)}" target="_blank" rel="noreferrer">${escapeHtml(v)}</a>`
          : escapeHtml(label === "종업원" && v ? `${v}명` : v);
      return `<tr><th>${escapeHtml(label)}</th><td>${cell}</td></tr>`;
    })
    .join("")}</tbody></table>`;
}

function actionSelect(id, value) {
  return inlineSelect(id, value, [
    ["추천", "추천"],
    ["진행", "진행"],
    ["보류", "보류"]
  ]);
}

function renderScoreSection(row, admin = false) {
  const breakdown = row.scoreBreakdown ?? [];
  if (!breakdown.length && !row.scoreReason) {
    return `<p class="muted">점수 정보 없음</p>`;
  }
  if (admin && breakdown.length) {
    const rows = breakdown
      .map((b) => {
        const defaultPts = `${b.pts ?? ""}`.replace(":", "") || "0";
        const val = b.override !== undefined && b.override !== "" ? b.override : "";
        return `<tr>
          <th>${escapeHtml(b.label)} <span class="score-pts">${escapeHtml(b.pts || "")}</span></th>
          <td><input type="number" class="inline-field score-part-input" data-score-part="${escapeAttr(b.part)}" value="${escapeAttr(val)}" placeholder="${escapeAttr(defaultPts)}" /></td>
        </tr>`;
      })
      .join("");
    return `<table class="profile-table profile-inline"><tbody>${rows}
      <tr><th>총점</th><td>${inlineInput("edit-score-total", row.priorityScore, "number")}</td></tr>
    </tbody></table>`;
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
  byId("detailModal")?.classList.toggle("modal-busy", show);
}

function finishDetailSave(companyId, { toastMessage = "정상 저장되었습니다.", exitEdit = true } = {}) {
  reloadRowsWithAdmin();
  refreshViews();
  const row = state.rows.find((r) => r.companyId === companyId);
  if (!row) return;
  state.detailRow = row;
  if (exitEdit) state.detailEdit = false;
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

  if (btn) btn.disabled = true;
  setDetailLoading(true, "회사 정보를 수집하고 있습니다…");
  setEnrichBiznoStatus("");

  try {
    const result = await window.TEnrichBizno.fetchProfileByBizNo(bizNo);
    if (result.ok) {
      fillProfileForm(result.profile);
      window.TClientAdmin.setEntry(row.companyId, {
        profile: result.profile,
        domain: result.profile.domain || undefined
      });
      setEnrichBiznoStatus("수집 완료. 내용 확인 후 「변경 저장」을 눌러주세요.");
      showToast("회사 정보 수집이 완료되었습니다.");
      return;
    }

    if (result.reason === "fetch_blocked" && window.TClientAdmin.dispatchEnrichCompany) {
      setDetailLoading(true, "서버에서 회사 정보를 수집 중입니다…");
      await window.TClientAdmin.dispatchEnrichCompany(row.companyId, bizNo);
      setEnrichBiznoStatus("서버 수집 요청됨. 1~2분 후 새로고침하거나 저장 반영을 실행하세요.");
      showToast("서버 수집을 요청했습니다. 잠시 후 새로고침해 주세요.");
      return;
    }

    setEnrichBiznoStatus(result.message || "수집에 실패했습니다.", true);
    showToast(result.message || "수집에 실패했습니다.", "error");
  } catch (err) {
    setEnrichBiznoStatus(err.message || "수집 오류", true);
    showToast(err.message || "수집 오류", "error");
  } finally {
    setDetailLoading(false);
    if (btn) btn.disabled = false;
  }
}

function bindDetailEdits(row) {
  const cid = row.companyId;

  byId("btn-enrich-bizno")?.addEventListener("click", () => runEnrichBizNo(row));

  byId("detail-save-all")?.addEventListener("click", () => {
    const parts = {};
    document.querySelectorAll(".score-part-input").forEach((inp) => {
      const v = inp.value.trim();
      if (v !== "") parts[inp.dataset.scorePart] = v;
    });
    const total = byId("edit-score-total")?.value.trim() ?? "";
    if (total !== "") parts._total = total;

    const patch = {
      companyNameKo: byId("edit-name-ko")?.value.trim(),
      companyTier: byId("edit-tier")?.value,
      leadGrade: byId("edit-grade")?.value,
      hidden: byId("edit-hidden")?.checked,
      favorite: byId("edit-fav")?.checked,
      excludeReason: byId("edit-exclude")?.value.trim(),
      notes: byId("edit-notes")?.value.trim(),
      contact: {
        name: byId("edit-contact-name")?.value.trim(),
        email: byId("edit-contact-email")?.value.trim(),
        phone: byId("edit-contact-phone")?.value.trim()
      },
      profile: {
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
      actions: {
        proposal: byId("edit-act-proposal")?.value,
        meeting: byId("edit-act-meeting")?.value,
        inquiry: byId("edit-act-inquiry")?.value
      },
      scoreParts: parts
    };

    const postUrl = byId("edit-post-url")?.value.trim();
    if (postUrl) {
      patch.extraPosts = [
        ...(window.TClientAdmin.getEntry(cid).extraPosts ?? []),
        {
          title: byId("edit-post-title")?.value.trim() || "QA 공고",
          url: postUrl,
          source: "manual",
          sourceLabel: "수동"
        }
      ];
    }

    window.TClientAdmin.setEntry(cid, patch);
    finishDetailSave(cid, { exitEdit: true, toastMessage: "정상 저장되었습니다." });
    setAdminStatus("저장됨 (로컬). GitHub 반영은 상단 관리 → 저장 반영");
  });
}

function mergeBaseRows(snapshotRows) {
  const custom = window.TClientAdmin?.getCustomCompanies?.() ?? [];
  const ids = new Set(snapshotRows.map((r) => r.companyId));
  return [...snapshotRows, ...custom.filter((r) => !ids.has(r.companyId))];
}

function reloadRowsWithAdmin() {
  state.rawRows = mergeBaseRows(state.snapshotRows);
  state.rows = state.rawRows.map((row) => {
    const enriched = enrichRow(row);
    return window.TClientAdmin ? window.TClientAdmin.applyToRow(enriched) : enriched;
  });
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
  const raw = `${value ?? ""}`.trim();
  if (!raw) return "";
  if (!/^https?:\/\//i.test(raw)) return `https://${raw}`;
  return raw;
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

function postUrlExists(url) {
  const norm = url.toLowerCase();
  return state.rows.some((row) =>
    (row.posts ?? []).some((p) => `${p.url ?? ""}`.toLowerCase() === norm)
  );
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
    reportRequired: "no",
    meetingRequired: "no",
    actions: {
      proposal: { label: "제안", status: "보류" },
      meeting: { label: "미팅", status: "보류" },
      inquiry: { label: "문의", status: "보류" }
    },
    actionSummary: "보류",
    actionReasons: ["수동 등록 회사 — 프로필·공고를 입력하세요."],
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

function toggleFavorite(companyId) {
  if (!window.TClientAdmin?.isUnlocked()) return;
  const entry = window.TClientAdmin.getEntry(companyId);
  window.TClientAdmin.setEntry(companyId, { favorite: !entry.favorite });
  reloadRowsWithAdmin();
  refreshViews();
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
    { icon: "building", value: totalCompanies, label: "수집 회사" },
    { icon: "briefcase", value: totalPosts, label: "QA 공고" },
    { icon: "target", value: proposal, label: "제안 추천" },
    { icon: "fileText", value: profile, label: "프로필 확보" },
    { icon: "mail", value: s.inquiryRecommend ?? 0, label: "문의 추천" },
    { icon: "ban", value: s.excluded ?? state.rows.filter((r) => r.excluded).length, label: "제외" }
  ];

  byId("dashboard").innerHTML = `
    <article class="dash-card dash-chart">
      <h2 class="dash-card-title">${iconSvg("chart", 16)} 등급 분포</h2>
      ${renderGradeDonut(gradeCounts)}
    </article>
    <div class="stat-strip">
      ${stats
        .map(
          (item) => `
        <div class="stat-item">
          <span class="stat-icon-wrap" aria-hidden="true">${iconSvg(item.icon, 18)}</span>
          <span class="stat-text"><strong>${item.value}</strong> ${escapeHtml(item.label)}</span>
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

function updateResultCount() {
  const filtered = state.rows.filter(passesFilters);
  if (state.activeTab === "posts") {
    let n = 0;
    for (const r of filtered) n += r.posts?.length || 0;
    byId("resultCount").textContent = `${n}건 공고 / 회사 ${filtered.length}건`;
  } else {
    byId("resultCount").textContent = `${filtered.length}건 / 전체 ${state.rows.length}건`;
  }
}

function renderLeadsTable() {
  const filtered = sortRows(state.rows.filter(passesFilters));
  updateResultCount();

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
            <tr class="${row.excluded ? "row-excluded" : ""}${row.userHidden ? " row-hidden-admin" : ""}${hasFailedPosts(row) ? " row-failure" : ""}${row.isManual ? " row-manual" : ""}${rowTierClass(row)}">
              <td class="cell-company">
                <div class="company-line">
                  ${favoriteStar(row, true)}
                  <strong>${escapeHtml(displayName(row))}</strong>
                  ${manualBadge(row)}
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

function tierLabelKo(tier) {
  const map = { startup: "소·스타트업", mid: "중견", enterprise: "대기업", unknown: "미확인" };
  return map[tier] ?? tier ?? "-";
}

function renderDetailBody(row, edit) {
  const e = window.TClientAdmin?.getEntry(row.companyId) ?? {};
  const p = { ...(row.profile ?? {}), ...(e.profile ?? {}) };
  const c = row.contact ?? {};
  const reasons = row.actionReasons ?? [];
  const tierVal = e.companyTier || row.companyTier || "";
  const email = c.email || row.email || "";

  const classifyBlock = edit
    ? `<div class="inline-grid">
        <div class="inline-row"><span class="inline-label">회사명</span>${inlineInput("edit-name-ko", e.companyNameKo || row.companyNameKo)}</div>
        <div class="inline-row"><span class="inline-label">규모</span>${inlineSelect("edit-tier", tierVal, [
          ["", "(자동)"],
          ["startup", "소·스타트업"],
          ["mid", "중견"],
          ["enterprise", "대기업"],
          ["unknown", "미확인"]
        ])}</div>
        <div class="inline-row"><span class="inline-label">등급</span>${inlineSelect("edit-grade", e.leadGrade || row.leadGrade, [
          ["", "(유지)"],
          ["A", "A"],
          ["B", "B"],
          ["C", "C"]
        ])}</div>
        <div class="inline-row inline-checks">
          <label><input type="checkbox" id="edit-fav" ${row.userFavorite ? "checked" : ""} /> 즐겨찾기</label>
          <label><input type="checkbox" id="edit-hidden" ${e.hidden ? "checked" : ""} /> 숨김</label>
        </div>
        <div class="inline-row"><span class="inline-label">제외</span>${inlineInput("edit-exclude", e.excludeReason ?? row.excludeReason ?? "")}</div>
        <div class="inline-row"><span class="inline-label">메모</span>${inlineInput("edit-notes", e.notes ?? row.manualNotes ?? "")}</div>
      </div>`
    : `<p class="detail-summary"><strong>${escapeHtml(displayName(row))}</strong> ${tierBadge(row)} <span class="badge grade-${row.leadGrade}">${row.leadGrade}</span></p>
       <p class="muted">${escapeHtml(companySubline(row))} · ${row.priorityScore}점 · ${escapeHtml(tierLabelKo(row.companyTier))}</p>`;

  const contactBlock = edit
    ? `<div class="inline-grid cols-3">
        <div class="inline-row"><span class="inline-label">이름</span>${inlineInput("edit-contact-name", c.name ?? "")}</div>
        <div class="inline-row"><span class="inline-label">이메일</span>${inlineInput("edit-contact-email", email, "email")}</div>
        <div class="inline-row"><span class="inline-label">전화</span>${inlineInput("edit-contact-phone", c.phone ?? "", "tel")}</div>
      </div>`
    : `<p>${c.name ? `<strong>${escapeHtml(c.name)}</strong> · ` : ""}${email ? escapeHtml(email) : '<span class="muted">이메일 없음</span>'}${c.phone ? ` · ${escapeHtml(c.phone)}` : ""}</p>`;

  const actionsBlock = edit
    ? `<div class="inline-grid cols-3 action-inline">
        <div class="inline-row"><span class="inline-label">제안</span>${actionSelect("edit-act-proposal", row.actions.proposal.status)}</div>
        <div class="inline-row"><span class="inline-label">미팅</span>${actionSelect("edit-act-meeting", row.actions.meeting.status)}</div>
        <div class="inline-row"><span class="inline-label">문의</span>${actionSelect("edit-act-inquiry", row.actions.inquiry.status)}</div>
      </div>`
    : `<div class="action-row">${renderActionBadges(row.actions)}</div>`;

  return `
    <section class="detail-section">
      ${detailTitle("분류 · 등급")}
      ${classifyBlock}
    </section>
    <section class="detail-section">
      ${detailTitle("담당자")}
      ${contactBlock}
    </section>
    <section class="detail-section">
      ${detailTitle("회사 프로필")}
      ${renderProfileSection(row, edit, p, e.domain || row.domain || "")}
    </section>
    <section class="detail-section">
      ${detailTitle("다음 액션")}
      ${actionsBlock}
      ${reasons.length ? `<ul class="reason-list">${reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : ""}
    </section>
    <section class="detail-section">
      ${detailTitle(`QA 채용 공고 (${row.posts.length}건)`)}
      <table class="detail-table">
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
        edit
          ? `<div class="inline-grid cols-2 post-add-row">
          <div class="inline-row"><span class="inline-label">추가 제목</span>${inlineInput("edit-post-title", "", "text", "QA 엔지니어")}</div>
          <div class="inline-row"><span class="inline-label">URL</span>${inlineInput("edit-post-url", "", "url", "https://...")}</div>
        </div>`
          : ""
      }
    </section>
    <section class="detail-section muted-box">
      ${detailTitle("점수 근거")}
      ${renderScoreSection(row, edit)}
    </section>
    ${row.excludeReason ? `<p class="warn">제외: ${escapeHtml(row.excludeReason)}</p>` : ""}
    ${edit ? `<footer class="detail-footer"><button type="button" class="btn-ghost btn-sm" id="detail-cancel-edit">취소</button><button type="button" class="btn-primary" id="detail-save-all">변경 저장</button></footer>` : ""}`;
}

function paintDetailModal() {
  const modal = byId("detailModal");
  const row = state.detailRow;
  if (!row) return;

  setDetailLoading(false);

  const admin = window.TClientAdmin?.isUnlocked();
  const edit = state.detailEdit && admin;

  byId("detailTitle").textContent = displayName(row);
  const editBtn = byId("detailEditBtn");
  editBtn?.classList.toggle("hidden", !admin);
  editBtn?.classList.toggle("active", edit);
  editBtn?.setAttribute("aria-pressed", edit ? "true" : "false");

  const deleteBtn = byId("detailDeleteBtn");
  const deletable = admin && (row.isManual || window.TClientAdmin?.isCustomCompany?.(row.companyId));
  deleteBtn?.classList.toggle("hidden", !deletable);

  byId("detailBody").innerHTML = renderDetailBody(row, edit);

  if (edit) {
    bindDetailEdits(row);
    window.TUiSelect?.init(modal);
    byId("detail-cancel-edit")?.addEventListener("click", () => {
      state.detailEdit = false;
      paintDetailModal();
    });
  }
  hydrateIcons(modal);
}

function openDetail(row, edit = false) {
  const modal = byId("detailModal");
  state.detailRow = row;
  state.detailEdit = edit && window.TClientAdmin?.isUnlocked();
  paintDetailModal();
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeDetail() {
  const modal = byId("detailModal");
  state.detailRow = null;
  state.detailEdit = false;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
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
  if (postUrlExists(url)) {
    showToast("이미 등록된 공고 URL입니다.", "error");
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
    }

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

function deleteManualCompany(row) {
  if (!row?.companyId || !window.TClientAdmin?.isUnlocked()) return;
  if (!row.isManual && !window.TClientAdmin.isCustomCompany(row.companyId)) {
    showToast("수동 등록 회사만 삭제할 수 있습니다.", "error");
    return;
  }
  const name = displayName(row);
  if (!window.confirm(`「${name}」 수동 등록을 삭제할까요?\n(로컬 overrides에서 제거, 저장 반영 필요)`)) return;
  if (!window.TClientAdmin.removeCustomCompany(row.companyId)) {
    showToast("삭제할 수 없습니다.", "error");
    return;
  }
  closeDetail();
  reloadRowsWithAdmin();
  refreshViews();
  showToast("수동 등록이 삭제되었습니다. GitHub 반영은 저장 반영을 실행하세요.");
  setAdminStatus("저장됨 (로컬). GitHub 반영은 상단 관리 → 저장 반영");
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
  const modal = byId("detailModal");
  if (!modal) return;

  byId("detailEditBtn")?.addEventListener("click", () => {
    if (!state.detailRow || !window.TClientAdmin?.isUnlocked()) return;
    state.detailEdit = !state.detailEdit;
    paintDetailModal();
  });

  byId("detailDeleteBtn")?.addEventListener("click", () => {
    if (!state.detailRow) return;
    deleteManualCompany(state.detailRow);
  });

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

function collectAllPosts() {
  const rows = sortRows(state.rows.filter(passesFilters));
  const out = [];
  for (const row of rows) {
    for (const post of row.posts ?? []) {
      out.push({ post, row });
    }
  }
  return out;
}

function renderAllPosts() {
  const items = collectAllPosts();
  if (state.activeTab === "leads") return;

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
            <th>수집일</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              ({ post, row }) => `
            <tr class="${post.failureReason ? "row-failure" : ""}${rowTierClass(row)}">
              <td class="cell-company">
                <button type="button" class="link-btn" data-company="${escapeAttr(row.companyId)}">${escapeHtml(displayName(row))}</button>
                ${tierBadge(row)}
              </td>
              <td><span class="badge grade-${row.leadGrade}">${row.leadGrade}</span></td>
              <td>${escapeHtml(post.title)}</td>
              <td>${escapeHtml(post.sourceLabel || post.source)}</td>
              <td>${formatDate(row.lastCollectedAt)}</td>
              <td><a class="link" href="${escapeAttr(post.url)}" target="_blank" rel="noreferrer">${iconSvg("external", 14)}</a></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  byId("posts").querySelectorAll("[data-company]").forEach((btn) => {
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

function bindTabs() {
  document.querySelectorAll(".tabs .tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs .tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.activeTab = btn.dataset.tab;
      ["leads", "posts"].forEach((id) => byId(id).classList.add("hidden"));
      byId(btn.dataset.tab).classList.remove("hidden");
      refreshViews();
    });
  });
}

function refreshViews() {
  renderKpi();
  renderLeadsTable();
  renderAllPosts();
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
  if (open && window.TClientAdmin.isUnlocked()) {
    setAdminUi(true);
    renderAdminKeywords();
  }
  if (open) byId("adminPassword")?.focus();
}

function renderAdminKeywords() {
  const el = byId("keywordChips");
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
      renderAdminKeywords();
    });
  });
}

function bindKeywordAdmin() {
  byId("keywordAddBtn")?.addEventListener("click", () => {
    const input = byId("keywordInput");
    const value = input?.value ?? "";
    if (!window.TClientAdmin.addKeywordDraft(value)) {
      setAdminStatus(value.trim() ? "이미 있는 키워드입니다." : "키워드를 입력하세요.");
      return;
    }
    input.value = "";
    renderAdminKeywords();
    setAdminStatus("");
  });

  byId("keywordInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") byId("keywordAddBtn")?.click();
  });

  byId("adminSaveKeywords")?.addEventListener("click", async () => {
    setAdminStatus("키워드 반영 중…");
    try {
      await window.TClientAdmin.saveKeywordsToGitHub();
      renderAdminKeywords();
      setAdminStatus("키워드 반영됨 (시트 동기화 중)");
    } catch (err) {
      setAdminStatus(err.message || String(err));
    }
  });

  byId("adminTriggerCollect")?.addEventListener("click", async () => {
    setAdminStatus("크롤링 요청 중…");
    try {
      await window.TClientAdmin.saveKeywordsToGitHub();
      await window.TClientAdmin.triggerCollect();
      renderAdminKeywords();
      setAdminStatus("크롤링 시작됨 (10~30분 후 새로고침)");
    } catch (err) {
      setAdminStatus(err.message || String(err));
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
    const pw = byId("adminPassword").value;
    if (await window.TClientAdmin.unlock(pw)) {
      setAdminUi(true);
      setAdminStatus("관리자 모드");
      byId("adminPassword").value = "";
      renderAdminKeywords();
      refreshViews();
      if (state.detailRow) paintDetailModal();
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
    if (state.detailRow) paintDetailModal();
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

  bindKeywordAdmin();

  if (window.TClientAdmin.isUnlocked()) {
    setAdminUi(true);
    renderAdminKeywords();
  }
}

async function boot() {
  try {
    await window.TClientAdmin.initDoc();
    const res = await fetch("./data/snapshot.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snapshot = await res.json();
    state.snapshotRows = snapshot.rows ?? [];
    reloadRowsWithAdmin();
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
    bindAddCompanyModal();
    bindAddPostModal();
    bindAdmin();
    renderPresets();
    bindTabs();
    window.TUiSelect?.init();
    refreshViews();
  } catch (err) {
    byId("meta").textContent = "로드 실패";
    byId("leads").innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
  }
}

boot();
