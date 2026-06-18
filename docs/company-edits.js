/**
 * Company edits — relational DB layer (replaces overrides JSON).
 */
(function () {
  const state = {
    map: {},
    loadedAt: 0,
    dirty: new Set(),
    persistTimer: null
  };

  const PERSIST_DELAY_MS = 900;

  function normalizeEntry(raw = {}) {
    return {
      companyNameKo: raw.companyNameKo ?? "",
      domain: raw.domain ?? "",
      domainVerified: Boolean(raw.domainVerified),
      companyTier: raw.companyTier ?? "",
      leadGrade: raw.leadGrade ?? "",
      priorityScore: raw.priorityScore ?? "",
      scoreReason: raw.scoreReason ?? "",
      contact: {
        name: raw.contact?.name ?? "",
        email: raw.contact?.email ?? raw.email ?? "",
        phone: raw.contact?.phone ?? ""
      },
      notes: raw.notes ?? "",
      excludeReason: raw.excludeReason ?? "",
      favorite: Boolean(raw.favorite),
      mergedAway: Boolean(raw.mergedAway),
      deleted: Boolean(raw.deleted),
      scoreParts: { ...(raw.scoreParts ?? {}) },
      profile: { ...(raw.profile ?? {}) },
      extraPosts: Array.isArray(raw.extraPosts) ? raw.extraPosts.map((p) => ({ ...p })) : [],
      hiddenPosts: [...(raw.hiddenPosts ?? [])],
      deletedPosts: [...(raw.deletedPosts ?? [])],
      updatedAt: raw.updatedAt ?? ""
    };
  }

  function get(companyId) {
    return state.map[companyId] ? normalizeEntry(state.map[companyId]) : null;
  }

  function getEntryShape(companyId) {
    return get(companyId) ?? {};
  }

  function setLocal(companyId, patch) {
    const prev = get(companyId) ?? normalizeEntry({});
    const next = normalizeEntry({
      ...prev,
      ...patch,
      contact: { ...prev.contact, ...(patch.contact ?? {}) },
      profile: { ...prev.profile, ...(patch.profile ?? {}) },
      scoreParts: { ...prev.scoreParts, ...(patch.scoreParts ?? {}) },
      extraPosts: patch.extraPosts ?? prev.extraPosts,
      hiddenPosts: patch.hiddenPosts ?? prev.hiddenPosts,
      deletedPosts: patch.deletedPosts ?? prev.deletedPosts,
      updatedAt: new Date().toISOString()
    });
    state.map[companyId] = next;
    state.dirty.add(companyId);
    state.loadedAt = Date.now();
    schedulePersist();
    return next;
  }

  function mergeEntry(a, b) {
    return normalizeEntry({
      ...a,
      ...b,
      contact: { ...(a.contact ?? {}), ...(b.contact ?? {}) },
      profile: { ...(a.profile ?? {}), ...(b.profile ?? {}) },
      scoreParts: { ...(a.scoreParts ?? {}), ...(b.scoreParts ?? {}) },
      extraPosts: [...(a.extraPosts ?? []), ...(b.extraPosts ?? [])].filter(
        (p, i, arr) => p?.url && arr.findIndex((x) => x.url === p.url) === i
      ),
      hiddenPosts: Array.from(new Set([...(a.hiddenPosts ?? []), ...(b.hiddenPosts ?? [])])),
      deletedPosts: Array.from(new Set([...(a.deletedPosts ?? []), ...(b.deletedPosts ?? [])]))
    });
  }

  async function loadAll(force = false) {
    if (!force && state.loadedAt && Date.now() - state.loadedAt < 3000) return state.map;
    try {
      const doc = await window.TSupabase.getCompanyEditsAll();
      const next = {};
      for (const [cid, entry] of Object.entries(doc ?? {})) {
        next[cid] = normalizeEntry(entry);
      }
      state.map = next;
      state.loadedAt = Date.now();
    } catch (err) {
      console.warn("[company-edits] load failed", err);
    }
    return state.map;
  }

  function schedulePersist() {
    if (!window.TClientAdmin?.isUnlocked?.()) return;
    clearTimeout(state.persistTimer);
    state.persistTimer = setTimeout(() => flushDirty(), PERSIST_DELAY_MS);
  }

  async function flushDirty() {
    if (!window.TClientAdmin?.isUnlocked?.() || !state.dirty.size) return true;
    const ids = [...state.dirty];
    state.dirty.clear();
    try {
      for (const companyId of ids) {
        const entry = state.map[companyId];
        if (!entry) continue;
        await window.TSupabase.upsertCompanyEdit(companyId, entryToPatch(entry));
      }
      return true;
    } catch (err) {
      ids.forEach((id) => state.dirty.add(id));
      throw err;
    }
  }

  function entryToPatch(entry) {
    return {
      companyNameKo: entry.companyNameKo,
      domain: entry.domain,
      domainVerified: entry.domainVerified,
      companyTier: entry.companyTier,
      leadGrade: entry.leadGrade,
      priorityScore: entry.priorityScore,
      scoreReason: entry.scoreReason,
      contact: entry.contact,
      notes: entry.notes,
      excludeReason: entry.excludeReason,
      favorite: entry.favorite,
      mergedAway: entry.mergedAway,
      profile: entry.profile,
      scoreParts: entry.scoreParts,
      extraPosts: entry.extraPosts,
      hiddenPosts: entry.hiddenPosts,
      deletedPosts: entry.deletedPosts
    };
  }

  async function upsert(companyId, patch) {
    setLocal(companyId, patch);
    if (window.TClientAdmin?.isUnlocked?.()) {
      await window.TSupabase.upsertCompanyEdit(companyId, entryToPatch(state.map[companyId]));
      state.dirty.delete(companyId);
    }
    return state.map[companyId];
  }

  async function remove(companyId) {
    delete state.map[companyId];
    state.dirty.delete(companyId);
    if (window.TClientAdmin?.isUnlocked?.()) {
      await window.TSupabase.deleteCompanyEdit(companyId);
    }
  }

  async function migrateFromOverridesDoc() {
    return window.TSupabase.migrateOverridesToRelational();
  }

  function isDirty() {
    return state.dirty.size > 0;
  }

  window.TCompanyEdits = {
    loadAll,
    get,
    getEntryShape,
    setLocal,
    mergeEntry,
    upsert,
    remove,
    flushDirty,
    migrateFromOverridesDoc,
    isDirty,
    normalizeEntry
  };
})();
