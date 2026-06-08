/**
 * Sales pipeline — Stage / Status / Closed Reason (stored separately in sales_management).
 */
(function () {
  const PIPELINE_STAGES = [
    "candidate_pool",
    "test_run",
    "result_delivery",
    "proposal",
    "contract_negotiation"
  ];

  const PIPELINE_STAGE_LABEL = {
    candidate_pool: "후보군",
    test_run: "테스트 수행",
    result_delivery: "결과 전달",
    proposal: "제안",
    contract_negotiation: "계약 협의"
  };

  const PIPELINE_STAGE_ORDER = {
    candidate_pool: 1,
    test_run: 2,
    result_delivery: 3,
    proposal: 4,
    contract_negotiation: 5
  };

  const LEGACY_STAGE_MAP = {
    candidate: "candidate_pool",
    test_run: "test_run",
    result_report: "result_delivery",
    proposal: "proposal",
    contract_won: "contract_negotiation",
    contract_failed: "contract_negotiation"
  };

  const PIPELINE_STATUSES = ["active", "on_hold", "closed"];

  const PIPELINE_STATUS_LABEL = {
    active: "진행중",
    on_hold: "보류",
    closed: "종결"
  };

  const CLOSED_REASONS = ["contract_won", "contract_failed", "no_response", "excluded", "other"];

  const CLOSED_REASON_LABEL = {
    contract_won: "계약 성공",
    contract_failed: "계약 실패",
    no_response: "응답 없음",
    excluded: "대상 제외",
    other: "기타"
  };

  const DEFAULT_PIPELINE_STAGE = "candidate_pool";
  const DEFAULT_PIPELINE_STATUS = "active";

  function resolvePipelineStage(value) {
    const s = `${value ?? ""}`.trim();
    if (PIPELINE_STAGES.includes(s)) return s;
    if (LEGACY_STAGE_MAP[s]) return LEGACY_STAGE_MAP[s];
    return DEFAULT_PIPELINE_STAGE;
  }

  function resolvePipelineStatus(value) {
    const s = `${value ?? ""}`.trim();
    return PIPELINE_STATUSES.includes(s) ? s : DEFAULT_PIPELINE_STATUS;
  }

  function resolveClosedReason(value) {
    const s = `${value ?? ""}`.trim();
    return CLOSED_REASONS.includes(s) ? s : "";
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
      stage = "contract_negotiation";
      status = "closed";
      closedReason = closedReason || "contract_won";
    } else if (rawStage === "contract_failed") {
      stage = "contract_negotiation";
      status = "closed";
      closedReason = closedReason || "contract_failed";
    }

    return { pipelineStage: stage, pipelineStatus: status, closedReason };
  }

  window.TPipeline = {
    PIPELINE_STAGES,
    PIPELINE_STAGE_LABEL,
    PIPELINE_STAGE_ORDER,
    LEGACY_STAGE_MAP,
    PIPELINE_STATUSES,
    PIPELINE_STATUS_LABEL,
    CLOSED_REASONS,
    CLOSED_REASON_LABEL,
    DEFAULT_PIPELINE_STAGE,
    DEFAULT_PIPELINE_STATUS,
    resolvePipelineStage,
    resolvePipelineStatus,
    resolveClosedReason,
    pipelineStageLabel,
    pipelineStatusLabel,
    closedReasonLabel,
    stageOrder,
    normalizePipelineRecord
  };
})();
