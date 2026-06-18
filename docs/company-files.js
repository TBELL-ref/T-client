/**
 * Company files (result reports, etc.) — DB-backed.
 */
(function () {
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

  async function remove(fileId, companyId) {
    await window.TSupabase.deleteCompanyFile(fileId);
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
    remove,
    invalidate,
    FILE_TYPE_LABEL,
    normalize
  };
})();
