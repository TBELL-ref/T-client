/**
 * Per-account company view / "신규" tab state.
 */
(function () {
  const state = { map: {}, loadedAt: 0 };

  function normalizeEntry(raw = {}) {
    return {
      viewedAt: raw.viewedAt ?? raw.viewed_at ?? null,
      isNewOverride: Boolean(raw.isNewOverride ?? raw.is_new_override),
      newResetAt: raw.newResetAt ?? raw.new_reset_at ?? null,
      updatedAt: raw.updatedAt ?? raw.updated_at ?? null
    };
  }

  function get(companyId) {
    const e = state.map[companyId];
    return e ? { ...e } : null;
  }

  function setLocal(companyId, entry) {
    state.map[companyId] = normalizeEntry(entry);
    state.loadedAt = Date.now();
  }

  async function loadAll(force = false) {
    if (!window.TAuth?.getAccessToken) return state.map;
    const token = await window.TAuth.getAccessToken().catch(() => null);
    if (!token) {
      state.map = {};
      return state.map;
    }
    if (!force && state.loadedAt && Date.now() - state.loadedAt < 5000) return state.map;
    try {
      const doc = await window.TSupabase.getCompanyUserState();
      const next = {};
      for (const [cid, entry] of Object.entries(doc ?? {})) {
        next[cid] = normalizeEntry(entry);
      }
      state.map = next;
      state.loadedAt = Date.now();
    } catch (err) {
      console.warn("[user-state] load failed", err);
    }
    return state.map;
  }

  /** Account-based "신규" for logged-in users. */
  function isAccountNew(companyId) {
    const e = get(companyId);
    if (!e) return true;
    if (e.isNewOverride) return true;
    return !e.viewedAt;
  }

  async function markViewed(companyId) {
    const result = await window.TSupabase.markCompanyViewed(companyId);
    setLocal(companyId, result ?? { viewedAt: new Date().toISOString(), isNewOverride: false });
    return get(companyId);
  }

  async function setNewState(companyId, isNew) {
    const result = await window.TSupabase.setCompanyNewState(companyId, isNew);
    setLocal(companyId, result ?? { isNewOverride: isNew });
    return get(companyId);
  }

  window.TCompanyUserState = {
    loadAll,
    get,
    isAccountNew,
    markViewed,
    setNewState
  };
})();
