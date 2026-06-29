/**
 * Side detail drawer + v2 tab list renderers.
 */
(function () {
  const byId = (id) => document.getElementById(id);
  const V = () => window.TClientView ?? {};

  function poolClassOf(row) {
    return window.TPipeline?.poolClassOf?.(row) ?? "normal";
  }

  function poolClassLabel(cls) {
    return window.TPipeline?.poolClassLabel?.(cls) ?? cls;
  }

  function poolClassBadge(row) {
    const cls = poolClassOf(row);
    if (cls === "normal") return "";
    const tone =
      cls === "recommended" ? "tag-green" : cls === "in_progress" ? "tag-blue" : cls === "hidden" ? "tag-muted" : "";
    return `<span class="detail-tag ${tone}">${escapeHtml(poolClassLabel(cls))}</span>`;
  }

  function isLoggedIn() {
    return Boolean(window.TClientAdmin?.isUnlocked?.());
  }

  /** 추천·진행이 아닌 활성 회사 = 신규 풀 후보 */
  function isNewPool(row) {
    const pool = poolClassOf(row);
    return pool !== "recommended" && pool !== "in_progress" && pool !== "hidden";
  }

  /** 로그인: 계정별 미열람·신규 표시 on. 비로그인: 직전 크롤 신규만 */
  function isRowAccountNew(row) {
    if (!isNewPool(row)) return false;
    if (isLoggedIn()) {
      return window.TCompanyUserState?.isAccountNew?.(row.companyId) ?? true;
    }
    return Boolean(row.isNewFromLastCrawl);
  }

  function newBadge(row) {
    if (!isRowAccountNew(row)) return "";
    const title = isLoggedIn() ? "아직 열지 않은 회사" : "직전 크롤 신규";
    return `<span class="meta-chip badge-new-icon" title="${escapeAttr(title)}" aria-label="신규"><span class="badge-new-mark">NEW</span></span>`;
  }

  function isMainTab(row) {
    if (window.TClientView?.isMainTabLead) return window.TClientView.isMainTabLead(row);
    if (row.userHidden || row.isHidden || row.excluded) return false;
    if (window.TPipeline?.poolClassOf?.(row) === "hidden") return false;
    return isListable(row);
  }

  function rowMatchesExcludedTab(row) {
    if (window.TClientView?.isShelvedLead) return window.TClientView.isShelvedLead(row);
    return window.TPipeline?.rowMatchesExcludedTab?.(row) ?? Boolean(row?.userHidden || row?.isHidden || row?.excluded);
  }

  function rowMatchesNewTab(row) {
    return isMainTab(row) && isRowAccountNew(row);
  }

  function rowMatchesRecommendedTab(row) {
    return window.TPipeline?.rowMatchesRecommendedTab?.(row) && isMainTab(row);
  }

  function rowMatchesInProgressTab(row) {
    return window.TPipeline?.rowMatchesInProgressTab?.(row) && isMainTab(row);
  }

  function isListable(row) {
    if (window.TClientView?.isListableLead) return window.TClientView.isListableLead(row);
    if (row.userHidden) return false;
    return (row.posts?.length ?? 0) > 0;
  }

  function filterSearch(rows, q) {
    if (!q) return rows;
    const hay = q.toLowerCase();
    return rows.filter((row) => {
      const text = `${V().displayName?.(row) ?? ""} ${V().serviceName?.(row) ?? ""} ${row.domain || ""} ${row.profile?.bizItem || ""} ${V().contactEmail?.(row) || ""}`.toLowerCase();
      return text.includes(hay);
    });
  }

  function getSearchQuery() {
    return byId("search")?.value?.toLowerCase().trim() ?? "";
  }

  function getRows() {
    return window.__TCLIENT_ROWS ?? [];
  }

  function displayName(row) {
    return V().displayName?.(row) ?? (row.companyNameKo || row.companyName || "-");
  }

  function escapeHtml(s) {
    return `${s ?? ""}`
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return `${iso}`.slice(0, 10);
    return d.toLocaleDateString("ko-KR");
  }

  function iconSvg(name, size = 16) {
    return V().iconSvg?.(name, size) ?? "";
  }

  function companyCell(row, { showPoolBadge = false } = {}) {
    return V().renderCompanyCell?.(row, { showPoolBadge, showManualBadge: false, compactMeta: true }) ?? escapeHtml(displayName(row));
  }

  function emailCell(row) {
    const email = V().contactEmail?.(row) ?? "";
    if (!email) return '<span class="muted">—</span>';
    return `<a class="link cell-email" href="mailto:${escapeAttr(email)}" title="${escapeAttr(email)}">${escapeHtml(email)}</a>`;
  }

  function pipelineCell(row) {
    return V().pipelineCombinedCell?.(row) ?? "";
  }

  function fileIconsCell(row) {
    const files = window.__TCLIENT_FILES_CACHE?.[row.companyId] ?? [];
    if (!files.length) return "";
    return `<div class="cell-file-icons">${files
      .map((f) => {
        const title = window.TCompanyFiles?.resolveTitle?.(f) ?? "파일";
        const url = (window.TCompanyFiles?.resolveHref?.(f) ?? f.fileUrl) || "#";
        const ext = window.TCompanyFiles?.extFromFile?.(f) ?? "";
        const extClass = ext ? ` file-ext-${escapeAttr(ext)}` : "";
        const inner = window.TClientView?.fileChipInnerHtml?.(f, 15) ?? iconSvg("fileText", 15);
        return `<a class="file-icon-chip file-ext-chip${extClass}" href="${escapeAttr(url)}" target="_blank" rel="noreferrer" download title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">${inner}</a>`;
      })
      .join("")}</div>`;
  }

  function meetingHint(row) {
    const notes = window.__TCLIENT_MEETING_CACHE?.[row.companyId];
    if (!notes?.length) return '<span class="muted">—</span>';
    const hint = window.TMeetingNotes?.latestSummary?.(notes) ?? "";
    if (!hint) return '<span class="muted">—</span>';
    return `<span class="cell-meeting-hint" title="${escapeAttr(hint)}">${escapeHtml(hint.slice(0, 56))}${hint.length > 56 ? "…" : ""}</span>`;
  }

  function testMeetingCell(row) {
    const period = V().testPeriodHtml?.(row) ?? V().testPeriodDisplay?.(row) ?? "";
    const meeting = meetingHint(row);
    if (!period && meeting.includes("muted")) {
      return '<span class="muted">—</span>';
    }
    return `<div class="cell-test-meeting-stack">
      ${period ? `<span class="cell-test-meeting-row">${period}</span>` : ""}
      <span class="cell-test-meeting-row">${meeting}</span>
    </div>`;
  }

  function recommendedTable(rows) {
    if (!rows.length) return "";
    const reorder = V().isNotionReorderActive?.() && (window.__TCLIENT_ACTIVE_TAB ?? "") === "recommended";
    const handleTh = reorder ? `<th class="col-reorder-handle">No.</th>` : "";
    return `<div class="table-wrap"><table class="leads-table leads-table-rich${reorder ? " table-reorder-mode" : ""}"><thead><tr>
      ${handleTh}
      <th>회사</th>
      <th class="col-opinion">의견</th>
      <th class="col-revenue">매출</th>
      <th class="col-scores">추천 · 파일럿</th>
      <th>단계</th>
      <th>담당자</th>
    </tr></thead><tbody>${rows
      .map(
        (row, idx) => `<tr class="lead-row-click${reorder ? " reorder-mode" : ""}" data-open-company="${escapeAttr(row.companyId)}"${reorder ? ` data-reorder-id="${escapeAttr(row.companyId)}"` : ""}>
        ${reorder ? V().reorderHandleCell?.(idx + 1) ?? "" : ""}
        <td>${companyCell(row)}</td>
        <td class="col-opinion">${V().candidateOpinionHtml?.(row) ?? ""}</td>
        <td class="col-revenue">${V().revenueCell?.(row) ?? ""}</td>
        <td class="col-scores">${V().scoreStackCell?.(row) ?? ""}</td>
        <td>${pipelineCell(row)}</td>
        <td>${emailCell(row)}</td>
      </tr>`
      )
      .join("")}</tbody></table></div>`;
  }

  function inProgressTable(rows) {
    if (!rows.length) return "";
    const reorder = V().isNotionReorderActive?.() && (window.__TCLIENT_ACTIVE_TAB ?? "") === "in_progress";
    const handleTh = reorder ? `<th class="col-reorder-handle">No.</th>` : "";
    return `<div class="table-wrap"><table class="leads-table leads-table-rich${reorder ? " table-reorder-mode" : ""}"><thead><tr>
      ${handleTh}
      <th>회사</th>
      <th class="col-test-meeting">테스트 · 미팅</th>
      <th>단계 · 상태</th>
      <th class="col-revenue">매출</th>
      <th>담당자</th>
      <th class="col-files">파일</th>
    </tr></thead><tbody>${rows
      .map((row, idx) => {
        return `<tr class="lead-row-click${reorder ? " reorder-mode" : ""}" data-open-company="${escapeAttr(row.companyId)}"${reorder ? ` data-reorder-id="${escapeAttr(row.companyId)}"` : ""}>
        ${reorder ? V().reorderHandleCell?.(idx + 1) ?? "" : ""}
        <td>${companyCell(row)}</td>
        <td class="cell-test-meeting">${testMeetingCell(row)}</td>
        <td>${pipelineCell(row)}</td>
        <td class="col-revenue">${V().revenueCell?.(row) ?? ""}</td>
        <td>${emailCell(row)}</td>
        <td class="col-files">${fileIconsCell(row) || '<span class="muted">—</span>'}</td>
      </tr>`;
      })
      .join("")}</tbody></table></div>`;
  }

  function sortTabRows(rows) {
    return V().sortRows?.(rows) ?? rows;
  }

  function emptyState(tab) {
    const total = getRows().filter((r) => isMainTab(r)).length;
    const goLeads =
      tab !== "leads" && total > 0
        ? `<p class="empty-state-actions"><button type="button" class="btn-primary btn-sm" data-switch-tab="leads">회사 전체 보기 (${total})</button></p>`
        : "";
    const hints = {
      new: isLoggedIn()
        ? "아직 상세를 열지 않은 일반 리드가 여기 표시됩니다.<br /><span class=\"muted\">회사를 열면 이 계정의 신규 목록에서 빠집니다. 상세 헤더 「신규 표시」로 다시 넣을 수 있습니다.</span>"
        : "직전 크롤에서 새로 들어온 일반 리드가 여기 표시됩니다.<br /><span class=\"muted\">로그인하면 계정별로 「아직 열지 않은 회사」만 표시됩니다.</span>",
      recommended: "추천 분류 회사가 없습니다.<br /><span class=\"muted\">회사 상세 → 수정 → 분류 「추천」. 파이프라인이 테스트 진행 이상이면 「진행」 탭에 표시됩니다.</span>",
      in_progress: "진행 중인 회사가 없습니다.<br /><span class=\"muted\">파이프라인 단계를 「테스트 진행」 이상으로 설정하세요.</span>"
    };
    return `<div class="empty-state">${hints[tab] ?? "표시할 회사가 없습니다."}${goLeads}</div>`;
  }

  function renderNewTab(activeTab) {
    if (activeTab !== "new") return;
    const rows = getRows().filter(rowMatchesNewTab);
    const filtered = filterSearch(rows, getSearchQuery()).filter((r) => V().passesFilters?.(r) ?? true);
    if (!filtered.length) {
      byId("new").innerHTML = emptyState("new");
      bindEmptyStateActions("new");
      return;
    }
    V().renderCompanyTable?.("new", filtered, {
      pageKey: "newPage",
      onRefresh: () => renderNewTab("new")
    });
  }

  function bindEmptyStateActions(panelId) {
    const panel = byId(panelId);
    panel?.querySelectorAll("[data-switch-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelector(`.tabs-bar .tab[data-tab="${btn.dataset.switchTab}"]`)?.click();
      });
    });
  }

  function updateTabCounts() {
    const rows = getRows();
    const counts = {
      new: rows.filter((r) => rowMatchesNewTab(r)).length,
      recommended: rows.filter((r) => rowMatchesRecommendedTab(r)).length,
      in_progress: rows.filter((r) => rowMatchesInProgressTab(r)).length,
      leads: rows.filter((r) => isMainTab(r)).length,
      excluded: rows.filter((r) => rowMatchesExcludedTab(r)).length
    };
    const hideCountTabs = new Set(["leads", "posts", "excluded"]);
    document.querySelectorAll(".tabs-bar .tab[data-tab]").forEach((btn) => {
      const id = btn.dataset.tab;
      const base = btn.dataset.tabLabel || btn.textContent.replace(/\s*\d+$/, "").trim();
      btn.dataset.tabLabel = base;
      if (hideCountTabs.has(id)) {
        btn.textContent = base;
        return;
      }
      const n = counts[id];
      btn.textContent = n != null && n > 0 ? `${base} ${n}` : base;
    });
  }

  function bindListClicks(panelId) {
    const panel = byId(panelId);
    if (!panel) return;
    if (V().isNotionReorderActive?.()) {
      V().bindNotionReorderTable?.(panelId);
      return;
    }
    panel.querySelectorAll("tr.lead-row-click").forEach((tr) => {
      tr.addEventListener("click", (e) => {
        if (e.target.closest("a, button, summary, .cell-opinion-details")) return;
        const id = tr.dataset.openCompany;
        const row = getRows().find((r) => r.companyId === id);
        if (row) (window.openDetail ?? open)?.(row);
      });
    });
  }

  function renderRecommendedTab(activeTab) {
    if (activeTab !== "recommended") return;
    const baseRows = getRows().filter(rowMatchesRecommendedTab);
    const rows = V().isNotionReorderActive?.()
      ? V().notionReorderRowsForTab?.("recommended") ?? baseRows
      : (V().sortRecommendedRows ?? sortTabRows)(baseRows);
    const filtered = V().isNotionReorderActive?.()
      ? rows
      : filterSearch(rows, getSearchQuery()).filter((r) => V().passesFilters?.(r) ?? true);
    byId("recommended").innerHTML = filtered.length ? recommendedTable(filtered) : emptyState("recommended");
    bindListClicks("recommended");
    if (!filtered.length) bindEmptyStateActions("recommended");
  }

  async function renderInProgressTab(activeTab) {
    if (activeTab !== "in_progress") return;
    const baseRows = getRows().filter(rowMatchesInProgressTab);
    const rows = V().isNotionReorderActive?.()
      ? V().notionReorderRowsForTab?.("in_progress") ?? baseRows
      : (V().sortInProgressRows ?? sortTabRows)(baseRows);
    const filtered = V().isNotionReorderActive?.() ? rows : filterSearch(rows, getSearchQuery());
    const ids = filtered.map((r) => r.companyId);
    window.__TCLIENT_MEETING_CACHE = window.__TCLIENT_MEETING_CACHE ?? {};
    window.__TCLIENT_FILES_CACHE = window.__TCLIENT_FILES_CACHE ?? {};
    await Promise.all(
      ids.slice(0, 40).map(async (id) => {
        try {
          window.__TCLIENT_MEETING_CACHE[id] = await window.TMeetingNotes.loadForCompany(id);
        } catch {
          window.__TCLIENT_MEETING_CACHE[id] = [];
        }
        try {
          window.__TCLIENT_FILES_CACHE[id] = await window.TCompanyFiles.loadForCompany(id);
        } catch {
          window.__TCLIENT_FILES_CACHE[id] = [];
        }
      })
    );
    byId("in_progress").innerHTML = filtered.length ? inProgressTable(filtered) : emptyState("in_progress");
    bindListClicks("in_progress");
    if (!filtered.length) bindEmptyStateActions("in_progress");
  }

  function renderTabPanels(activeTab) {
    renderNewTab(activeTab);
    renderRecommendedTab(activeTab);
    void renderInProgressTab(activeTab);
    updateTabCounts();
  }

  function setDrawerOpen(open) {
    const drawer = byId("detailDrawer");
    if (!drawer) return;
    drawer.classList.toggle("hidden", !open);
    drawer.setAttribute("aria-hidden", open ? "false" : "true");
    document.body.classList.toggle("detail-drawer-open", open);
  }

  function setDetailLoading(show, text = "처리 중…") {
    byId("detailLoading")?.classList.toggle("hidden", !show);
    const t = byId("detailLoadingText");
    if (t) t.textContent = text;
    byId("detailDrawer")?.classList.toggle("drawer-busy", show);
  }

  async function syncNewToggle(row) {
    const wrap = byId("detailNewToggleWrap");
    const toggle = byId("detailNewToggle");
    if (!wrap || !toggle || !row) return;
    if (!isLoggedIn()) {
      wrap.classList.add("hidden");
      return;
    }
    wrap.classList.remove("hidden");
    toggle.checked = window.TCompanyUserState?.isAccountNew?.(row.companyId) ?? true;
  }

  async function open(row, edit = false) {
    if (!row) return;
    window.__TCLIENT_DETAIL_ROW = row;
    setDrawerOpen(true);
    await paint(row, edit);
    window.TDetailPanel?.refreshTabs?.();
  }

  function close() {
    if (window.closeDetail) {
      window.closeDetail();
      return;
    }
    window.__TCLIENT_DETAIL_ROW = null;
    window.__TCLIENT_DETAIL_EDIT = false;
    setDrawerOpen(false);
  }

  async function paint(row, sectionToEdit = null) {
    row = row ?? window.__TCLIENT_DETAIL_ROW;
    if (!row) return;
    const admin = window.TClientAdmin?.isUnlocked?.();
    if (typeof window.openDetail === "function") {
      await window.openDetail(row, sectionToEdit);
      return;
    }
    window.__TCLIENT_DETAIL_EDIT = Boolean(sectionToEdit && admin);

    const svc = V().serviceName?.(row) ?? "";
    if (typeof window.paintDetailHeader === "function") {
      window.paintDetailHeader(row);
    } else {
      const titleEl = byId("detailTitle");
      if (titleEl) {
        titleEl.innerHTML = svc
          ? `<span class="detail-title-company">${escapeHtml(displayName(row))}</span><span class="detail-title-service">${escapeHtml(svc)}</span>`
          : escapeHtml(displayName(row));
      }
      const sub = byId("detailHeaderSub");
      if (sub) {
        const P = window.TPipeline;
        const em = V().contactEmail?.(row);
        sub.textContent = [poolClassLabel(poolClassOf(row)), P?.pipelineStageLabel?.(row.pipelineStage), em]
          .filter(Boolean)
          .join(" · ");
      }
      const chips = byId("detailHeaderChips");
      if (chips) {
        chips.innerHTML = [
          poolClassBadge(row),
          V().pipelineStageBadge?.(row),
          V().pipelineStatusBadge?.(row),
          row.leadGrade ? `<span class="detail-tag tag-grade tag-grade-${row.leadGrade}">${row.leadGrade}</span>` : ""
        ].filter(Boolean).join("");
      }
    }
    if (typeof window.refreshDetailAdminButtons === "function") {
      window.refreshDetailAdminButtons();
    }

    const body = byId("detailBody");
    if (body) {
      body.innerHTML = window.TDetailPanel?.renderBody?.(row, admin) ?? "<p class='muted'>상세 로딩…</p>";
    }
    await syncNewToggle(row);
    window.TUiSelect?.init?.(byId("detailDrawer"));
  }

  function bind() {
    const drawer = byId("detailDrawer");
    if (!drawer) return;
    drawer.querySelectorAll("[data-close-detail]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
      });
    });
    function requireAdmin() {
      if (window.TClientAdmin?.isUnlocked?.()) return true;
      window.openAdminPopover?.();
      return false;
    }
    byId("detailMergeBtn")?.addEventListener("click", () => {
      if (!requireAdmin()) return;
      if (window.__TCLIENT_DETAIL_ROW) window.openMergeModal?.(window.__TCLIENT_DETAIL_ROW);
    });
    byId("detailDeleteBtn")?.addEventListener("click", () => {
      if (!requireAdmin()) return;
      if (window.__TCLIENT_DETAIL_ROW) window.deleteCompany?.(window.__TCLIENT_DETAIL_ROW);
    });
    byId("detailNewToggle")?.addEventListener("change", async (e) => {
      if (!isLoggedIn()) return;
      const toggle = e.target;
      if (toggle.disabled) return;
      const row = window.__TCLIENT_DETAIL_ROW;
      if (!row?.companyId) return;
      const isNew = Boolean(toggle.checked);
      toggle.disabled = true;
      try {
        await window.TCompanyUserState.setNewState(row.companyId, isNew);
        window.TDetailPanel?.refreshTabs?.();
        if (typeof window.refreshViews === "function") window.refreshViews();
      } catch (err) {
        console.warn("[user-state] setNewState failed", err);
        toggle.checked = !isNew;
      } finally {
        toggle.disabled = false;
      }
    });
  }

  window.TDetailPanel = {
    poolClassOf,
    poolClassBadge,
    poolClassLabel,
    isAccountNew: isRowAccountNew,
    newBadge,
    rowMatchesNewTab,
    rowMatchesRecommendedTab,
    rowMatchesInProgressTab,
    rowMatchesExcludedTab,
    renderTabPanels,
    syncNewToggle,
    refreshTabs: () => renderTabPanels(window.__TCLIENT_ACTIVE_TAB ?? "in_progress"),
    open,
    close,
    paint,
    setDetailLoading,
    bind
  };
})();
