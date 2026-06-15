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
    getSalesManagementAll: () => rpc("get_sales_management_all"),
    getKeywordsDoc: () => rpc("get_keywords_doc"),
    checkEmailAllowed: (email) => rpc("check_email_allowed", { addr: email }),
    getCrawlStatus: () => rpc("get_crawl_status"),
    getNotionSyncStatus: () => rpc("get_notion_sync_status"),
    requestCrawl: () => rpc("request_crawl", {}, { auth: true }),
    saveOverrides: (doc) => rpc("save_overrides_doc", { doc }, { auth: true }),
    upsertSalesManagement: (companyId, patch) =>
      rpc("upsert_sales_management", { p_company_id: companyId, p_patch: patch }, { auth: true }),
    upsertManualCompany: (companyId, patch) =>
      rpc("upsert_manual_company", { p_company_id: companyId, p_patch: patch }, { auth: true }),
    deleteManualCompany: (companyId) =>
      rpc("delete_manual_company", { p_company_id: companyId }, { auth: true }),
    migrateCustomCompaniesFromOverrides: () => rpc("migrate_custom_companies_from_overrides", {}, { auth: true }),
    migrateSalesFromOverrides: () => rpc("migrate_sales_from_overrides", {}, { auth: true }),
    recoverSalesFromPublishedSnapshot: () => rpc("recover_sales_from_published_snapshot", {}, { auth: true }),
    saveKeywords: (doc) => rpc("save_keywords_doc", { doc }, { auth: true })
  };
})();
