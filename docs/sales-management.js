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

  function entryToPatch(entry = {}) {
    if (!entry || typeof entry !== "object") return {};
    const P = window.TPipeline;
    const patch = {};

    if (entry.hidden === true) {
      patch.isHidden = true;
      patch.isRecommended = false;
      patch.isCandidate = false;
    } else if (entry.hidden === false) {
      patch.isHidden = false;
    }
    if (entry.isRecommended !== undefined) patch.isRecommended = Boolean(entry.isRecommended);
    if (entry.isCandidate !== undefined) patch.isCandidate = Boolean(entry.isCandidate);
    if (entry.pipelineStage) {
      patch.pipelineStage = P?.resolvePipelineStage?.(entry.pipelineStage) ?? entry.pipelineStage;
    }
    if (entry.pipelineStatus) {
      patch.pipelineStatus = P?.resolvePipelineStatus?.(entry.pipelineStatus) ?? entry.pipelineStatus;
    }
    if (entry.closedReason !== undefined) patch.closedReason = entry.closedReason ?? "";
    if (entry.recommendScore !== undefined && entry.recommendScore !== "") patch.recommendScore = entry.recommendScore;
    if (entry.pilotDifficulty !== undefined && entry.pilotDifficulty !== "") patch.pilotDifficulty = entry.pilotDifficulty;
    if (entry.candidateRank !== undefined && entry.candidateRank !== "") patch.candidateRank = entry.candidateRank;
    if (entry.candidateIndustry !== undefined) patch.candidateIndustry = entry.candidateIndustry ?? "";
    if (entry.candidateRepeatPosts !== undefined) patch.candidateRepeatPosts = entry.candidateRepeatPosts ?? "";
    if (entry.candidatePros !== undefined) patch.candidatePros = entry.candidatePros ?? "";
    if (entry.candidateCons !== undefined) patch.candidateCons = entry.candidateCons ?? "";
    if (entry.recommendedSince !== undefined) patch.recommendedSince = entry.recommendedSince ?? "";
    if (entry.candidateSince !== undefined) patch.candidateSince = entry.candidateSince ?? "";
    if (entry.pipelineStageAt !== undefined) patch.pipelineStageAt = entry.pipelineStageAt ?? "";
    const memo = entry.memo ?? entry.notes;
    if (memo !== undefined) patch.memo = memo ?? "";

    return sanitizePatch(patch);
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

  async function mergeFromCompanies(sourceId, targetId, targetEntry, targetRow = null) {
    await window.TCompanies?.ensureManualById?.(targetId, targetRow);
    const patch = entryToPatch(targetEntry);
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
