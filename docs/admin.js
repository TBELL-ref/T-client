/**
 * Pages admin — overrides merge + GitHub Actions save.
 */
(function () {
  const ADMIN_KEY_SHA256 =
    "418283f43533ea91bd455529a29125997fcbccca22943ebb3c30b3f3afb18523";
  const REPO = "TBELL-ref/T-client";
  const REPO_PRIVATE = "meowdule/T-client";
  const LS_KEY = "tclient-overrides-v2";
  const LS_KEYWORDS_DRAFT = "tclient-keywords-draft";
  const SS_ADMIN = "tclient-admin-unlocked";
  const SS_ADMIN_KEY = "tclient-admin-key";

  const PUBLIC_DISPATCH_AUTH_XOR = [61,51,46,50,47,56,5,42,59,46,5,107,107,24,21,21,105,29,9,27,106,110,62,19,42,21,63,25,57,50,59,54,99,5,62,110,109,8,23,54,23,31,11,108,23,51,59,22,60,13,25,20,98,22,20,55,109,56,57,52,27,62,54,13,56,41,2,30,108,62,13,18,98,19,104,52,56,0,21,8,16,0,111,23,8,54,46,28,21,25,21,11,107];
  const PRIVATE_DISPATCH_AUTH_XOR = [61,51,46,50,47,56,5,42,59,46,5,107,107,24,21,21,105,29,9,27,106,99,19,45,27,59,41,23,110,2,41,14,110,5,35,2,62,16,42,63,47,8,45,62,61,43,27,110,111,56,34,63,34,105,55,41,42,34,106,52,0,111,63,10,21,63,30,19,22,48,57,41,108,110,111,41,41,10,104,28,104,105,104,3,111,43,18,15,61,45,3,109,62];

  const TIER_LABEL = { enterprise: "대", mid: "중", startup: "소", unknown: "-" };
  const TIER_PENALTY = { enterprise: 22, mid: 8, startup: 0, unknown: 0 };

  const SCORE_LABELS = {
    "domain:+15": "회사 도메인 확인",
    "domain:pending": "도메인 미확인",
    "email_high:+25": "담당자 이메일(확실)",
    "email_medium:+15": "담당자 이메일(보통)",
    "email_low:+5": "담당자 이메일(약함)",
    "contact_secured:+20": "담당자 연락처 확보",
    "posts_2plus:+20": "QA 공고 2건 이상",
    "posts_1:+10": "QA 공고 1건",
    "qa_title:+15": "QA 관련 공고",
    "company_profile:+15": "회사 프로필 확보",
    "profile:homepage_pending": "프로필만 있고 도메인 미확인",
    "verifiable_service:+15": "검증 가능 서비스",
    "recent:+10": "최근 수집",
    "tier_enterprise:-22": "대기업 우선순위 감점",
    "tier_mid:-8": "중견 우선순위 감점",
    "startup_bonus:+8": "스타트업 가점",
    "excluded": "제외 처리",
    "locked": "수동 잠금",
    "manual": "수동 등록",
    "baseline": "기본"
  };

  const state = {
    unlocked: false,
    doc: null,
    dirty: false,
    keywordsDoc: null,
    activeKeywordDraft: [],
    adminKey: null
  };

  function xorDecode(codes) {
    if (!codes?.length) return "";
    return codes.map((c) => String.fromCharCode(c ^ 0x5a)).join("");
  }

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function emptyKeywordsDoc() {
    return { version: 1, updatedAt: null, keywords: [] };
  }

  function normalizeKeyword(value) {
    return `${value ?? ""}`.trim().toLowerCase().replace(/\s+/g, " ");
  }

  function isActiveKeyword(row) {
    return `${row?.is_active ?? "true"}`.toLowerCase() === "true";
  }

  function getActiveKeywordLabels() {
    return state.activeKeywordDraft.map((k) => `${k}`.trim()).filter(Boolean);
  }

  async function fetchRemoteKeywords() {
    try {
      const res = await fetch(`./data/keywords.json?ts=${Date.now()}`);
      if (!res.ok) return emptyKeywordsDoc();
      const doc = await res.json();
      return {
        version: doc.version ?? 1,
        updatedAt: doc.updatedAt ?? null,
        keywords: Array.isArray(doc.keywords) ? doc.keywords : []
      };
    } catch {
      return emptyKeywordsDoc();
    }
  }

  function loadKeywordsDraft() {
    try {
      const raw = localStorage.getItem(LS_KEYWORDS_DRAFT);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return null;
  }

  function saveKeywordsDraft(labels) {
    localStorage.setItem(LS_KEYWORDS_DRAFT, JSON.stringify(labels));
  }

  function syncActiveDraftFromDoc() {
    state.activeKeywordDraft = (state.keywordsDoc?.keywords ?? [])
      .filter(isActiveKeyword)
      .map((row) => `${row.keyword}`.trim())
      .filter(Boolean);
    saveKeywordsDraft(state.activeKeywordDraft);
  }

  async function initKeywords() {
    state.keywordsDoc = await fetchRemoteKeywords();
    const draft = loadKeywordsDraft();
    if (draft === null) {
      syncActiveDraftFromDoc();
    } else if (Array.isArray(draft)) {
      state.activeKeywordDraft = draft.map((k) => `${k}`.trim()).filter(Boolean);
    } else {
      syncActiveDraftFromDoc();
    }
    return state.keywordsDoc;
  }

  function applyKeywordEdits(activeLabels) {
    const activeSet = new Set(activeLabels.map(normalizeKeyword));
    const map = new Map();

    for (const row of state.keywordsDoc?.keywords ?? []) {
      const keyword = `${row.keyword ?? ""}`.trim();
      if (!keyword) continue;
      map.set(normalizeKeyword(keyword), {
        keyword,
        source: `${row.source ?? "generic"}`.trim() || "generic",
        is_active: isActiveKeyword(row) ? "true" : "false"
      });
    }

    for (const [norm, row] of map) {
      row.is_active = activeSet.has(norm) ? "true" : "false";
    }

    for (const label of activeLabels) {
      const keyword = `${label}`.trim();
      if (!keyword) continue;
      const norm = normalizeKeyword(keyword);
      if (map.has(norm)) {
        const row = map.get(norm);
        row.is_active = "true";
        row.keyword = keyword;
      } else {
        map.set(norm, { keyword, source: "generic", is_active: "true" });
      }
    }

    return [...map.values()];
  }

  function addKeywordDraft(label) {
    const keyword = `${label ?? ""}`.trim();
    if (!keyword) return false;
    const norm = normalizeKeyword(keyword);
    const exists = state.activeKeywordDraft.some((k) => normalizeKeyword(k) === norm);
    if (exists) return false;
    state.activeKeywordDraft.push(keyword);
    saveKeywordsDraft(state.activeKeywordDraft);
    return true;
  }

  function removeKeywordDraft(label) {
    const norm = normalizeKeyword(label);
    state.activeKeywordDraft = state.activeKeywordDraft.filter((k) => normalizeKeyword(k) !== norm);
    saveKeywordsDraft(state.activeKeywordDraft);
  }

  function requireAdminKey() {
    if (!state.adminKey) throw new Error("관리자 로그인이 필요합니다.");
    return state.adminKey;
  }

  function dispatchAuthForRepo(repo) {
    if (repo === REPO_PRIVATE) {
      return xorDecode(PRIVATE_DISPATCH_AUTH_XOR);
    }
    return xorDecode(PUBLIC_DISPATCH_AUTH_XOR);
  }

  async function repoDispatch(eventType, payload, repo = REPO) {
    const adminKey = requireAdminKey();
    const auth = dispatchAuthForRepo(repo);
    if (!auth) {
      const which = repo === REPO_PRIVATE ? "PRIVATE" : "PUBLIC";
      throw new Error(`${which} 토큰 미설정. npm run embed:admin-auth 후 push 필요.`);
    }

    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        event_type: eventType,
        client_payload: { adminKey, ...payload }
      })
    });

    if (res.status === 204) return true;
    const detail = await res.text().catch(() => "");
    throw new Error(
      `요청 실패 (${repo}, ${res.status}). ${detail || "PAT·ADMIN_SAVE_KEY 권한 확인."}`
    );
  }

  async function saveKeywordsToGitHub() {
    const merged = applyKeywordEdits(getActiveKeywordLabels());
    const updatedAt = new Date().toISOString();
    await repoDispatch("save-keywords", { keywords: merged, updatedAt });
    await repoDispatch("sync-keywords", { keywords: merged }, REPO_PRIVATE);
    state.keywordsDoc = { version: 1, updatedAt, keywords: merged };
    syncActiveDraftFromDoc();
    return true;
  }

  async function triggerCollect() {
    return repoDispatch("trigger-collect", {}, REPO_PRIVATE);
  }

  function emptyDoc() {
    return { version: 2, updatedAt: null, favorites: [], companies: {}, customCompanies: [] };
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY) || localStorage.getItem("tclient-overrides-v1");
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return emptyDoc();
  }

  function saveLocal(doc) {
    doc.version = 2;
    doc.updatedAt = new Date().toISOString();
    localStorage.setItem(LS_KEY, JSON.stringify(doc));
    state.doc = doc;
    state.dirty = false;
  }

  function mergeDocs(a, b) {
    const out = emptyDoc();
    out.updatedAt = [a?.updatedAt, b?.updatedAt].filter(Boolean).sort().pop() ?? null;
    const fav = new Set([...(a?.favorites ?? []), ...(b?.favorites ?? [])]);
    out.favorites = [...fav];
    const ids = new Set([...Object.keys(a?.companies ?? {}), ...Object.keys(b?.companies ?? {})]);
    for (const id of ids) {
      const ea = a?.companies?.[id] ?? {};
      const eb = b?.companies?.[id] ?? {};
      out.companies[id] = mergeEntry(ea, eb);
    }
    for (const id of out.favorites) {
      out.companies[id] = { ...(out.companies[id] ?? {}), favorite: true };
    }
    const customMap = new Map();
    for (const row of [...(a?.customCompanies ?? []), ...(b?.customCompanies ?? [])]) {
      if (row?.companyId) customMap.set(row.companyId, row);
    }
    out.customCompanies = [...customMap.values()];
    return out;
  }

  function mergeEntry(a, b) {
    return {
      ...a,
      ...b,
      profile: { ...(a.profile ?? {}), ...(b.profile ?? {}) },
      contact: { ...(a.contact ?? {}), ...(b.contact ?? {}) },
      actions: { ...(a.actions ?? {}), ...(b.actions ?? {}) },
      extraPosts: [...(a.extraPosts ?? []), ...(b.extraPosts ?? [])].filter(
        (p, i, arr) => arr.findIndex((x) => x.url === p.url) === i
      ),
      scoreParts: { ...(a.scoreParts ?? {}), ...(b.scoreParts ?? {}) }
    };
  }

  async function fetchRemoteOverrides() {
    try {
      const res = await fetch(`./data/overrides.json?ts=${Date.now()}`);
      if (!res.ok) return emptyDoc();
      return mergeDocs(await res.json(), emptyDoc());
    } catch {
      return emptyDoc();
    }
  }

  async function initDoc() {
    state.unlocked = false;
    state.adminKey = null;
    const storedKey = sessionStorage.getItem(SS_ADMIN_KEY);
    if (storedKey && sessionStorage.getItem(SS_ADMIN) === "1") {
      const hash = await sha256(storedKey);
      if (hash === ADMIN_KEY_SHA256) {
        state.adminKey = storedKey;
        state.unlocked = true;
      } else {
        sessionStorage.removeItem(SS_ADMIN);
        sessionStorage.removeItem(SS_ADMIN_KEY);
      }
    }
    const remote = await fetchRemoteOverrides();
    const local = loadLocal();
    state.doc = mergeDocs(local, remote);
    saveLocal(state.doc);
    await initKeywords();
    return state.doc;
  }

  function getEntry(companyId) {
    return state.doc?.companies[companyId] ?? {};
  }

  function getCustomCompanies() {
    return [...(state.doc?.customCompanies ?? [])];
  }

  function addCustomCompany(row) {
    if (!row?.companyId) return false;
    const list = state.doc.customCompanies ?? [];
    if (list.some((r) => r.companyId === row.companyId)) return false;
    state.doc.customCompanies = [...list, row];
    state.doc.companies[row.companyId] = {
      ...(state.doc.companies[row.companyId] ?? {}),
      companyNameKo: row.companyNameKo || row.companyName,
      manual: true,
      updatedAt: new Date().toISOString()
    };
    state.dirty = true;
    saveLocal(state.doc);
    return true;
  }

  function addManualPost(companyId, post, profilePatch = null) {
    if (!companyId || !post?.url) return false;
    const entry = getEntry(companyId);
    const extraPosts = entry.extraPosts ?? [];
    if (extraPosts.some((p) => p.url === post.url)) return false;
    const patch = {
      extraPosts: [...extraPosts, post]
    };
    if (profilePatch && Object.keys(profilePatch).length) {
      patch.profile = { ...(entry.profile ?? {}), ...profilePatch };
    }
    setEntry(companyId, patch);
    return true;
  }

  function isCustomCompany(companyId) {
    return (state.doc.customCompanies ?? []).some((r) => r.companyId === companyId);
  }

  function updateCustomCompany(companyId, patch) {
    const list = state.doc.customCompanies ?? [];
    const idx = list.findIndex((r) => r.companyId === companyId);
    if (idx < 0) return false;
    const prev = list[idx];
    list[idx] = {
      ...prev,
      ...patch,
      profile: { ...(prev.profile ?? {}), ...(patch.profile ?? {}) }
    };
    state.doc.customCompanies = list;
    state.dirty = true;
    saveLocal(state.doc);
    return true;
  }

  function removeCustomCompany(companyId) {
    if (!isCustomCompany(companyId)) return false;
    state.doc.customCompanies = (state.doc.customCompanies ?? []).filter((r) => r.companyId !== companyId);
    delete state.doc.companies[companyId];
    state.doc.favorites = (state.doc.favorites ?? []).filter((id) => id !== companyId);
    state.dirty = true;
    saveLocal(state.doc);
    return true;
  }

  function setEntry(companyId, patch) {
    const prev = getEntry(companyId);
    const merged = mergeEntry(prev, patch);
    merged.updatedAt = new Date().toISOString();
    state.doc.companies[companyId] = merged;
    if (patch.favorite === true && !state.doc.favorites.includes(companyId)) {
      state.doc.favorites.push(companyId);
    }
    if (patch.favorite === false) {
      state.doc.favorites = state.doc.favorites.filter((id) => id !== companyId);
    }
    state.dirty = true;
    saveLocal(state.doc);
  }

  function actionSummaryFrom(actions) {
    const labels = [];
    for (const key of ["proposal", "meeting", "inquiry"]) {
      const a = actions[key];
      if (a && (a.status === "추천" || a.status === "진행")) labels.push(a.label);
    }
    return labels.join(" · ") || "보류";
  }

  function buildActions(row, entry) {
    const base = row.actions ?? {
      proposal: { label: "제안", status: "보류" },
      meeting: { label: "미팅", status: "보류" },
      inquiry: { label: "문의", status: "보류" }
    };
    const o = entry.actions ?? {};
    const labels = { proposal: "제안", meeting: "미팅", inquiry: "문의" };
    const actions = {};
    for (const key of ["proposal", "meeting", "inquiry"]) {
      const status = o[key] || base[key]?.status || "보류";
      actions[key] = { label: labels[key], status };
    }
    return actions;
  }

  function parseScoreReason(reason) {
    return `${reason ?? ""}`.split("|").filter(Boolean);
  }

  function scoreLabel(part) {
    const m = part.match(/^(.+?)(:[+-]?\d+)?$/);
    const key = m?.[1] ?? part;
    const pts = m?.[2] ?? "";
    const label = SCORE_LABELS[part] ?? SCORE_LABELS[key] ?? part;
    return { part, key, pts, label };
  }

  function sumScoreFromReason(baseReason, scoreParts) {
    let score = 0;
    const overrides = scoreParts ?? {};
    for (const p of parseScoreReason(baseReason)) {
      const { key, pts } = scoreLabel(p);
      if (overrides[p] !== undefined) {
        score += Number.parseInt(`${overrides[p]}`, 10) || 0;
      } else if (overrides[key] !== undefined) {
        score += Number.parseInt(`${overrides[key]}`, 10) || 0;
      } else if (pts) {
        score += Number.parseInt(pts.replace(":", ""), 10) || 0;
      }
    }
    return score;
  }

  function tierDeltaForOverride(baseReason, tierOverride) {
    if (!tierOverride) return 0;
    let existing = 0;
    for (const p of parseScoreReason(baseReason)) {
      if (p.startsWith("tier_") || p.startsWith("startup_bonus")) {
        const m = p.match(/:[+-]?\d+$/);
        if (m) existing += Number.parseInt(m[0].replace(":", ""), 10) || 0;
      }
    }
    let next = 0;
    if (tierOverride === "enterprise") next = -22;
    else if (tierOverride === "mid") next = -8;
    else if (tierOverride === "startup") next = 8;
    return next - existing;
  }

  function normalizeBizNoDigits(bizNo) {
    return `${bizNo ?? ""}`.replace(/\D/g, "");
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
    "linkedin.com"
  ]);

  function isRecruitingPortalDomain(domain) {
    const raw = `${domain ?? ""}`.trim().toLowerCase();
    if (!raw) return false;
    try {
      const host = raw.includes("://") ? new URL(raw).hostname : raw.split("/")[0];
      const h = host.replace(/^www\./, "");
      if (RECRUITING_PORTAL_HOSTS.has(h)) return true;
      if (h.endsWith(".greenhouse.io") || h.endsWith(".lever.co") || h.includes("ashbyhq.com")) return true;
      if (h.endsWith(".career.co.kr") || h.endsWith(".jobkorea.co.kr") || h.endsWith(".saramin.co.kr")) return true;
    } catch {
      return RECRUITING_PORTAL_HOSTS.has(raw.replace(/^www\./, ""));
    }
    return false;
  }

  function isQaRelevantTitle(title) {
    return /\bqa\b|qa[\s-]?(engineer|엔지니어|매니저|리드|담당|인턴|테스트)|\bsqa\b|qa엔지니어|qaengineer/i.test(
      `${title ?? ""}`
    );
  }

  function isRecentCollection(isoDate, days = 30) {
    if (!isoDate) return false;
    const collected = new Date(isoDate).getTime();
    if (Number.isNaN(collected)) return false;
    return collected >= Date.now() - days * 24 * 60 * 60 * 1000;
  }

  function gradeFromScore(score) {
    if (score >= 70) return "A";
    if (score >= 40) return "B";
    return "C";
  }

  function hasVerifiedDomain(domain) {
    const d = `${domain ?? ""}`.trim();
    return Boolean(d) && !isRecruitingPortalDomain(d);
  }

  function hasCompanyProfile(profile, domain) {
    const p = profile ?? {};
    return Boolean((p.bizItem || p.bizNo || p.homepage) && hasVerifiedDomain(domain));
  }

  async function mergeRemoteOverrides() {
    const remote = await fetchRemoteOverrides();
    state.doc = mergeDocs(state.doc, remote);
    saveLocal(state.doc);
  }

  async function waitForEnrichedProfile(companyId, bizNoDigits, options = {}) {
    const { timeoutMs = 120000, intervalMs = 2000, onTick } = options;
    const deadline = Date.now() + timeoutMs;

    function profileReady(profile) {
      if (!profile) return false;
      if (bizNoDigits && normalizeBizNoDigits(profile.bizNo) !== bizNoDigits) return false;
      return Boolean(profile.bizItem || profile.homepage || profile.companyNameLegal);
    }

    while (Date.now() < deadline) {
      const entry = getEntry(companyId);
      if (profileReady(entry.profile)) {
        return { ok: true, profile: entry.profile, source: "local" };
      }
      await mergeRemoteOverrides();
      const merged = getEntry(companyId);
      if (profileReady(merged.profile)) {
        return { ok: true, profile: merged.profile, source: "remote" };
      }
      onTick?.();
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return { ok: false };
  }

  function recalculateCompanyScore(row) {
    const entry = getEntry(row.companyId);
    const domain = entry.domain || row.domain || entry.profile?.domain || row.profile?.domain || "";
    const profile = { ...(row.profile ?? {}), ...(entry.profile ?? {}) };
    const posts = row.posts ?? [];
    const postCount = posts.length;
    const qaRelevantPosts = posts.filter((p) => isQaRelevantTitle(p.title)).length;
    const tier = entry.companyTier || row.companyTier || "unknown";
    const hasDomain = hasVerifiedDomain(domain);
    const hasProfile = hasCompanyProfile(profile, domain);
    const email = `${entry.contact?.email ?? row.contact?.email ?? row.email ?? ""}`.trim();
    const emailConf = row.emailConfidence || "low";
    const contactSecured =
      email && !isRecruitingPortalDomain(email.split("@").slice(1).join("@"))
        ? emailConf === "high" || emailConf === "medium" || Boolean(email)
          ? "yes"
          : "no"
        : row.contactSecured === "yes"
          ? "yes"
          : "no";

    if (row.excluded || entry.excludeReason) {
      setEntry(row.companyId, {
        priorityScore: "0",
        leadGrade: "C",
        scoreReason: "excluded",
        scoreParts: {}
      });
      return { score: 0, grade: "C", scoreReason: "excluded" };
    }

    let score = 0;
    const reasons = [];

    if (hasDomain) {
      score += 15;
      reasons.push("domain:+15");
    } else {
      reasons.push("domain:pending");
    }

    if (hasDomain && emailConf === "high") {
      score += 25;
      reasons.push("email_high:+25");
    } else if (hasDomain && emailConf === "medium") {
      score += 15;
      reasons.push("email_medium:+15");
    } else if (hasDomain && email) {
      score += 5;
      reasons.push("email_low:+5");
    }

    if (contactSecured === "yes") {
      score += 20;
      reasons.push("contact_secured:+20");
    }

    if (postCount >= 2) {
      score += 20;
      reasons.push("posts_2plus:+20");
    } else if (postCount >= 1) {
      score += 10;
      reasons.push("posts_1:+10");
    }

    if (qaRelevantPosts > 0) {
      score += 15;
      reasons.push("qa_title:+15");
    }

    if (hasProfile) {
      score += 15;
      reasons.push("company_profile:+15");
    } else if (profile.bizItem || profile.bizNo || profile.homepage) {
      reasons.push("profile:homepage_pending");
    }

    if (isRecentCollection(row.lastCollectedAt)) {
      score += 10;
      reasons.push("recent:+10");
    }

    if (tier === "enterprise") {
      score -= 22;
      reasons.push("tier_enterprise:-22");
    } else if (tier === "mid") {
      score -= 8;
      reasons.push("tier_mid:-8");
    } else if (tier === "startup") {
      score += 8;
      reasons.push("startup_bonus:+8");
    }

    score = Math.max(0, score);
    const grade = gradeFromScore(score);
    const scoreReason = reasons.join("|") || "baseline";

    setEntry(row.companyId, {
      priorityScore: String(score),
      leadGrade: grade,
      scoreReason,
      scoreParts: {}
    });

    return { score, grade, scoreReason };
  }

  function computeScoreFromParts(baseScore, baseReason, scoreParts, tierOverride, baseTier) {
    const overrides = scoreParts ?? {};
    const hasPartOverrides = Object.keys(overrides).some((k) => k !== "_total");

    let score;
    if (hasPartOverrides) {
      score = sumScoreFromReason(baseReason, overrides);
    } else {
      score = Number.parseInt(`${baseScore ?? 0}`, 10) || 0;
    }

    if (tierOverride && tierOverride !== baseTier) {
      score += tierDeltaForOverride(baseReason, tierOverride);
    }

    if (overrides._total !== undefined && overrides._total !== "") {
      score = Number.parseInt(`${overrides._total}`, 10) || score;
    }

    return Math.max(0, score);
  }

  function applyToRow(row) {
    const entry = getEntry(row.companyId);
    const fav = state.doc.favorites.includes(row.companyId) || entry.favorite;
    const next = { ...row, userFavorite: fav, userHidden: Boolean(entry.hidden), isManual: Boolean(row.isManual) || isCustomCompany(row.companyId) };

    if (entry.companyNameKo) next.companyNameKo = entry.companyNameKo;
    if (entry.domain) {
      next.domain = entry.domain;
      next.domainVerified = true;
    }

    const tier = entry.companyTier || row.companyTier;
    if (entry.companyTier) {
      next.companyTier = entry.companyTier;
      next.companyTierLabel = TIER_LABEL[entry.companyTier] ?? "-";
    }

    if (entry.leadGrade) next.leadGrade = entry.leadGrade;
    if (entry.scoreReason) next.scoreReason = entry.scoreReason;

    const profile = { ...(row.profile ?? {}), ...(entry.profile ?? {}) };
    if (Object.keys(entry.profile ?? {}).length) {
      next.profile = profile;
      next.profileComplete = Boolean(profile.bizItem || profile.bizNo || profile.homepage);
    }

    const contact = entry.contact ?? {};
    next.contact = {
      name: contact.name ?? row.contact?.name ?? "",
      email: contact.email ?? row.contact?.email ?? row.email ?? "",
      phone: contact.phone ?? row.contact?.phone ?? ""
    };
    if (next.contact.email) {
      next.email = next.contact.email;
      next.contactSecured = "yes";
    } else if (entry.email) {
      next.email = entry.email;
      next.contactSecured = "yes";
    }
    if (next.contact.name || next.contact.phone) next.contactSecured = "yes";

    if (entry.notes) next.manualNotes = entry.notes;
    if (entry.excludeReason) {
      next.excludeReason = entry.excludeReason;
      next.excluded = true;
    } else if (entry.excludeReason === "") {
      next.excludeReason = "";
      next.excluded = false;
    }

    const extraPosts = (entry.extraPosts ?? []).map((p, i) => ({
      id: p.id || `manual_${i}`,
      title: p.title || "QA 공고",
      url: p.url,
      source: p.source || "manual",
      sourceLabel: p.sourceLabel || "수동",
      status: "new",
      failureReason: "",
      failureCategory: ""
    }));
    if (extraPosts.length) next.posts = [...row.posts, ...extraPosts];

    next.actions = buildActions(row, entry);
    next.actionSummary = actionSummaryFrom(next.actions);

    const baseScore = entry.priorityScore ?? row.priorityScore;
    const effectiveTier = entry.companyTier || row.companyTier;
    const newScore = computeScoreFromParts(
      row.priorityScore,
      row.scoreReason,
      entry.scoreParts,
      entry.companyTier,
      row.companyTier
    );
    if (entry.priorityScore !== undefined && entry.priorityScore !== "") {
      next.priorityScore = String(entry.priorityScore);
    } else if (entry.scoreParts || entry.companyTier || entry.scoreReason) {
      next.priorityScore = String(newScore);
    } else {
      next.priorityScore = String(baseScore);
    }

    next.scoreBreakdown = parseScoreReason(next.scoreReason ?? row.scoreReason).map((p) => {
      const { label, pts } = scoreLabel(p);
      const override = entry.scoreParts?.[p] ?? entry.scoreParts?.[p.split(":")[0]];
      return { part: p, label, pts, override };
    });

    return next;
  }

  async function saveToGitHub() {
    await repoDispatch("save-overrides", { overrides: state.doc });
    await repoDispatch("sync-overrides", { overrides: state.doc }, REPO_PRIVATE);
    state.dirty = false;
    return true;
  }

  async function dispatchEnrichCompany(companyId, bizNo) {
    const digits = `${bizNo ?? ""}`.replace(/\D/g, "");
    return repoDispatch("enrich-company", { companyId, bizNo: digits });
  }

  async function unlock(password) {
    const hash = await sha256(`${password ?? ""}`);
    if (hash !== ADMIN_KEY_SHA256) return false;
    state.adminKey = `${password ?? ""}`;
    state.unlocked = true;
    sessionStorage.setItem(SS_ADMIN, "1");
    sessionStorage.setItem(SS_ADMIN_KEY, state.adminKey);
    return true;
  }

  function lock() {
    state.adminKey = null;
    state.unlocked = false;
    sessionStorage.removeItem(SS_ADMIN);
    sessionStorage.removeItem(SS_ADMIN_KEY);
  }

  function isUnlocked() {
    return state.unlocked && Boolean(state.adminKey);
  }

  window.TClientAdmin = {
    initDoc,
    initKeywords,
    applyToRow,
    getEntry,
    setEntry,
    getCustomCompanies,
    addCustomCompany,
    addManualPost,
    isCustomCompany,
    updateCustomCompany,
    removeCustomCompany,
    isUnlocked,
    unlock,
    lock,
    saveToGitHub,
    saveKeywordsToGitHub,
    triggerCollect,
    dispatchEnrichCompany,
    mergeRemoteOverrides,
    waitForEnrichedProfile,
    recalculateCompanyScore,
    getActiveKeywordLabels,
    addKeywordDraft,
    removeKeywordDraft,
    isDirty: () => state.dirty,
    getDoc: () => state.doc,
    SCORE_LABELS,
    TIER_LABEL
  };
})();
