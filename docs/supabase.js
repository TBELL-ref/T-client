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
    getLeadDashboard: () => rpc("get_lead_dashboard"),
    getOverridesDoc: () => rpc("get_overrides_doc"),
    getCompanyEditsAll: () => rpc("get_company_edits_all"),
    getSalesManagementAll: () => rpc("get_sales_management_all"),
    getKeywordsDoc: () => rpc("get_keywords_doc"),
    getConfigKeywords: () => rpc("get_config_keywords"),
    checkEmailAllowed: (email) => rpc("check_email_allowed", { addr: email }),
    getCrawlStatus: () => rpc("get_crawl_status"),
    getNotionSyncStatus: () => rpc("get_notion_sync_status"),
    requestCrawl: () => rpc("request_crawl", {}, { auth: true }),
    saveOverrides: (doc) => rpc("save_overrides_doc", { doc }, { auth: true }),
    upsertCompanyEdit: (companyId, patch) =>
      rpc("upsert_company_edit", { p_company_id: companyId, p_patch: patch }, { auth: true }),
    deleteCompanyEdit: (companyId) => rpc("delete_company_edit", { p_company_id: companyId }, { auth: true }),
    migrateOverridesToRelational: () => rpc("migrate_overrides_doc_to_relational", {}, { auth: true }),
    upsertSalesManagement: (companyId, patch) =>
      rpc("upsert_sales_management", { p_company_id: companyId, p_patch: patch }, { auth: true }),
    upsertManualCompany: (companyId, patch) =>
      rpc("upsert_manual_company", { p_company_id: companyId, p_patch: patch }, { auth: true }),
    deleteManualCompany: (companyId) =>
      rpc("delete_manual_company", { p_company_id: companyId }, { auth: true }),
    deleteCompany: (companyId) => rpc("delete_company", { p_company_id: companyId }, { auth: true }),
    deleteJobPost: (companyId, url, jobPostId = "") =>
      rpc(
        "delete_job_post",
        { p_company_id: companyId, p_url: url ?? "", p_job_post_id: jobPostId ?? "" },
        { auth: true }
      ),
    migrateCustomCompaniesFromOverrides: () => rpc("migrate_custom_companies_from_overrides", {}, { auth: true }),
    migrateSalesFromOverrides: () => rpc("migrate_sales_from_overrides", {}, { auth: true }),
    recoverSalesFromPublishedSnapshot: () => rpc("recover_sales_from_published_snapshot", {}, { auth: true }),
    saveConfigKeywords: (keywords) => rpc("save_config_keywords", { p_keywords: keywords }, { auth: true }),
    getCompanyUserState: () => rpc("get_company_user_state", {}, { auth: true }),
    markCompanyViewed: (companyId) => rpc("mark_company_viewed", { p_company_id: companyId }, { auth: true }),
    setCompanyNewState: (companyId, isNew) =>
      rpc("set_company_new_state", { p_company_id: companyId, p_is_new: isNew }, { auth: true }),
    getCompanyFiles: (companyId) => rpc("get_company_files", { p_company_id: companyId }),
    upsertCompanyFile: (patch) => rpc("upsert_company_file", { p_patch: patch }, { auth: true }),
    deleteCompanyFile: (fileId) => rpc("delete_company_file", { p_file_id: fileId }, { auth: true }),
    getMeetingNotes: (companyId) => rpc("get_meeting_notes", { p_company_id: companyId }),
    upsertMeetingNote: (patch) => rpc("upsert_meeting_note", { p_patch: patch }, { auth: true }),
    deleteMeetingNote: (noteId) => rpc("delete_meeting_note", { p_note_id: noteId }, { auth: true })
  };
})();
