/**
 * bizno.net profile fetch by business registration number (browser).
 */
(function () {
  const SEARCH_BASE = "https://bizno.net";
  const USER_AGENT = "T-client-pages/0.1";

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function normalizeBizNoDigits(bizNo) {
    const digits = `${bizNo ?? ""}`.replace(/\D/g, "");
    return digits.length === 10 ? digits : null;
  }

  function formatBizNo(digits) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }

  function cleanCellValue(value) {
    return `${value ?? ""}`
      .replace(/※.*$/, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractTableCell(html, label) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`<th>\\s*${escaped}\\s*</th>\\s*<td[^>]*>([\\s\\S]*?)</td>`, "i");
    const match = `${html ?? ""}`.match(re);
    if (!match) return "";
    return cleanCellValue(
      match[1]
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    );
  }

  function extractIndustrySummary(html) {
    const re = /<th>\s*국세청산업분류\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i;
    const match = `${html ?? ""}`.match(re);
    if (!match) return "";
    const parts = [];
    for (const p of match[1].matchAll(/<p[^>]*>([^<]+)<\/p>/gi)) {
      const text = p[1].replace(/\s+/g, " ").trim();
      if (text) parts.push(text);
    }
    if (parts.length) return parts.join(" · ");
    return match[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function homepageToDomain(homepage) {
    const raw = `${homepage ?? ""}`.trim();
    if (!raw) return "";
    try {
      const url = raw.startsWith("http") ? raw : `https://${raw}`;
      return new URL(url).hostname.replace(/^www\./i, "");
    } catch {
      return "";
    }
  }

  function parseBiznoArticleHtml(html, articlePath = "") {
    const bizNo = cleanCellValue(extractTableCell(html, "사업자등록번호"));
    const homepageRaw = extractTableCell(html, "홈페이지");
    const homepageLink = homepageRaw.match(/https?:\/\/[^\s]+|www\.[^\s]+/i)?.[0] ?? homepageRaw;

    let foundedDate = cleanCellValue(extractTableCell(html, "등록일"));
    if (!foundedDate) {
      const meta = html.match(/설립일[^:]*:\s*(\d{4}-\d{2}-\d{2})/);
      if (meta) foundedDate = meta[1];
    }

    let employeeCount = cleanCellValue(extractTableCell(html, "종업원수"));
    if (!employeeCount) {
      const meta = html.match(/종업원수\s*:\s*(\d+)\s*명/);
      if (meta) employeeCount = meta[1];
    }

    const legalName =
      cleanCellValue(html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "") ||
      cleanCellValue(extractTableCell(html, "상호"));

    return {
      biz_no: bizNo,
      corp_no: cleanCellValue(extractTableCell(html, "법인등록번호")),
      company_name_legal: legalName,
      biz_status: cleanCellValue(extractTableCell(html, "사업자 현재 상태")),
      company_scale: cleanCellValue(extractTableCell(html, "기업규모")),
      biz_type: cleanCellValue(extractTableCell(html, "업 태")),
      biz_item: cleanCellValue(extractTableCell(html, "종 목")),
      industry_summary: extractIndustrySummary(html) || "",
      homepage: homepageLink,
      founded_date: foundedDate,
      employee_count: `${employeeCount}`.replace(/명$/, "").trim(),
      enrichment_source: "bizno",
      domain: homepageToDomain(homepageLink)
    };
  }

  async function fetchHtml(url, { useProxy = true } = {}) {
    const headers = { Accept: "text/html", "User-Agent": USER_AGENT };
    try {
      const direct = await fetch(url, { headers, mode: "cors", signal: AbortSignal.timeout(8000) });
      if (direct.ok) return direct.text();
    } catch {
      /* CORS/network — fall through to proxy once */
    }
    if (!useProxy) throw new Error("fetch_blocked");
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxy, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`proxy_http_${res.status}`);
    return res.text();
  }

  async function listArticlePaths(query, max = 5) {
    const html = await fetchHtml(`${SEARCH_BASE}/?query=${encodeURIComponent(query)}`);
    const paths = [];
    const re = /href="(\/article\/\d+)"/gi;
    let match;
    while ((match = re.exec(html)) !== null) {
      if (!paths.includes(match[1])) paths.push(match[1]);
      if (paths.length >= max) break;
    }
    return paths;
  }

  /**
   * @param {string} bizNo
   * @param {{ maxMs?: number }} [options] — browser budget (default 18s); overrun → fetch_blocked for server fallback
   */
  async function fetchProfileByBizNo(bizNo, options = {}) {
    const digits = normalizeBizNoDigits(bizNo);
    if (!digits) return { ok: false, reason: "invalid_biz_no", message: "사업자번호 10자리를 입력하세요." };

    const deadline = Date.now() + (options.maxMs ?? 18000);
    const timedOut = () => Date.now() >= deadline;

    const queries = [formatBizNo(digits), digits];
    const seen = new Set();
    let lastReason = "bizno_no_match";

    for (const q of queries) {
      if (timedOut()) break;
      let paths;
      try {
        paths = await listArticlePaths(q, 5);
      } catch {
        lastReason = "fetch_blocked";
        break;
      }
      if (!paths.length) continue;

      for (const path of paths) {
        if (timedOut()) {
          lastReason = "fetch_blocked";
          break;
        }
        if (seen.has(path)) continue;
        seen.add(path);
        let html;
        try {
          html = await fetchHtml(`${SEARCH_BASE}${path}`);
        } catch {
          lastReason = "fetch_blocked";
          continue;
        }
        const profile = parseBiznoArticleHtml(html, path);
        const found = normalizeBizNoDigits(profile.biz_no);
        if (found === digits) {
          return { ok: true, profile: profileToUi(profile) };
        }
      }
    }

    if (lastReason === "fetch_blocked" || timedOut()) {
      return {
        ok: false,
        reason: "fetch_blocked",
        message: "브라우저 조회가 제한되어 서버에서 수집합니다."
      };
    }
    return {
      ok: false,
      reason: "bizno_no_match",
      message: "bizno.net에서 일치하는 사업자를 찾지 못했습니다. 서버 수집을 시도합니다."
    };
  }

  function profileToUi(p) {
    return {
      companyNameLegal: p.company_name_legal ?? "",
      bizNo: p.biz_no ?? "",
      bizType: p.biz_type ?? "",
      bizItem: p.biz_item ?? "",
      companyScale: p.company_scale ?? "",
      bizStatus: p.biz_status ?? "",
      foundedDate: p.founded_date ?? "",
      employeeCount: p.employee_count ?? "",
      homepage: p.homepage ?? "",
      industrySummary: p.industry_summary ?? "",
      domain: p.domain ?? ""
    };
  }

  window.TEnrichBizno = {
    fetchProfileByBizNo,
    normalizeBizNoDigits,
    formatBizNo,
    profileToUi
  };
})();
