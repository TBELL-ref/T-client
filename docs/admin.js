/**
 * Pages admin: favorites, overrides, GitHub sync.
 * Password gate only (internal use). Optional GitHub PAT for repo save.
 */
(function () {
  const ADMIN_PASSWORD = "tbell0518!";
  const OVERRIDES_PATH = "docs/data/overrides.json";
  const REPO = "TBELL-ref/T-client";
  const BRANCH = "main";
  const LS_KEY = "tclient-overrides-v1";
  const SS_ADMIN = "tclient-admin-unlocked";
  const SS_GH = "tclient-github-pat";

  const state = {
    unlocked: sessionStorage.getItem(SS_ADMIN) === "1",
    doc: null,
    dirty: false
  };

  function emptyDoc() {
    return { version: 1, updatedAt: null, favorites: [], companies: {} };
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return emptyDoc();
  }

  function saveLocal(doc) {
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
    out.companies = { ...(b?.companies ?? {}), ...(a?.companies ?? {}) };
    for (const id of out.favorites) {
      out.companies[id] = { ...(out.companies[id] ?? {}), favorite: true };
    }
    return out;
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
    const remote = await fetchRemoteOverrides();
    const local = loadLocal();
    state.doc = mergeDocs(local, remote);
    saveLocal(state.doc);
    return state.doc;
  }

  function getEntry(companyId) {
    if (!state.doc) return {};
    return state.doc.companies[companyId] ?? {};
  }

  function setEntry(companyId, patch) {
    const prev = getEntry(companyId);
    state.doc.companies[companyId] = {
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    if (patch.favorite === true && !state.doc.favorites.includes(companyId)) {
      state.doc.favorites.push(companyId);
    }
    if (patch.favorite === false) {
      state.doc.favorites = state.doc.favorites.filter((id) => id !== companyId);
    }
    state.dirty = true;
    saveLocal(state.doc);
  }

  function applyToRow(row) {
    const entry = getEntry(row.companyId);
    const fav = state.doc.favorites.includes(row.companyId) || entry.favorite;
    const next = { ...row, userFavorite: fav, userHidden: Boolean(entry.hidden) };
    if (entry.companyNameKo) next.companyNameKo = entry.companyNameKo;
    if (entry.leadGrade) next.leadGrade = entry.leadGrade;
    if (entry.email !== undefined && entry.email !== "") next.email = entry.email;
    if (entry.notes) next.manualNotes = entry.notes;
    if (entry.excludeReason) {
      next.excludeReason = entry.excludeReason;
      next.excluded = true;
    }
    return next;
  }

  function getPat() {
    return sessionStorage.getItem(SS_GH) || "";
  }

  function setPat(token) {
    if (token) sessionStorage.setItem(SS_GH, token.trim());
    else sessionStorage.removeItem(SS_GH);
  }

  async function saveToGitHub() {
    const pat = getPat();
    if (!pat) throw new Error("GitHub 토큰이 없습니다. 관리자 패널에서 PAT를 입력하세요.");

    const api = `https://api.github.com/repos/${REPO}/contents/${OVERRIDES_PATH}`;
    const body = JSON.stringify(state.doc, null, 2);
    const content = btoa(unescape(encodeURIComponent(body)));

    let sha;
    const getRes = await fetch(`${api}?ref=${BRANCH}`, {
      headers: { Authorization: `Bearer ${pat}`, Accept: "application/vnd.github+json" }
    });
    if (getRes.ok) {
      const meta = await getRes.json();
      sha = meta.sha;
    }

    const putRes = await fetch(api, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: "chore: update user overrides from QA Lead Console",
        content,
        sha,
        branch: BRANCH
      })
    });

    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`GitHub 저장 실패 (${putRes.status}): ${err.slice(0, 200)}`);
    }
    state.dirty = false;
    return true;
  }

  function unlock(password) {
    if (password !== ADMIN_PASSWORD) return false;
    sessionStorage.setItem(SS_ADMIN, "1");
    state.unlocked = true;
    return true;
  }

  function lock() {
    sessionStorage.removeItem(SS_ADMIN);
    state.unlocked = false;
  }

  function isUnlocked() {
    return state.unlocked;
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
          const parsed = JSON.parse(reader.result);
          state.doc = mergeDocs(parsed, state.doc);
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
    getPat,
    setPat,
    exportJson,
    importJson,
    isDirty: () => state.dirty,
    getDoc: () => state.doc
  };
})();
