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

    const timeoutMs = Number(options.timeoutMs) || 0;
    const ctrl = timeoutMs > 0 ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
        signal: ctrl?.signal
      });
    } catch (err) {
      if (err?.name === "AbortError") {
        const e = new Error(`Supabase ${fn} 실패 (timeout). canceling statement due to statement timeout`);
        e.status = 57014;
        e.detail = "client abort";
        throw e;
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const err = new Error(`Supabase ${fn} 실패 (${res.status}). ${detail}`);
      err.status = res.status;
      err.detail = detail;
      throw err;
    }
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  function publicStorageUrl(bucket, path) {
    const { url } = config();
    const encoded = `${path}`.split("/").map((seg) => encodeURIComponent(seg)).join("/");
    return `${url}/storage/v1/object/public/${bucket}/${encoded}`;
  }

  async function uploadStorageFile(bucket, path, file) {
    const { url, anonKey } = config();
    const token = await window.TAuth.getAccessToken();
    if (!token) throw new Error("로그인이 필요합니다.");
    const encoded = `${path}`.split("/").map((seg) => encodeURIComponent(seg)).join("/");
    const res = await fetch(`${url}/storage/v1/object/${bucket}/${encoded}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true"
      },
      body: file
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`파일 업로드 실패 (${res.status}). ${detail}`);
    }
    return publicStorageUrl(bucket, path);
  }

  async function deleteStorageFile(bucket, path) {
    if (!path) return;
    const { url, anonKey } = config();
    const token = await window.TAuth.getAccessToken();
    if (!token) throw new Error("로그인이 필요합니다.");
    const encoded = `${path}`.split("/").map((seg) => encodeURIComponent(seg)).join("/");
    await fetch(`${url}/storage/v1/object/${bucket}/${encoded}`, {
      method: "DELETE",
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
    });
  }

  function isMissingRpcError(err) {
    const text = `${err?.detail ?? err?.message ?? ""}`;
    return err?.status === 404 || /PGRST202|Could not find the function/i.test(text);
  }

  async function getSyncJobStatus(jobName) {
    const idle = { status: "idle" };
    const legacyFn =
      jobName === "notion_push"
        ? "get_notion_push_status"
        : jobName === "notion_sync"
          ? "get_notion_sync_status"
          : null;

    try {
      return (await rpc("get_sync_job_status", { p_job_name: jobName })) ?? idle;
    } catch (err) {
      if (!isMissingRpcError(err)) throw err;
      if (legacyFn) {
        try {
          return (await rpc(legacyFn)) ?? idle;
        } catch (legacyErr) {
          if (!isMissingRpcError(legacyErr)) throw legacyErr;
        }
      }
      return idle;
    }
  }

  const SNAP_IDB = "tclient-published-snap-v1";
  const SNAP_STORE = "snap";
  const SNAP_KEY = "published";

  function openSnapDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(SNAP_IDB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SNAP_STORE)) db.createObjectStore(SNAP_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function readCachedPublishedSnapshot() {
    try {
      const db = await openSnapDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(SNAP_STORE, "readonly");
        const req = tx.objectStore(SNAP_STORE).get(SNAP_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async function writeCachedPublishedSnapshot(doc) {
    if (!Array.isArray(doc?.rows) || !doc.rows.length) return;
    try {
      const db = await openSnapDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(SNAP_STORE, "readwrite");
        tx.objectStore(SNAP_STORE).put(doc, SNAP_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      /* quota / private mode */
    }
  }

  window.TSupabase = {
    getPublishedSnapshot: () => rpc("get_published_snapshot"),
    readCachedPublishedSnapshot,
    writeCachedPublishedSnapshot,
    getLeadDashboard: (opts = {}) => rpc("get_lead_dashboard", {}, { timeoutMs: opts.timeoutMs }),
    getOverridesDoc: () => rpc("get_overrides_doc"),
    getCompanyEditsAll: () => rpc("get_company_edits_all"),
    getSalesManagementAll: () => rpc("get_sales_management_all"),
    getKeywordsDoc: () => rpc("get_keywords_doc"),
    getConfigKeywords: () => rpc("get_config_keywords"),
    checkEmailAllowed: (email) => rpc("check_email_allowed", { addr: email }),
    getCrawlStatus: () => rpc("get_crawl_status"),
    getNotionSyncStatus: () => getSyncJobStatus("notion_sync"),
    getNotionPushStatus: () => getSyncJobStatus("notion_push"),
    getSyncJobStatus,
    requestCrawl: () => rpc("request_crawl", {}, { auth: true }),
    saveOverrides: (doc) => rpc("save_overrides_doc", { doc }, { auth: true }),
    upsertCompanyEdit: (companyId, patch) =>
      rpc("upsert_company_edit", { p_company_id: companyId, p_patch: patch }, { auth: true }),
    deleteCompanyEdit: (companyId) => rpc("delete_company_edit", { p_company_id: companyId }, { auth: true }),
    migrateOverridesToRelational: () => rpc("migrate_overrides_doc_to_relational", {}, { auth: true }),
    upsertSalesManagement: (companyId, patch) =>
      rpc("upsert_sales_management", { p_company_id: companyId, p_patch: patch }, { auth: true }),
    batchSetNotionPriorities: (companyIds) =>
      rpc("batch_set_notion_priorities", { p_company_ids: companyIds }, { auth: true }),
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
    deleteMeetingNote: (noteId) => rpc("delete_meeting_note", { p_note_id: noteId }, { auth: true }),
    uploadStorageFile,
    deleteStorageFile,
    publicStorageUrl
  };
})();
