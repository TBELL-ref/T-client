/**
 * Sales pipeline — Stage (단계) and Status (상태) are stored separately.
 */
(function () {
  const PIPELINE_STAGES = [
    "candidate",
    "test_run",
    "result_report",
    "proposal",
    "contract_won",
    "contract_failed"
  ];

  const PIPELINE_STAGE_LABEL = {
    candidate: "후보군",
    test_run: "테스트 수행",
    result_report: "결과 보고",
    proposal: "제안",
    contract_won: "계약성공",
    contract_failed: "계약실패"
  };

  /** Higher = further in funnel (for sorting / stats). */
  const PIPELINE_STAGE_ORDER = {
    candidate: 1,
    test_run: 2,
    result_report: 3,
    proposal: 4,
    contract_won: 5,
    contract_failed: 0
  };

  const PIPELINE_STATUSES = ["active", "on_hold", "closed"];

  const PIPELINE_STATUS_LABEL = {
    active: "진행중",
    on_hold: "보류",
    closed: "종료"
  };

  const DEFAULT_PIPELINE_STAGE = "candidate";
  const DEFAULT_PIPELINE_STATUS = "active";

  function resolvePipelineStage(value) {
    const s = `${value ?? ""}`.trim();
    return PIPELINE_STAGES.includes(s) ? s : DEFAULT_PIPELINE_STAGE;
  }

  function resolvePipelineStatus(value) {
    const s = `${value ?? ""}`.trim();
    return PIPELINE_STATUSES.includes(s) ? s : DEFAULT_PIPELINE_STATUS;
  }

  function pipelineStageLabel(stage) {
    return PIPELINE_STAGE_LABEL[resolvePipelineStage(stage)] ?? stage;
  }

  function pipelineStatusLabel(status) {
    return PIPELINE_STATUS_LABEL[resolvePipelineStatus(status)] ?? status;
  }

  function stageOrder(stage) {
    return PIPELINE_STAGE_ORDER[resolvePipelineStage(stage)] ?? 0;
  }

  window.TPipeline = {
    PIPELINE_STAGES,
    PIPELINE_STAGE_LABEL,
    PIPELINE_STAGE_ORDER,
    PIPELINE_STATUSES,
    PIPELINE_STATUS_LABEL,
    DEFAULT_PIPELINE_STAGE,
    DEFAULT_PIPELINE_STATUS,
    resolvePipelineStage,
    resolvePipelineStatus,
    pipelineStageLabel,
    pipelineStatusLabel,
    stageOrder
  };
})();
