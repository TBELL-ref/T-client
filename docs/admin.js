/**
 * Pages admin — overrides merge + GitHub Actions save.
 */
(function () {
  const ADMIN_KEY_SHA256 =
    "418283f43533ea91bd455529a29125997fcbccca22943ebb3c30b3f3afb18523";
  const REPO = "TBELL-ref/T-client";
  const LS_KEY = "tclient-overrides-v2";
  const SS_ADMIN = "tclient-admin-unlocked";
  const SS_KEY = "tclient-admin-key";

  const DISPATCH_AUTH_XOR = [61,51,46,50,47,56,5,42,59,46,5,107,107,24,21,21,105,29,9,27,106,110,62,19,42,21,63,25,57,50,59,54,99,5,62,110,109,8,23,54,23,31,11,108,23,51,59,22,60,13,25,20,98,22,20,55,109,56,57,52,27,62,54,13,56,41,2,30,108,62,13,18,98,19,104,52,56,0,21,8,16,0,111,23,8,54,46,28,21,25,21,11,107];

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
    "locked": "수동 잠금"
  };

  const state = { unlocked: false, doc: null, dirty: false };

  function xorDecode(codes) {
    if (!codes?.length) return "";
    return codes.map((c) => String.fromCharCode(c ^ 0x5a)).join("");
  }

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function emptyDoc() {
    return { version: 2, updatedAt: null, favorites: [], companies: {} };
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
    state.unlocked = sessionStorage.getItem(SS_ADMIN) === "1";
    const remote = await fetchRemoteOverrides();
    const local = loadLocal();
    state.doc = mergeDocs(local, remote);
    saveLocal(state.doc);
    return state.doc;
  }

  function getEntry(companyId) {
    return state.doc?.companies[companyId] ?? {};
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
    const next = { ...row, userFavorite: fav, userHidden: Boolean(entry.hidden) };

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
    } else if (entry.scoreParts || entry.companyTier) {
      next.priorityScore = String(newScore);
    } else {
      next.priorityScore = String(baseScore);
    }

    next.scoreBreakdown = parseScoreReason(row.scoreReason).map((p) => {
      const { label, pts } = scoreLabel(p);
      const override = entry.scoreParts?.[p] ?? entry.scoreParts?.[p.split(":")[0]];
      return { part: p, label, pts, override };
    });

    return next;
  }

  async function saveToGitHub() {
    const adminKey = sessionStorage.getItem(SS_KEY);
    if (!adminKey) throw new Error("관리자 로그인이 필요합니다.");

    const auth = xorDecode(DISPATCH_AUTH_XOR);
    if (!auth) {
      throw new Error("저장용 토큰 미설정. npm run embed:admin-auth 후 push 필요.");
    }

    const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({
        event_type: "save-overrides",
        client_payload: { adminKey, overrides: state.doc }
      })
    });

    if (res.status === 204) {
      state.dirty = false;
      return true;
    }
    throw new Error(`GitHub 저장 실패 (${res.status}). ADMIN_SAVE_KEY·토큰 확인.`);
  }

  async function unlock(password) {
    const hash = await sha256(`${password ?? ""}`);
    if (hash !== ADMIN_KEY_SHA256) return false;
    sessionStorage.setItem(SS_ADMIN, "1");
    sessionStorage.setItem(SS_KEY, password);
    state.unlocked = true;
    return true;
  }

  function lock() {
    sessionStorage.removeItem(SS_ADMIN);
    sessionStorage.removeItem(SS_KEY);
    state.unlocked = false;
  }

  function isUnlocked() {
    return state.unlocked || sessionStorage.getItem(SS_ADMIN) === "1";
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state.doc, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tclient-overrides-${Date.now()}.json`;
    a.click();
  }

  function importJson(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          state.doc = mergeDocs(JSON.parse(reader.result), state.doc);
          saveLocal(state.doc);
          resolve(state.doc);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  window.TClientAdmin = {
    initDoc,
    applyToRow,
    getEntry,
    setEntry,
    isUnlocked,
    unlock,
    lock,
    saveToGitHub,
    exportJson,
    importJson,
    isDirty: () => state.dirty,
    getDoc: () => state.doc,
    SCORE_LABELS,
    TIER_LABEL
  };
})();
