/**
 * Manual companies — persisted in companies table (is_manual = true).
 */
(function () {
  function isManualCompanyId(companyId) {
    return `${companyId ?? ""}`.startsWith("cmp_m_");
  }

  function isManualRow(row) {
    if (!row) return false;
    return Boolean(row.isManual) || window.TClientAdmin?.isCustomCompany?.(row.companyId) || isManualCompanyId(row.companyId);
  }

  function rowToPatch(row) {
    const p = row.profile ?? {};
    return {
      companyName: row.companyNameKo || row.companyName || row.companyId || "",
      companyNameKo: row.companyNameKo || row.companyName || "",
      domain: row.domain || "",
      companyTier: row.companyTier || "unknown",
      bizNo: p.bizNo || "",
      bizType: p.bizType || "",
      bizItem: p.bizItem || "",
      homepage: p.homepage || "",
      lastCollectedAt: row.lastCollectedAt || new Date().toISOString()
    };
  }

  async function upsertManual(row) {
    if (!row?.companyId) throw new Error("company_id가 필요합니다.");
    if (!isManualCompanyId(row.companyId)) {
      throw new Error("수동 회사 ID(cmp_m_*)만 companies 테이블에 등록할 수 있습니다.");
    }
    return window.TSupabase.upsertManualCompany(row.companyId, rowToPatch(row));
  }

  async function deleteManual(companyId) {
    if (!companyId || !isManualCompanyId(companyId)) return null;
    return window.TSupabase.deleteManualCompany(companyId);
  }

  async function ensureManual(row) {
    if (!isManualRow(row)) return null;
    return upsertManual(row);
  }

  async function migrateFromOverrides() {
    return window.TSupabase.migrateCustomCompaniesFromOverrides();
  }

  window.TCompanies = {
    isManualCompanyId,
    isManualRow,
    rowToPatch,
    upsertManual,
    deleteManual,
    ensureManual,
    migrateFromOverrides
  };
})();
