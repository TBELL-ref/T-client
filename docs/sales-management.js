/**
 * Sales management — relational DB layer (replaces overrides JSON for pipeline/pool/eval).
 */
(function () {
  const state = {
    map: {},
    loadedAt: 0
  };

  function normalizeEntry(raw = {}) {
    const P = window.TPipeline;
    const pipe = P?.normalizePipelineRecord?.(raw) ?? {};
    return {
      isRecommended: Boolean(raw.isRecommended),
      isCandidate: Boolean(raw.isCandidate),
      isHidden: Boolean(raw.isHidden),
      pipelineStage: P?.resolvePipelineStage?.(pipe.pipelineStage ?? raw.pipelineStage) ?? "candidate_pool",
      pipelineStatus: P?.resolvePipelineStatus?.(pipe.pipelineStatus ?? raw.pipelineStatus) ?? "active",
      closedReason: P?.resolveClosedReason?.(pipe.closedReason ?? raw.closedReason) ?? "",
      recommendScore: Number.parseInt(`${raw.recommendScore ?? 0}`, 10) || 0,
      pilotDifficulty: Number.parseInt(`${raw.pilotDifficulty ?? 0}`, 10) || 0,
      candidateRank: Number.parseInt(`${raw.candidateRank ?? 0}`, 10) || 0,
      candidateIndustry: raw.candidateIndustry ?? "",
      candidateRepeatPosts: raw.candidateRepeatPosts ?? "",
      candidatePros: raw.candidatePros ?? "",
      candidateCons: raw.candidateCons ?? "",
      recommendedSince: raw.recommendedSince ?? "",
      candidateSince: raw.candidateSince ?? "",
      pipelineStageAt: raw.pipelineStageAt ?? "",
      memo: raw.memo ?? "",
      updatedAt: raw.updatedAt ?? ""
    };
  }

  function get(companyId) {
    return state.map[companyId] ? { ...state.map[companyId] } : null;
  }

  function setLocal(companyId, entry) {
    state.map[companyId] = normalizeEntry(entry);
    state.loadedAt = Date.now();
  }

  async function loadAll(force = false) {
    if (!force && state.loadedAt && Date.now() - state.loadedAt < 3000) return state.map;
    try {
      const doc = await window.TSupabase.getSalesManagementAll();
      const next = {};
      for (const [cid, entry] of Object.entries(doc ?? {})) {
        next[cid] = normalizeEntry(entry);
      }
      state.map = next;
      state.loadedAt = Date.now();
    } catch (err) {
      console.warn("[sales] load failed", err);
    }
    return state.map;
  }

  function sanitizePatch(patch = {}) {
    const out = { ...patch };
    if ("recommendScore" in out) {
      out.recommendScore = Number.parseInt(`${out.recommendScore ?? 0}`, 10) || 0;
    }
    if ("pilotDifficulty" in out) {
      out.pilotDifficulty = Number.parseInt(`${out.pilotDifficulty ?? 0}`, 10) || 0;
    }
    if ("candidateRank" in out) {
      const raw = `${out.candidateRank ?? ""}`.trim();
      out.candidateRank = raw === "" ? 0 : Number.parseInt(raw, 10) || 0;
    }
    return out;
  }

  function pickNonEmpty(a, b) {
    return a === undefined || a === null || a === "" ? b : a;
  }

  function rowToSalesPatch(row, entry = {}) {
    if (!row) return {};
    const P = window.TPipeline;
    const hidden = Boolean(row.userHidden);
    return sanitizePatch({
      isHidden: hidden,
      isRecommended: hidden ? false : Boolean(row.isRecommended),
      isCandidate: hidden ? false : Boolean(row.isCandidate),
      pipelineStage: P?.resolvePipelineStage?.(row.pipelineStage) ?? row.pipelineStage,
      pipelineStatus: P?.resolvePipelineStatus?.(row.pipelineStatus) ?? row.pipelineStatus,
      closedReason: row.closedReason ?? "",
      recommendScore: row.recommendScore,
      pilotDifficulty: row.pilotDifficulty,
      candidateRank: row.candidateRank,
      candidateIndustry: row.candidateIndustry ?? "",
      candidateRepeatPosts: row.candidateRepeatPosts ?? "",
      candidatePros: row.candidatePros ?? "",
      candidateCons: row.candidateCons ?? "",
      recommendedSince: row.recommendedSince ?? "",
      candidateSince: row.candidateSince ?? "",
      pipelineStageAt: row.pipelineStageAt ?? "",
      memo: row.salesMemo ?? row.manualNotes ?? entry.notes ?? ""
    });
  }

  function mergeSalesPatchForMerge(targetRow, sourceRow, targetEntry = {}) {
    const t = rowToSalesPatch(targetRow, targetEntry);
    if (!sourceRow) return t;
    const s = rowToSalesPatch(sourceRow);
    const pickNum = (a, b) => {
      const av = Number.parseInt(`${a ?? 0}`, 10) || 0;
      const bv = Number.parseInt(`${b ?? 0}`, 10) || 0;
      return av > 0 || bv > 0 ? Math.max(av, bv) : pickNonEmpty(a, b);
    };
    const memos = [t.memo, s.memo].map((m) => `${m ?? ""}`.trim()).filter(Boolean);
    return sanitizePatch({
      isHidden: Boolean(t.isHidden),
      isRecommended: t.isHidden ? false : Boolean(t.isRecommended) || Boolean(s.isRecommended),
      isCandidate: t.isHidden ? false : Boolean(t.isCandidate) || Boolean(s.isCandidate),
      pipelineStage: pickNonEmpty(t.pipelineStage, s.pipelineStage),
      pipelineStatus: pickNonEmpty(t.pipelineStatus, s.pipelineStatus),
      closedReason: pickNonEmpty(t.closedReason, s.closedReason),
      recommendScore: pickNum(t.recommendScore, s.recommendScore),
      pilotDifficulty: pickNum(t.pilotDifficulty, s.pilotDifficulty),
      candidateRank: pickNum(t.candidateRank, s.candidateRank),
      candidateIndustry: pickNonEmpty(t.candidateIndustry, s.candidateIndustry),
      candidateRepeatPosts: pickNonEmpty(t.candidateRepeatPosts, s.candidateRepeatPosts),
      candidatePros: pickNonEmpty(t.candidatePros, s.candidatePros),
      candidateCons: pickNonEmpty(t.candidateCons, s.candidateCons),
      recommendedSince: pickNonEmpty(t.recommendedSince, s.recommendedSince),
      candidateSince: pickNonEmpty(t.candidateSince, s.candidateSince),
      pipelineStageAt: pickNonEmpty(t.pipelineStageAt, s.pipelineStageAt),
      memo: memos.join("\n---\n")
    });
  }

  function entryToPatch(entry = {}) {
    return rowToSalesPatch(
      {
        userHidden: entry.hidden,
        isRecommended: entry.isRecommended,
        isCandidate: entry.isCandidate,
        pipelineStage: entry.pipelineStage,
        pipelineStatus: entry.pipelineStatus,
        closedReason: entry.closedReason,
        recommendScore: entry.recommendScore,
        pilotDifficulty: entry.pilotDifficulty,
        candidateRank: entry.candidateRank,
        candidateIndustry: entry.candidateIndustry,
        candidateRepeatPosts: entry.candidateRepeatPosts,
        candidatePros: entry.candidatePros,
        candidateCons: entry.candidateCons,
        recommendedSince: entry.recommendedSince,
        candidateSince: entry.candidateSince,
        pipelineStageAt: entry.pipelineStageAt,
        salesMemo: entry.memo ?? entry.notes
      },
      entry
    );
  }

  async function hide(companyId, row = null) {
    if (window.TCompanies?.isManualCompanyId?.(companyId)) return null;
    return upsert(
      companyId,
      {
        isHidden: true,
        isRecommended: false,
        isCandidate: false,
        pipelineStatus: "closed"
      },
      row
    );
  }

  async function mergeFromCompanies(sourceId, targetId, targetEntry, targetRow = null, sourceRow = null) {
    await window.TCompanies?.ensureManualById?.(targetId, targetRow);
    const patch = mergeSalesPatchForMerge(targetRow, sourceRow, targetEntry);
    if (Object.keys(patch).length) await upsert(targetId, patch, targetRow);
    if (window.TCompanies?.isManualCompanyId?.(sourceId)) {
      await window.TCompanies?.deleteManual?.(sourceId);
    } else {
      await hide(sourceId);
    }
  }

  async function upsert(companyId, patch, row = null) {
    await window.TCompanies?.ensureManualById?.(companyId, row);
    const safePatch = sanitizePatch(patch);
    const result = await window.TSupabase.upsertSalesManagement(companyId, safePatch);
    setLocal(companyId, result ?? safePatch);
    return get(companyId);
  }

  function applyToRow(row) {
    const sm = get(row.companyId);
    if (!sm) {
      const P = window.TPipeline;
      const pipe = P?.normalizePipelineRecord?.(row) ?? {};
      return {
        ...row,
        pipelineStage: P?.resolvePipelineStage?.(pipe.pipelineStage ?? row.pipelineStage) ?? row.pipelineStage,
        pipelineStatus: P?.resolvePipelineStatus?.(pipe.pipelineStatus ?? row.pipelineStatus) ?? row.pipelineStatus,
        closedReason: P?.resolveClosedReason?.(pipe.closedReason ?? row.closedReason) ?? row.closedReason ?? ""
      };
    }
    return {
      ...row,
      userHidden: sm.isHidden,
      isRecommended: sm.isHidden ? false : sm.isRecommended,
      isCandidate: sm.isHidden ? false : sm.isCandidate,
      pipelineStage: sm.pipelineStage,
      pipelineStatus: sm.pipelineStatus,
      closedReason: sm.closedReason,
      recommendScore: sm.recommendScore,
      pilotDifficulty: sm.pilotDifficulty,
      candidateRank: sm.candidateRank,
      candidateIndustry: sm.candidateIndustry,
      candidateRepeatPosts: sm.candidateRepeatPosts,
      candidatePros: sm.candidatePros,
      candidateCons: sm.candidateCons,
      recommendedSince: sm.recommendedSince,
      candidateSince: sm.candidateSince,
      pipelineStageAt: sm.pipelineStageAt,
      salesMemo: sm.memo,
      manualNotes: sm.memo || row.manualNotes
    };
  }

  window.TSalesManagement = {
    loadAll,
    get,
    upsert,
    hide,
    mergeFromCompanies,
    entryToPatch,
    applyToRow,
    normalizeEntry
  };
})();
