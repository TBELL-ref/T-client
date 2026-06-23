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

  function normalizeContactEntry(raw = {}) {
    return {
      name: `${raw.name ?? ""}`.trim(),
      email: `${raw.email ?? ""}`.trim(),
      phone: `${raw.phone ?? ""}`.trim()
    };
  }

  function normalizeContactPatch(contact = {}, fallbackEmail = "") {
    const contacts = Array.isArray(contact.contacts)
      ? contact.contacts.map(normalizeContactEntry).filter((c) => c.name || c.email || c.phone)
      : [];
    const base = normalizeContactEntry({
      name: contact.name,
      email: contact.email ?? fallbackEmail,
      phone: contact.phone
    });
    const list = contacts.length ? contacts : base.name || base.email || base.phone ? [base] : [];
    const primary = list[0] ?? { name: "", email: "", phone: "" };
    return { ...primary, contacts: list };
  }

  function normalizeEntry(raw = {}) {
    return {
      companyNameKo: raw.companyNameKo ?? "",
      domain: raw.domain ?? "",
      domainVerified: Boolean(raw.domainVerified),
      companyTier: raw.companyTier ?? "",
      leadGrade: raw.leadGrade ?? "",
      priorityScore: raw.priorityScore ?? "",
      scoreReason: raw.scoreReason ?? "",
      contact: normalizeContactPatch(raw.contact ?? {}, raw.email ?? ""),
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
    const nextContact = patch.contact
      ? normalizeContactPatch({ ...prev.contact, ...patch.contact })
      : prev.contact;
    const next = normalizeEntry({
      ...prev,
      ...patch,
      contact: nextContact,
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
    const mergedContact = { ...(a.contact ?? {}), ...(b.contact ?? {}) };
    const contacts = [
      ...(Array.isArray(a.contact?.contacts) ? a.contact.contacts : []),
      ...(Array.isArray(b.contact?.contacts) ? b.contact.contacts : [])
    ].filter((c, i, arr) => {
      const key = `${c.name}|${c.email}|${c.phone}`;
      return key !== "||" && arr.findIndex((x) => `${x.name}|${x.email}|${x.phone}` === key) === i;
    });
    if (contacts.length) mergedContact.contacts = contacts;
    return normalizeEntry({
      ...a,
      ...b,
      contact: mergedContact,
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
        if (window.TCompanies?.isManualCompanyId?.(companyId)) {
          const rowHint =
            window.state?.rows?.find((r) => r.companyId === companyId) ??
            window.TClientAdmin?.getCustomCompanies?.().find((r) => r.companyId === companyId);
          await window.TCompanies.ensureManualById(companyId, rowHint);
        }
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
    clearTimeout(state.persistTimer);
    state.persistTimer = null;
    delete state.map[companyId];
    state.dirty.delete(companyId);
    if (window.TClientAdmin?.isUnlocked?.()) {
      try {
        await window.TSupabase.deleteCompanyEdit(companyId);
      } catch (err) {
        if (!/not found/i.test(`${err?.message ?? ""}`)) throw err;
      }
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
