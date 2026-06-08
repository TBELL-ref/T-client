/**
 * Supabase REST/RPC client for static GitHub Pages.
 */
(function () {
  function config() {
    const cfg = window.TSupabaseConfig ?? {};
    if (!cfg.url || !cfg.anonKey) {
      throw new Error("Supabase 설정이 없습니다. npm run embed:supabase-config 후 push 하세요.");
    }
    return cfg;
  }

  async function rpc(fn, body, options = {}) {
    const { url, anonKey } = config();
    const headers = {
      apikey: anonKey,
      "Content-Type": "application/json"
    };

    if (options.auth) {
      const token = await window.TAuth.getAccessToken();
      if (!token) throw new Error("로그인이 필요합니다.");
      headers.Authorization = `Bearer ${token}`;
    } else {
      headers.Authorization = `Bearer ${anonKey}`;
    }

    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body ?? {})
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Supabase ${fn} 실패 (${res.status}). ${detail}`);
    }
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  window.TSupabase = {
    getPublishedSnapshot: () => rpc("get_published_snapshot"),
    getOverridesDoc: () => rpc("get_overrides_doc"),
    getKeywordsDoc: () => rpc("get_keywords_doc"),
    checkEmailAllowed: (email) => rpc("check_email_allowed", { addr: email }),
    getCrawlStatus: () => rpc("get_crawl_status"),
    requestCrawl: () => rpc("request_crawl", {}, { auth: true }),
    saveOverrides: (doc) => rpc("save_overrides_doc", { doc }, { auth: true }),
    saveKeywords: (doc) => rpc("save_keywords_doc", { doc }, { auth: true })
  };
})();
