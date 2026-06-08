/**
 * Job post URL normalization — same posting across portal URL variants.
 */
(function () {
  const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

  function normalizeInput(value) {
    const raw = `${value ?? ""}`.trim();
    if (!raw) return "";
    if (!/^https?:\/\//i.test(raw)) return `https://${raw}`;
    return raw;
  }

  /** Stable key for duplicate detection (portal job id when extractable). */
  function postUrlKey(url) {
    try {
      const u = new URL(normalizeInput(url));
      const host = u.hostname.replace(/^www\./i, "").toLowerCase();
      const path = u.pathname.replace(/\/+$/, "") || "/";

      if (host.includes("career.co.kr")) {
        const view = path.match(/\/recruit\/view\/(\d+)/i) || path.match(/\/view\/(\d+)/i);
        if (view) return `career:view:${view[1]}`;
      }

      if (host.includes("jobkorea.co.kr")) {
        const gi = path.match(/GI_Read\/(\d+)/i)?.[1] || u.searchParams.get("gi_no");
        if (gi) return `jobkorea:gi:${gi}`;
      }

      if (host.includes("saramin.co.kr")) {
        const rec = path.match(/recruit\/view\/(\d+)/i)?.[1] || u.searchParams.get("rec_idx");
        if (rec) return `saramin:rec:${rec}`;
      }

      if (host.includes("wanted.co.kr")) {
        const wd = path.match(/\/wd\/(\d+)/i)?.[1] || u.searchParams.get("id");
        if (wd) return `wanted:wd:${wd}`;
      }

      if (host.includes("programmers.co.kr")) {
        const jp = path.match(/job_positions\/(\d+)/i)?.[1] || path.match(/\/job\/(\d+)/i)?.[1];
        if (jp) return `programmers:jp:${jp}`;
      }

      if (host.includes("jumpit.co.kr")) {
        const id = path.match(/\/(\d+)\/?$/)?.[1];
        if (id) return `jumpit:${id}`;
      }

      if (host.includes("greenhouse.io")) {
        const gh = u.searchParams.get("gh_jid");
        if (gh) return `greenhouse:gh_jid:${gh}`;
      }

      for (const key of UTM_KEYS) u.searchParams.delete(key);
      const qs = u.searchParams.toString();
      return `${u.protocol}//${host}${path}${qs ? `?${qs}` : ""}`.toLowerCase();
    } catch {
      return `${url ?? ""}`.trim().toLowerCase();
    }
  }

  function urlsMatch(a, b) {
    if (!a || !b) return false;
    return postUrlKey(a) === postUrlKey(b);
  }

  window.TPostUrl = {
    normalizeInput,
    postUrlKey,
    urlsMatch
  };
})();
