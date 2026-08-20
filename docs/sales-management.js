/**
 * Sales management — relational DB layer (pipeline/pool/eval/test).
 */
(function () {
  const state = {
    map: {},
    loadedAt: 0
  };

  function parseTestPeriodList(raw) {
    let list = raw;
    if (typeof list === "string") {
      try {
        list = JSON.parse(list);
      } catch {
        return [];
      }
    }
    if (!Array.isArray(list)) return [];
    return list
      .map((p, i) => ({
        id: `${p?.id ?? ""}`.trim() || `tp_${i}`,
        label: `${p?.label ?? p?.testPeriodLabel ?? ""}`.trim(),
        startedAt: p?.startedAt ?? p?.testStartedAt ?? p?.test_started_at ?? null,
        endedAt: p?.endedAt ?? p?.testEndedAt ?? p?.test_ended_at ?? null,
        notes: `${p?.notes ?? p?.testNotes ?? p?.test_notes ?? ""}`.trim()
      }))
      .filter((p) => p.startedAt || p.endedAt || p.notes || p.label);
  }

  function resolveTestPeriods(raw = {}) {
    const list = parseTestPeriodList(raw.testPeriods ?? raw.test_periods);
    if (list.length) return list;
    if (raw.testStartedAt || raw.test_started_at || raw.testEndedAt || raw.test_ended_at || raw.testNotes || raw.test_notes || raw.testPeriodLabel || raw.test_period_label) {
      return [
        {
          id: "tp_legacy",
          label: raw.testPeriodLabel ?? raw.test_period_label ?? "",
          startedAt: raw.testStartedAt ?? raw.test_started_at ?? null,
          endedAt: raw.testEndedAt ?? raw.test_ended_at ?? null,
          notes: raw.testNotes ?? raw.test_notes ?? ""
        }
      ];
    }
    return [];
  }

  function mergeTestPeriodLists(a = [], b = []) {
    const out = [...(Array.isArray(a) ? a : [])];
    const keyOf = (p) => `${p.startedAt || ""}|${p.endedAt || ""}|${p.notes || ""}`;
    const seen = new Set(out.map(keyOf));
    for (const p of Array.isArray(b) ? b : []) {
      const key = keyOf(p);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  }

  function normalizeEntry(raw = {}) {
    const P = window.TPipeline;
    const pipe = P?.normalizePipelineRecord?.(raw) ?? {};
    return {
      isRecommended: Boolean(raw.isRecommended),
      isCandidate: Boolean(raw.isCandidate),
      isHidden: Boolean(raw.isHidden),
      pipelineStage: P?.resolvePipelineStage?.(pipe.pipelineStage ?? raw.pipelineStage) ?? "candidate",
      pipelineStatus: P?.resolvePipelineStatus?.(pipe.pipelineStatus ?? raw.pipelineStatus) ?? "pending",
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
      remark: raw.remark ?? "",
      testStartedAt: raw.testStartedAt ?? raw.test_started_at ?? null,
      testEndedAt: raw.testEndedAt ?? raw.test_ended_at ?? null,
      testPeriodLabel: raw.testPeriodLabel ?? raw.test_period_label ?? "",
      testNotes: raw.testNotes ?? raw.test_notes ?? "",
      testPeriods: resolveTestPeriods(raw),
      recommendScoreReason: raw.recommendScoreReason ?? raw.recommend_score_reason ?? "",
      pilotDifficultyReason: raw.pilotDifficultyReason ?? raw.pilot_difficulty_reason ?? "",
      evaluationNotes: raw.evaluationNotes ?? raw.evaluation_notes ?? "",
      notionPriority: Number.parseInt(`${raw.notionPriority ?? raw.notion_priority ?? 0}`, 10) || 0,
      scoreLocked: Boolean(raw.scoreLocked ?? raw.score_locked),
      scoreLockedAt: raw.scoreLockedAt ?? raw.score_locked_at ?? "",
      scoreLockedBy: raw.scoreLockedBy ?? raw.score_locked_by ?? "",
      scoreSource: raw.scoreSource ?? raw.score_source ?? "auto",
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
    if ("notionPriority" in out) {
      const n = Number.parseInt(`${out.notionPriority ?? 0}`, 10);
      out.notionPriority = Number.isFinite(n) ? Math.max(0, n) : 0;
    }
    if ("testPeriods" in out) {
      out.testPeriods = parseTestPeriodList(out.testPeriods);
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
    const pool = P?.poolClassOf?.(row) ?? "normal";
    return sanitizePatch({
      isHidden: hidden,
      isRecommended: hidden ? false : pool === "recommended",
      isCandidate: false,
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
      memo: row.salesMemo ?? row.manualNotes ?? entry.notes ?? "",
      testStartedAt: row.testStartedAt ?? "",
      testEndedAt: row.testEndedAt ?? "",
      testPeriodLabel: row.testPeriodLabel ?? "",
      testNotes: row.testNotes ?? "",
      testPeriods: resolveTestPeriods(row),
      recommendScoreReason: row.recommendScoreReason ?? "",
      pilotDifficultyReason: row.pilotDifficultyReason ?? "",
      evaluationNotes: row.evaluationNotes ?? ""
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
      isCandidate: false,
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
      memo: memos.join("\n---\n"),
      testPeriodLabel: pickNonEmpty(t.testPeriodLabel, s.testPeriodLabel),
      testNotes: pickNonEmpty(t.testNotes, s.testNotes),
      testStartedAt: pickNonEmpty(t.testStartedAt, s.testStartedAt),
      testEndedAt: pickNonEmpty(t.testEndedAt, s.testEndedAt),
      testPeriods: mergeTestPeriodLists(t.testPeriods, s.testPeriods)
    });
  }

  function entryToPatch(entry = {}) {
    return rowToSalesPatch(
      {
        userHidden: entry.hidden,
        isRecommended: entry.isRecommended,
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
        salesMemo: entry.memo ?? entry.notes,
        testStartedAt: entry.testStartedAt,
        testEndedAt: entry.testEndedAt,
        testPeriodLabel: entry.testPeriodLabel,
        testNotes: entry.testNotes,
        testPeriods: entry.testPeriods,
        recommendScoreReason: entry.recommendScoreReason,
        pilotDifficultyReason: entry.pilotDifficultyReason,
        evaluationNotes: entry.evaluationNotes
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
      try {
        await window.TCompanies?.ensureManualById?.(sourceId, sourceRow);
        await window.TCompanies?.deleteManual?.(sourceId);
      } catch (err) {
        const msg = `${err?.message ?? ""}`;
        if (!/manual company not found/i.test(msg)) throw err;
      }
    } else {
      await hide(sourceId, sourceRow);
    }
  }

  async function upsert(companyId, patch, row = null) {
    await window.TCompanies?.ensureManualById?.(companyId, row);
    const safePatch = sanitizePatch(patch);
    const result = await window.TSupabase.upsertSalesManagement(companyId, safePatch);
    setLocal(companyId, result ?? safePatch);
    return get(companyId);
  }

  function applyNotionPrioritiesLocal(orderedCompanyIds = []) {
    orderedCompanyIds.forEach((companyId, i) => {
      const priority = i + 1;
      const prev = get(companyId);
      setLocal(companyId, { ...(prev || {}), notionPriority: priority });
    });
  }

  function notionPriorityChanges(orderedCompanyIds = []) {
    const changes = [];
    orderedCompanyIds.forEach((companyId, i) => {
      const next = i + 1;
      const prev = Number.parseInt(`${get(companyId)?.notionPriority ?? 0}`, 10) || 0;
      if (prev !== next) changes.push({ companyId, priority: next });
    });
    return changes;
  }

  function isMissingBatchRpcError(err) {
    const status = Number(err?.status) || 0;
    const detail = `${err?.detail ?? err?.message ?? ""}`;
    return status === 404 || status === 400 || /PGRST202|Could not find the function|batch_set_notion_priorities/i.test(detail);
  }

  async function upsertPriorityOnly(companyId, priority, row = null) {
    if (!get(companyId)) {
      await window.TCompanies?.ensureManualById?.(companyId, row);
    }
    return upsert(companyId, { notionPriority: priority }, row);
  }

  async function batchSetNotionPrioritiesFallback(orderedCompanyIds, { onProgress } = {}) {
    const changes = notionPriorityChanges(orderedCompanyIds);
    const total = Math.max(1, changes.length);
    if (!changes.length) {
      applyNotionPrioritiesLocal(orderedCompanyIds);
      onProgress?.({ current: 1, total: 1 });
      return orderedCompanyIds.map((id) => get(id));
    }
    const concurrency = 8;
    let done = 0;
    for (let i = 0; i < changes.length; i += concurrency) {
      const chunk = changes.slice(i, i + concurrency);
      await Promise.all(
        chunk.map(async ({ companyId, priority }) => {
          const row = window.state?.rows?.find((r) => r.companyId === companyId) ?? null;
          await upsertPriorityOnly(companyId, priority, row);
          done += 1;
          onProgress?.({ current: done, total });
        })
      );
    }
    applyNotionPrioritiesLocal(orderedCompanyIds);
    return orderedCompanyIds.map((id) => get(id));
  }

  async function batchSetNotionPriorities(orderedCompanyIds, { onProgress } = {}) {
    const ids = (orderedCompanyIds ?? []).map((id) => `${id ?? ""}`.trim()).filter(Boolean);
    if (!ids.length) return [];

    if (typeof window.TSupabase?.batchSetNotionPriorities === "function") {
      try {
        const result = await window.TSupabase.batchSetNotionPriorities(ids);
        const missing = Array.isArray(result?.missing) ? result.missing.map(String) : [];
        if (missing.length) {
          const rank = new Map(ids.map((id, i) => [id, i + 1]));
          await Promise.all(
            missing.map(async (companyId) => {
              const row = window.state?.rows?.find((r) => r.companyId === companyId) ?? null;
              await upsertPriorityOnly(companyId, rank.get(companyId) || 0, row);
            })
          );
        }
        applyNotionPrioritiesLocal(ids);
        onProgress?.({ current: ids.length, total: ids.length });
        return ids.map((id) => get(id));
      } catch (err) {
        if (!isMissingBatchRpcError(err)) throw err;
      }
    }

    return batchSetNotionPrioritiesFallback(ids, { onProgress });
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
      isCandidate: false,
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
      remark: sm.remark,
      notionPriority: sm.notionPriority,
      manualNotes: sm.memo || row.manualNotes,
      testStartedAt: sm.testStartedAt,
      testEndedAt: sm.testEndedAt,
      testPeriodLabel: sm.testPeriodLabel,
      testNotes: sm.testNotes,
      testPeriods: sm.testPeriods,
      recommendScoreReason: sm.recommendScoreReason,
      pilotDifficultyReason: sm.pilotDifficultyReason,
      evaluationNotes: sm.evaluationNotes,
      scoreLocked: sm.scoreLocked,
      scoreLockedAt: sm.scoreLockedAt,
      scoreLockedBy: sm.scoreLockedBy,
      scoreSource: sm.scoreSource
    };
  }

  function removeLocal(companyId) {
    if (companyId) delete state.map[companyId];
  }

  window.TSalesManagement = {
    loadAll,
    get,
    upsert,
    batchSetNotionPriorities,
    hide,
    mergeFromCompanies,
    entryToPatch,
    applyToRow,
    normalizeEntry,
    removeLocal
  };
})();
