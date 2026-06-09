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

  function resolveManualRow(companyId, rowHint = null) {
    if (!isManualCompanyId(companyId)) return rowHint;
    if (rowHint && isManualRow(rowHint)) return rowHint;
    const custom = window.TClientAdmin?.getCustomCompanies?.().find((r) => r.companyId === companyId);
    if (custom) return custom;
    const stateRow = window.state?.rows?.find((r) => r.companyId === companyId);
    if (stateRow) return stateRow;
    return { companyId, companyName: companyId, companyNameKo: companyId };
  }

  async function ensureManualById(companyId, rowHint = null) {
    if (!isManualCompanyId(companyId)) return null;
    return upsertManual(resolveManualRow(companyId, rowHint));
  }

  async function migrateFromOverrides() {
    return window.TSupabase.migrateCustomCompaniesFromOverrides();
  }

  async function migrateSalesFromOverrides() {
    return window.TSupabase.migrateSalesFromOverrides();
  }

  async function recoverSalesFromSnapshot() {
    return window.TSupabase.recoverSalesFromPublishedSnapshot();
  }

  window.TCompanies = {
    isManualCompanyId,
    isManualRow,
    rowToPatch,
    upsertManual,
    deleteManual,
    ensureManual,
    resolveManualRow,
    ensureManualById,
    migrateFromOverrides,
    migrateSalesFromOverrides,
    recoverSalesFromSnapshot
  };
})();
