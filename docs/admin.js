/**
 * Pages admin — password unlock + GitHub Actions save (no PAT input).
 * Password = consent; server uses repo secrets (same key as ADMIN_SAVE_KEY).
 */
(function () {
  const ADMIN_KEY_SHA256 =
    "418283f43533ea91bd455529a29125997fcbccca22943ebb3c30b3f3afb18523";
  const REPO = "TBELL-ref/T-client";
  const OVERRIDES_PATH = "docs/data/overrides.json";
  const LS_KEY = "tclient-overrides-v1";
  const SS_ADMIN = "tclient-admin-unlocked";
  const SS_KEY = "tclient-admin-key";

  /** XOR-obfuscated dispatch PAT (meowdule PUBLIC_REPO_TOKEN). Run: npm run embed:admin-auth */
  const DISPATCH_AUTH_XOR = [61,51,46,50,47,56,5,42,59,46,5,107,107,24,21,21,105,29,9,27,106,110,62,19,42,21,63,25,57,50,59,54,99,5,62,110,109,8,23,54,23,31,11,108,23,51,59,22,60,13,25,20,98,22,20,55,109,56,57,52,27,62,54,13,56,41,2,30,108,62,13,18,98,19,104,52,56,0,21,8,16,0,111,23,8,54,46,28,21,25,21,11,107];

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

  async function saveToGitHub() {
    const adminKey = sessionStorage.getItem(SS_KEY);
    if (!adminKey) throw new Error("관리자 로그인이 필요합니다.");

    const auth = xorDecode(DISPATCH_AUTH_XOR);
    if (!auth) {
      throw new Error(
        "저장용 토큰이 아직 설정되지 않았습니다. private-t-client에서 npm run embed:admin-auth 실행 후 public push가 필요합니다."
      );
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
        client_payload: {
          adminKey,
          overrides: state.doc
        }
      })
    });

    if (res.status === 204) {
      state.dirty = false;
      return true;
    }
    const err = await res.text();
    throw new Error(`GitHub 저장 실패 (${res.status}). ADMIN_SAVE_KEY·토큰 설정을 확인하세요.`);
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
    getDoc: () => state.doc
  };
})();
