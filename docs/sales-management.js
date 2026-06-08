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

  async function upsert(companyId, patch) {
    const result = await window.TSupabase.upsertSalesManagement(companyId, patch);
    setLocal(companyId, result ?? patch);
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
      isRecommended: sm.isRecommended,
      isCandidate: sm.isCandidate,
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
    applyToRow,
    normalizeEntry
  };
})();
