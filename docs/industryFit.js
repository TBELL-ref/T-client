/**
 * Industry fit tags for wait-tab filter / list (mirrors private-t-client targetFit).
 */
(function (global) {
  const APP_WEB =
    /앱\b|애플리케이션|application|saas|소프트웨어|software|플랫폼|platform|웹\s*서비스|웹서비스|모바일\s*앱|marketplace|커머스|이커머스|e-?commerce|핀테크|fintech|헬스케어\s*앱|콘텐츠\s*플랫폼|구독\s*서비스|api\b|클라우드|cloud/i;

  const MANUFACTURING =
    /제조|조립|공장|생산\s*라인|반도체|기계\s*가공|금형|철강|화학\s*소재|석유화학|하드웨어\s*장비|장비\s*제조|부품\s*제조|자동차\s*부품|조선|건설\s*시공|사출|프레스|가공\s*업|pcb\s*제조|웨이퍼|파운드리|설비\s*제작/i;

  const RESEARCH =
    /연구\s*소\b|연구원|연구소|r&d\b|임상\s*시험|바이오\s*연구|기초\s*연구|학술|대학\s*산학|국책\s*과제/i;

  function textBlob(row) {
    const p = row?.profile ?? {};
    return [
      row?.industry,
      row?.bizItem,
      row?.bizType,
      row?.industrySummary,
      row?.candidateIndustry,
      p.bizItem,
      p.bizType,
      p.industrySummary,
      row?.companyNameKo,
      row?.companyName,
      ...(row?.posts ?? []).flatMap((post) => [post.title, post.source])
    ]
      .map((v) => `${v ?? ""}`)
      .join(" ");
  }

  function isManufacturingLike(row) {
    const text = textBlob(row);
    if (!text.trim()) return false;
    const hasApp = APP_WEB.test(text);
    if (hasApp) return false;
    return MANUFACTURING.test(text) || RESEARCH.test(text);
  }

  global.TClientIndustryFit = { isManufacturingLike };
})(window);
