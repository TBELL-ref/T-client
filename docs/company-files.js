/**
 * Company files (result reports, etc.) — DB + Supabase Storage.
 */
(function () {
  const BUCKET = "company-files";
  const cache = new Map();

  function normalize(row = {}) {
    return {
      id: row.id,
      companyId: row.companyId ?? row.company_id,
      fileType: row.fileType ?? row.file_type ?? "result_report",
      title: row.title ?? "",
      fileUrl: row.fileUrl ?? row.file_url ?? "",
      storagePath: row.storagePath ?? row.storage_path ?? "",
      uploadedBy: row.uploadedBy ?? row.uploaded_by ?? "",
      uploadedAt: row.uploadedAt ?? row.uploaded_at ?? "",
      memo: row.memo ?? ""
    };
  }

  function resolveHref(file = {}) {
    if (file.fileUrl) return file.fileUrl;
    if (file.storagePath && window.TSupabase?.publicStorageUrl) {
      return window.TSupabase.publicStorageUrl(BUCKET, file.storagePath);
    }
    return "#";
  }

  function safeFileName(name) {
    return `${name ?? "file"}`.replace(/[^\w.\-가-힣]/g, "_");
  }

  async function loadForCompany(companyId, force = false) {
    if (!force && cache.has(companyId)) return cache.get(companyId);
    try {
      const rows = await window.TSupabase.getCompanyFiles(companyId);
      const list = (Array.isArray(rows) ? rows : []).map(normalize);
      cache.set(companyId, list);
      return list;
    } catch (err) {
      console.warn("[company-files] load failed", err);
      return cache.get(companyId) ?? [];
    }
  }

  async function add(companyId, patch) {
    const result = await window.TSupabase.upsertCompanyFile({ companyId, ...patch });
    cache.delete(companyId);
    return normalize(result);
  }

  async function uploadFile(companyId, file, { title = "", fileType = "result_report" } = {}) {
    if (!file) throw new Error("파일이 없습니다.");
    const storagePath = `${companyId}/${Date.now()}_${safeFileName(file.name)}`;
    const fileUrl = await window.TSupabase.uploadStorageFile(BUCKET, storagePath, file);
    return add(companyId, {
      fileType,
      title: title || file.name,
      fileUrl,
      storagePath
    });
  }

  async function remove(fileId, companyId, storagePath = "") {
    await window.TSupabase.deleteCompanyFile(fileId);
    if (storagePath) {
      try {
        await window.TSupabase.deleteStorageFile(BUCKET, storagePath);
      } catch (err) {
        console.warn("[company-files] storage delete failed", err);
      }
    }
    cache.delete(companyId);
  }

  function invalidate(companyId) {
    cache.delete(companyId);
  }

  const FILE_TYPE_LABEL = {
    result_report: "결과보고서",
    proposal: "제안서",
    contract: "계약서",
    etc: "기타"
  };

  window.TCompanyFiles = {
    loadForCompany,
    add,
    uploadFile,
    remove,
    invalidate,
    resolveHref,
    FILE_TYPE_LABEL,
    normalize
  };
})();
