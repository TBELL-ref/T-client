/**
 * Sales pipeline — Stage / Status / Lead classification (v2).
 * Legacy DB values are normalized on read; new codes are canonical in UI.
 */
(function () {
  const PIPELINE_STAGES = [
    "candidate",
    "test_in_progress",
    "proposal",
    "meeting",
    "contract"
  ];

  const PIPELINE_STAGE_LABEL = {
    candidate: "후보",
    test_in_progress: "테스트 진행",
    proposal: "전달·제안",
    meeting: "미팅",
    contract: "계약"
  };

  const PIPELINE_STAGE_ORDER = {
    candidate: 1,
    test_in_progress: 2,
    proposal: 3,
    meeting: 4,
    contract: 5
  };

  /** Stages that imply "진행" classification (not 후보). */
  const IN_PROGRESS_STAGES = new Set([
    "test_in_progress",
    "proposal",
    "meeting",
    "contract"
  ]);

  const LEGACY_STAGE_MAP = {
    candidate_pool: "candidate",
    candidate: "candidate",
    test_run: "test_in_progress",
    result_delivery: "proposal",
    result_report: "proposal",
    delivery: "proposal",
    proposal: "proposal",
    contract_negotiation: "contract",
    contract_won: "contract",
    contract_failed: "contract"
  };

  const PIPELINE_STATUSES = ["pending", "active", "on_hold", "closed", "excluded"];

  const PIPELINE_STATUS_LABEL = {
    pending: "대기",
    active: "진행 중",
    on_hold: "보류",
    closed: "종결",
    excluded: "제외"
  };

  const LEGACY_STATUS_MAP = {
    active: "active",
    on_hold: "on_hold",
    closed: "closed"
  };

  const CLOSED_REASONS = ["contract_won", "contract_failed", "no_response", "excluded", "other"];

  const CLOSED_REASON_LABEL = {
    contract_won: "계약 성공",
    contract_failed: "계약 실패",
    no_response: "응답 없음",
    excluded: "대상 제외",
    other: "기타"
  };

  const POOL_CLASSES = ["normal", "recommended", "in_progress", "hidden"];

  const POOL_CLASS_LABEL = {
    normal: "후보",
    recommended: "추천",
    in_progress: "진행",
    hidden: "숨김"
  };

  const DEFAULT_PIPELINE_STAGE = "candidate";
  const DEFAULT_PIPELINE_STATUS = "pending";

  function resolvePipelineStage(value) {
    const s = `${value ?? ""}`.trim();
    if (PIPELINE_STAGES.includes(s)) return s;
    if (LEGACY_STAGE_MAP[s]) return LEGACY_STAGE_MAP[s];
    return DEFAULT_PIPELINE_STAGE;
  }

  function resolvePipelineStatus(value) {
    const s = `${value ?? ""}`.trim();
    if (PIPELINE_STATUSES.includes(s)) return s;
    if (LEGACY_STATUS_MAP[s]) return LEGACY_STATUS_MAP[s];
    return DEFAULT_PIPELINE_STATUS;
  }

  function resolveClosedReason(value) {
    const s = `${value ?? ""}`.trim();
    return CLOSED_REASONS.includes(s) ? s : "";
  }

  function isInProgressStage(stage) {
    return IN_PROGRESS_STAGES.has(resolvePipelineStage(stage));
  }

  /**
   * Lead pool classification: 숨김 > 진행 > 추천 > 일반
   * is_candidate is legacy-only — not used for UI classification.
   */
  function poolClassOf(row = {}) {
    if (row.userHidden || row.isHidden) return "hidden";
    if ((row.posts?.length ?? 0) === 0) return "hidden";
    const stage = resolvePipelineStage(row.pipelineStage ?? row.stage);
    if (isInProgressStage(stage)) return "in_progress";
    if (row.isRecommended) return "recommended";
    return "normal";
  }

  function isRecommendedLead(row = {}) {
    if (row.userHidden || row.isHidden) return false;
    return Boolean(row.isRecommended);
  }

  function isInProgressLead(row = {}) {
    if (row.userHidden || row.isHidden) return false;
    const stage = resolvePipelineStage(row.pipelineStage ?? row.stage);
    return isInProgressStage(stage);
  }

  function poolClassLabel(cls) {
    return POOL_CLASS_LABEL[cls] ?? cls;
  }

  function pipelineStageLabel(stage) {
    return PIPELINE_STAGE_LABEL[resolvePipelineStage(stage)] ?? stage;
  }

  function pipelineStatusLabel(status) {
    return PIPELINE_STATUS_LABEL[resolvePipelineStatus(status)] ?? status;
  }

  function closedReasonLabel(reason) {
    const r = resolveClosedReason(reason);
    return r ? CLOSED_REASON_LABEL[r] ?? r : "";
  }

  function stageOrder(stage) {
    return PIPELINE_STAGE_ORDER[resolvePipelineStage(stage)] ?? 0;
  }

  /** Normalize legacy contract_* stages into stage + status + closed_reason. */
  function normalizePipelineRecord(record = {}) {
    let stage = resolvePipelineStage(record.pipelineStage ?? record.stage);
    let status = resolvePipelineStatus(record.pipelineStatus ?? record.status);
    let closedReason = resolveClosedReason(record.closedReason ?? record.closed_reason);

    const rawStage = `${record.pipelineStage ?? record.stage ?? ""}`.trim();
    if (rawStage === "contract_won") {
      stage = "contract";
      status = "closed";
      closedReason = closedReason || "contract_won";
    } else if (rawStage === "contract_failed") {
      stage = "contract";
      status = "closed";
      closedReason = closedReason || "contract_failed";
    }

    if (status === "excluded" || closedReason === "excluded") {
      status = "excluded";
    }

    return { pipelineStage: stage, pipelineStatus: status, closedReason };
  }

  /** 추천 탭: is_recommended + 후보 단계(🔍 등) */
  function rowMatchesRecommendedTab(row) {
    return isRecommendedLead(row) && !isInProgressLead(row);
  }

  /** 진행 탭: is_recommended + 테스트/전달·제안/미팅/계약 단계 */
  function rowMatchesInProgressTab(row) {
    return isRecommendedLead(row) && isInProgressLead(row);
  }

  /** Pipeline 후보 단계 + 아직 추천/진행/숨김 아님 (액션 KPI·버킷용). */
  function rowMatchesCandidatePool(row) {
    return poolClassOf(row) === "normal";
  }

  function rowMatchesExcludedTab(row) {
    if (!row) return false;
    if ((row.posts?.length ?? 0) === 0) return true;
    if (row.userHidden || row.isHidden) return true;
    if (row.excluded) return true;
    return false;
  }

  window.TPipeline = {
    PIPELINE_STAGES,
    PIPELINE_STAGE_LABEL,
    PIPELINE_STAGE_ORDER,
    IN_PROGRESS_STAGES,
    LEGACY_STAGE_MAP,
    PIPELINE_STATUSES,
    PIPELINE_STATUS_LABEL,
    LEGACY_STATUS_MAP,
    CLOSED_REASONS,
    CLOSED_REASON_LABEL,
    POOL_CLASSES,
    POOL_CLASS_LABEL,
    DEFAULT_PIPELINE_STAGE,
    DEFAULT_PIPELINE_STATUS,
    resolvePipelineStage,
    resolvePipelineStatus,
    resolveClosedReason,
    isInProgressStage,
    poolClassOf,
    isRecommendedLead,
    isInProgressLead,
    poolClassLabel,
    pipelineStageLabel,
    pipelineStatusLabel,
    closedReasonLabel,
    stageOrder,
    normalizePipelineRecord,
    rowMatchesRecommendedTab,
    rowMatchesInProgressTab,
    rowMatchesCandidatePool,
    rowMatchesExcludedTab
  };
})();
