/**
 * Meeting date / time / duration pickers — calendar + column scroll UI.
 */
(function () {
  const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

  function escapeHtml(value) {
    return `${value ?? ""}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function parseIsoDate(str) {
    if (!str) return null;
    const [y, mo, d] = `${str}`.split("-").map(Number);
    if (![y, mo, d].every(Number.isFinite)) return null;
    const dt = new Date(y, mo - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  function dateToIso(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatDateLabel(iso) {
    const d = parseIsoDate(iso);
    if (!d) return "날짜 선택";
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}(${DAY_NAMES[d.getDay()]})`;
  }

  function time24ToParts(time24) {
    if (!time24 || !`${time24}`.includes(":")) return { period: "", hour: "", minute: "" };
    const [h, m] = `${time24}`.split(":").map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return { period: "", hour: "", minute: "" };
    const period = h < 12 ? "am" : "pm";
    const hour12 = h % 12 || 12;
    const minute = m >= 45 ? "0" : m >= 15 ? "30" : "0";
    return { period, hour: String(hour12), minute };
  }

  function composeTime24(period, hour12, minute) {
    if (!period || !hour12 || minute === "") return "";
    const h12 = Number.parseInt(hour12, 10);
    const mm = Number.parseInt(minute, 10);
    if (!Number.isFinite(h12) || h12 < 1 || h12 > 12 || ![0, 30].includes(mm)) return "";
    let h24;
    if (period === "am") h24 = h12 === 12 ? 0 : h12;
    else h24 = h12 === 12 ? 12 : h12 + 12;
    return `${pad(h24)}:${pad(mm)}`;
  }

  function formatTimeLabel(time24) {
    if (!time24 || !`${time24}`.includes(":")) return "시간 선택";
    const parts = time24ToParts(time24);
    if (!parts.period || !parts.hour || parts.minute === "") return "시간 선택";
    const period = parts.period === "am" ? "오전" : "오후";
    return `${period} ${parts.hour}:${pad(Number.parseInt(parts.minute, 10))}`;
  }

  function formatTimeDraft(period, hour, minute) {
    if (!period || !hour || minute === "") return "시간 선택";
    const p = period === "am" ? "오전" : "오후";
    return `${p} ${hour}:${pad(Number.parseInt(minute, 10))}`;
  }

  function durationToParts(hours) {
    const n = Number.parseFloat(hours);
    if (!Number.isFinite(n) || n <= 0) return { hours: "", minute: "" };
    const whole = Math.floor(n);
    const half = n - whole >= 0.49;
    return { hours: String(whole), minute: half ? "30" : "0" };
  }

  function composeDurationHours(hoursStr, minuteStr) {
    const whole = hoursStr === "" ? NaN : Number.parseInt(hoursStr, 10);
    if (!Number.isFinite(whole) || whole < 0) return "";
    const extra = minuteStr === "30" ? 0.5 : 0;
    const total = whole + extra;
    return total > 0 ? String(total) : "";
  }

  function formatDurationLabel(hours) {
    const n = Number.parseFloat(hours);
    if (!Number.isFinite(n) || n <= 0) return "소요 선택";
    if (n === 0.5) return "30분";
    const whole = Math.floor(n);
    const half = n - whole >= 0.49;
    if (half && whole === 0) return "30분";
    if (half) return `${whole}시간 30분`;
    return `${whole}시간`;
  }

  function formatDurationDraft(hoursStr, minuteStr) {
    const val = composeDurationHours(hoursStr, minuteStr);
    return val ? formatDurationLabel(val) : "소요 선택";
  }

  const PERIOD_ITEMS = [
    { val: "am", label: "오전" },
    { val: "pm", label: "오후" }
  ];
  const HOUR_ITEMS = Array.from({ length: 12 }, (_, i) => {
    const v = String(i + 1);
    return { val: v, label: v };
  });
  const MINUTE_ITEMS = [
    { val: "0", label: "00" },
    { val: "30", label: "30" }
  ];
  const DURATION_HOUR_ITEMS = Array.from({ length: 9 }, (_, i) => ({
    val: String(i),
    label: i === 0 ? "0" : String(i)
  }));

  function renderColumn(items, selected, dataAttr) {
    return `<div class="mpicker-col">
      <div class="mpicker-col-scroll">
        ${items
          .map(({ val, label }) => {
            const on = `${val}` === `${selected}` ? " is-selected" : "";
            return `<button type="button" class="mpicker-col-item${on}" data-${dataAttr}="${escapeAttr(val)}">${escapeHtml(label)}</button>`;
          })
          .join("")}
      </div>
    </div>`;
  }

  function renderCalendarGrid(viewYear, viewMonth, selectedIso) {
    const first = new Date(viewYear, viewMonth, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = dateToIso(today);
    let cells = "";
    for (let i = 0; i < startDay; i++) {
      cells += `<span class="mpicker-cal-spacer" aria-hidden="true"></span>`;
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
      const isToday = iso === todayIso;
      const isSelected = iso === selectedIso;
      const cls = ["mpicker-cal-day", isToday ? "is-today" : "", isSelected ? "is-selected" : ""].filter(Boolean).join(" ");
      cells += `<button type="button" class="${cls}" data-cal-day="${iso}">${day}${isToday ? '<span class="mpicker-cal-today">오늘</span>' : ""}</button>`;
    }
    return cells;
  }

  function renderDatePicker(value, { id = "" } = {}) {
    const selected = `${value ?? ""}`.trim();
    const view = parseIsoDate(selected) || new Date();
    const vy = view.getFullYear();
    const vm = view.getMonth();
    const idAttr = id ? ` data-mpicker-id="${escapeAttr(id)}"` : "";
    return `<div class="mpicker mpicker-date" data-meeting-field="date"${idAttr} data-value="${escapeAttr(selected)}" data-view-year="${vy}" data-view-month="${vm}">
      <button type="button" class="mpicker-trigger" aria-haspopup="dialog" aria-expanded="false">${escapeHtml(formatDateLabel(selected))}</button>
      <div class="mpicker-panel mpicker-panel-date hidden" role="dialog">
        <div class="mpicker-cal-head">
          <button type="button" class="mpicker-cal-nav" data-cal-nav="-1" aria-label="이전 달">‹</button>
          <span class="mpicker-cal-title">${vy}. ${vm + 1}</span>
          <button type="button" class="mpicker-cal-nav" data-cal-nav="1" aria-label="다음 달">›</button>
        </div>
        <div class="mpicker-cal-weekdays">${DAY_NAMES.map((d) => `<span>${d}</span>`).join("")}</div>
        <div class="mpicker-cal-grid">${renderCalendarGrid(vy, vm, selected)}</div>
      </div>
    </div>`;
  }

  function renderTimePicker(value) {
    const selected = `${value ?? ""}`.trim();
    const parts = time24ToParts(selected);
    const draftPeriod = parts.period || "am";
    const draftHour = parts.hour || "9";
    const draftMinute = parts.minute !== "" ? parts.minute : "0";
    const preview = formatTimeDraft(draftPeriod, draftHour, draftMinute);
    return `<div class="mpicker mpicker-time" data-meeting-field="time" data-value="${escapeAttr(selected)}"
      data-draft-period="${escapeAttr(draftPeriod)}" data-draft-hour="${escapeAttr(draftHour)}" data-draft-minute="${escapeAttr(draftMinute)}">
      <button type="button" class="mpicker-trigger" aria-haspopup="dialog" aria-expanded="false">${escapeHtml(formatTimeLabel(selected))}</button>
      <div class="mpicker-panel mpicker-panel-columns hidden" role="dialog">
        <div class="mpicker-col-preview">${escapeHtml(preview)}</div>
        <div class="mpicker-columns mpicker-columns-3">
          ${renderColumn(PERIOD_ITEMS, draftPeriod, "time-period")}
          ${renderColumn(HOUR_ITEMS, draftHour, "time-hour")}
          ${renderColumn(MINUTE_ITEMS, draftMinute, "time-minute")}
        </div>
        <div class="mpicker-col-foot">
          <button type="button" class="mpicker-confirm">확인</button>
        </div>
      </div>
    </div>`;
  }

  function renderDurationPicker(value) {
    const n = Number.parseFloat(value);
    const selected = Number.isFinite(n) && n > 0 ? String(n) : "";
    const parts = durationToParts(selected);
    const draftHours = parts.hours !== "" ? parts.hours : "1";
    const draftMinute = parts.minute !== "" ? parts.minute : "0";
    const preview = formatDurationDraft(draftHours, draftMinute);
    return `<div class="mpicker mpicker-duration" data-meeting-field="duration" data-value="${escapeAttr(selected)}"
      data-draft-hours="${escapeAttr(draftHours)}" data-draft-minute="${escapeAttr(draftMinute)}">
      <button type="button" class="mpicker-trigger" aria-haspopup="dialog" aria-expanded="false">${escapeHtml(formatDurationLabel(selected))}</button>
      <div class="mpicker-panel mpicker-panel-columns hidden" role="dialog">
        <div class="mpicker-col-preview">${escapeHtml(preview)}</div>
        <div class="mpicker-columns mpicker-columns-2">
          ${renderColumn(DURATION_HOUR_ITEMS, draftHours, "duration-hours")}
          ${renderColumn(MINUTE_ITEMS, draftMinute, "duration-minute")}
        </div>
        <div class="mpicker-col-foot">
          <button type="button" class="mpicker-confirm">확인</button>
        </div>
      </div>
    </div>`;
  }

  function isoToParts(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    let y = d.getFullYear();
    let mo = d.getMonth() + 1;
    let day = d.getDate();
    let h = d.getHours();
    let m = d.getMinutes();
    if (m < 15) m = 0;
    else if (m < 45) m = 30;
    else {
      m = 0;
      h += 1;
      if (h >= 24) {
        const next = new Date(y, mo - 1, day + 1, 0, 0, 0, 0);
        y = next.getFullYear();
        mo = next.getMonth() + 1;
        day = next.getDate();
        h = 0;
      }
    }
    return { date: `${y}-${pad(mo)}-${pad(day)}`, time: `${pad(h)}:${pad(m)}` };
  }

  function parseMeetingDateTime(dateStr, timeStr) {
    const date = `${dateStr ?? ""}`.trim();
    const time = `${timeStr ?? ""}`.trim();
    if (!date || !time) return null;
    const [y, mo, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    if (![y, mo, d, hh, mm].every(Number.isFinite)) return null;
    const dt = new Date(y, mo - 1, d, hh, mm, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  function renderScheduleFields(iso, durationHours) {
    const parts = isoToParts(iso);
    return `<div class="meeting-schedule-fields">
      <div class="meeting-schedule-cell">
        <span class="meeting-schedule-kicker">일자</span>
        ${renderDatePicker(parts?.date ?? "")}
      </div>
      <div class="meeting-schedule-cell">
        <span class="meeting-schedule-kicker">시간</span>
        ${renderTimePicker(parts?.time ?? "")}
      </div>
      <div class="meeting-schedule-cell">
        <span class="meeting-schedule-kicker">소요</span>
        ${renderDurationPicker(durationHours)}
      </div>
    </div>`;
  }

  function readSchedule(root) {
    if (!root) return { meetingAt: null, durationHours: null };
    const date = `${root.querySelector('.mpicker[data-meeting-field="date"]')?.dataset.value ?? ""}`.trim();
    const time = `${root.querySelector('.mpicker[data-meeting-field="time"]')?.dataset.value ?? ""}`.trim();
    const durationRaw = `${root.querySelector('.mpicker[data-meeting-field="duration"]')?.dataset.value ?? ""}`.trim();
    const durationHours = durationRaw ? Number.parseFloat(durationRaw) : null;
    return {
      meetingAt: parseMeetingDateTime(date, time),
      durationHours: Number.isFinite(durationHours) && durationHours > 0 ? durationHours : null
    };
  }

  function positionPanel(trigger, panel) {
    const r = trigger.getBoundingClientRect();
    let w = 280;
    if (panel.classList.contains("mpicker-panel-date")) w = 280;
    else if (panel.querySelector(".mpicker-columns-3")) w = 188;
    else if (panel.querySelector(".mpicker-columns-2")) w = 156;
    w = Math.max(r.width, w);
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (left < 8) left = 8;
    panel.style.position = "fixed";
    panel.style.left = `${left}px`;
    panel.style.width = `${w}px`;
    panel.style.zIndex = "1600";
    panel.style.top = `${r.bottom + 4}px`;
    panel.classList.remove("mpicker-panel-flip");
    const panelH = panel.offsetHeight;
    if (r.bottom + 4 + panelH > window.innerHeight - 8) {
      const top = Math.max(8, r.top - panelH - 4);
      panel.style.top = `${top}px`;
      panel.classList.add("mpicker-panel-flip");
    }
  }

  let openPanelState = null;

  function portalPanel(panel, picker) {
    picker._mpickerPanel = panel;
    panel._mpickerHost = picker;
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
  }

  function restorePanel(panel) {
    const picker = panel._mpickerHost;
    if (picker && panel.parentElement === document.body && picker.isConnected) {
      picker.appendChild(panel);
    }
  }

  function repositionOpenPanel() {
    if (!openPanelState) return;
    const { trigger, panel } = openPanelState;
    if (!trigger.isConnected || panel.classList.contains("hidden")) return;
    positionPanel(trigger, panel);
  }

  function openPickerPanel(picker, trigger, panel) {
    portalPanel(panel, picker);
    panel.classList.remove("hidden");
    positionPanel(trigger, panel);
    openPanelState = { picker, trigger, panel };
    trigger.setAttribute("aria-expanded", "true");
  }

  function closeAllPanels(except) {
    document.querySelectorAll(".mpicker-panel").forEach((p) => {
      if (p === except && !p.classList.contains("hidden")) return;
      p.classList.add("hidden");
      restorePanel(p);
    });
    document.querySelectorAll(".mpicker-trigger").forEach((t) => {
      const open = except && openPanelState?.trigger === t && !except.classList.contains("hidden");
      t.setAttribute("aria-expanded", open ? "true" : "false");
    });
    openPanelState = except && !except.classList.contains("hidden") ? openPanelState : null;
  }

  function getPickerPanel(picker) {
    return picker._mpickerPanel || picker.querySelector(".mpicker-panel");
  }

  function syncDatePicker(picker) {
    const vy = Number.parseInt(picker.dataset.viewYear, 10);
    const vm = Number.parseInt(picker.dataset.viewMonth, 10);
    const selected = picker.dataset.value || "";
    const panel = getPickerPanel(picker);
    const title = panel?.querySelector(".mpicker-cal-title");
    const grid = panel?.querySelector(".mpicker-cal-grid");
    if (title) title.textContent = `${vy}. ${vm + 1}`;
    if (grid) grid.innerHTML = renderCalendarGrid(vy, vm, selected);
    const trigger = picker.querySelector(".mpicker-trigger");
    if (trigger) trigger.textContent = formatDateLabel(selected);
  }

  function scrollColumnSelections(panel) {
    panel.querySelectorAll(".mpicker-col-item.is-selected").forEach((el) => {
      el.scrollIntoView({ block: "nearest" });
    });
  }

  function syncTimeDraftUi(picker) {
    const period = picker.dataset.draftPeriod ?? "";
    const hour = picker.dataset.draftHour ?? "";
    const minute = picker.dataset.draftMinute ?? "";
    const panel = getPickerPanel(picker);
    const preview = panel?.querySelector(".mpicker-col-preview");
    if (preview) preview.textContent = formatTimeDraft(period, hour, minute);
    panel?.querySelectorAll("[data-time-period]").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.timePeriod === period);
    });
    panel?.querySelectorAll("[data-time-hour]").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.timeHour === hour);
    });
    panel?.querySelectorAll("[data-time-minute]").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.timeMinute === minute);
    });
  }

  function syncDurationDraftUi(picker) {
    const hours = picker.dataset.draftHours ?? "";
    const minute = picker.dataset.draftMinute ?? "";
    const panel = getPickerPanel(picker);
    const preview = panel?.querySelector(".mpicker-col-preview");
    if (preview) preview.textContent = formatDurationDraft(hours, minute);
    panel?.querySelectorAll("[data-duration-hours]").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.durationHours === hours);
    });
    panel?.querySelectorAll("[data-duration-minute]").forEach((el) => {
      el.classList.toggle("is-selected", el.dataset.durationMinute === minute);
    });
  }

  function resetDraftFromValue(picker) {
    const kind = picker.dataset.meetingField;
    if (kind === "time") {
      const parts = time24ToParts(picker.dataset.value || "");
      picker.dataset.draftPeriod = parts.period || "am";
      picker.dataset.draftHour = parts.hour || "9";
      picker.dataset.draftMinute = parts.minute !== "" ? parts.minute : "0";
      syncTimeDraftUi(picker);
    } else if (kind === "duration") {
      const parts = durationToParts(picker.dataset.value || "");
      picker.dataset.draftHours = parts.hours !== "" ? parts.hours : "1";
      picker.dataset.draftMinute = parts.minute !== "" ? parts.minute : "0";
      syncDurationDraftUi(picker);
    }
  }

  function commitTimePicker(picker, close = true) {
    const value = composeTime24(picker.dataset.draftPeriod, picker.dataset.draftHour, picker.dataset.draftMinute);
    picker.dataset.value = value;
    const trigger = picker.querySelector(".mpicker-trigger");
    if (trigger) trigger.textContent = formatTimeLabel(value);
    if (close) closeAllPanels();
  }

  function commitDurationPicker(picker, close = true) {
    const value = composeDurationHours(picker.dataset.draftHours, picker.dataset.draftMinute);
    picker.dataset.value = value;
    const trigger = picker.querySelector(".mpicker-trigger");
    if (trigger) trigger.textContent = formatDurationLabel(value);
    if (close) closeAllPanels();
  }

  function setPickerValue(picker, value, close = true) {
    picker.dataset.value = value || "";
    const kind = picker.dataset.meetingField;
    const trigger = picker.querySelector(".mpicker-trigger");
    if (kind === "date") {
      if (trigger) trigger.textContent = formatDateLabel(value);
      syncDatePicker(picker);
    } else if (kind === "time") {
      resetDraftFromValue(picker);
      if (trigger) trigger.textContent = formatTimeLabel(value);
    } else if (kind === "duration") {
      resetDraftFromValue(picker);
      if (trigger) trigger.textContent = formatDurationLabel(value);
    }
    if (close) closeAllPanels();
  }

  function bindPicker(picker) {
    if (picker.dataset.bound === "1") return;
    picker.dataset.bound = "1";
    const trigger = picker.querySelector(".mpicker-trigger");
    const panel = picker.querySelector(".mpicker-panel");
    picker._mpickerPanel = panel;
    panel._mpickerHost = picker;
    const kind = picker.dataset.meetingField;

    trigger?.addEventListener("click", (e) => {
      e.stopPropagation();
      document.querySelectorAll(".cselect-menu").forEach((m) => m.classList.add("hidden"));
      const willOpen = panel?.classList.contains("hidden");
      if (willOpen) {
        closeAllPanels();
        if (kind === "time" || kind === "duration") resetDraftFromValue(picker);
        openPickerPanel(picker, trigger, panel);
        scrollColumnSelections(panel);
      } else {
        panel?.classList.add("hidden");
        restorePanel(panel);
        openPanelState = null;
        trigger.setAttribute("aria-expanded", "false");
      }
    });

    panel?.addEventListener("click", (e) => {
      e.stopPropagation();

      if (kind === "date") {
        const nav = e.target.closest("[data-cal-nav]");
        if (nav) {
          let vy = Number.parseInt(picker.dataset.viewYear, 10);
          let vm = Number.parseInt(picker.dataset.viewMonth, 10);
          vm += Number.parseInt(nav.dataset.calNav, 10);
          if (vm < 0) {
            vm = 11;
            vy -= 1;
          } else if (vm > 11) {
            vm = 0;
            vy += 1;
          }
          picker.dataset.viewYear = String(vy);
          picker.dataset.viewMonth = String(vm);
          syncDatePicker(picker);
          return;
        }
        const dayBtn = e.target.closest("[data-cal-day]");
        if (dayBtn) {
          setPickerValue(picker, dayBtn.dataset.calDay);
        }
        return;
      }

      if (kind === "time") {
        const periodBtn = e.target.closest("[data-time-period]");
        if (periodBtn) {
          picker.dataset.draftPeriod = periodBtn.dataset.timePeriod;
          syncTimeDraftUi(picker);
          return;
        }
        const hourBtn = e.target.closest("[data-time-hour]");
        if (hourBtn) {
          picker.dataset.draftHour = hourBtn.dataset.timeHour;
          syncTimeDraftUi(picker);
          return;
        }
        const minuteBtn = e.target.closest("[data-time-minute]");
        if (minuteBtn) {
          picker.dataset.draftMinute = minuteBtn.dataset.timeMinute;
          syncTimeDraftUi(picker);
          return;
        }
        if (e.target.closest(".mpicker-confirm")) {
          commitTimePicker(picker);
        }
        return;
      }

      if (kind === "duration") {
        const hoursBtn = e.target.closest("[data-duration-hours]");
        if (hoursBtn) {
          picker.dataset.draftHours = hoursBtn.dataset.durationHours;
          syncDurationDraftUi(picker);
          return;
        }
        const minuteBtn = e.target.closest("[data-duration-minute]");
        if (minuteBtn) {
          picker.dataset.draftMinute = minuteBtn.dataset.durationMinute;
          syncDurationDraftUi(picker);
          return;
        }
        if (e.target.closest(".mpicker-confirm")) {
          commitDurationPicker(picker);
        }
      }
    });
  }

  function init(root = document) {
    root.querySelectorAll(".mpicker").forEach(bindPicker);
    if (!document.documentElement.dataset.mpickerCloseBound) {
      document.documentElement.dataset.mpickerCloseBound = "1";
      document.addEventListener("click", () => closeAllPanels());
      document.addEventListener("scroll", () => repositionOpenPanel(), true);
      window.addEventListener("resize", () => repositionOpenPanel(), { passive: true });
    }
  }

  function readDateValue(id, root = document) {
    const sel = id ? `.mpicker[data-mpicker-id="${id}"]` : '.mpicker[data-meeting-field="date"]';
    return `${root.querySelector(sel)?.dataset.value ?? ""}`.trim();
  }

  window.TMeetingPicker = {
    init,
    readSchedule,
    renderScheduleFields,
    renderDatePicker,
    readDateValue,
    closeAllPanels
  };
})();
