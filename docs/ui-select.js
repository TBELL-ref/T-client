/**
 * Custom dropdown for filter selects (replaces native option popup styling).
 */
(function () {
  function closeAllMenus(except) {
    document.querySelectorAll(".cselect-menu").forEach((m) => {
      if (m !== except) m.classList.add("hidden");
    });
  }

  function enhanceSelect(sel) {
    if (sel.dataset.cselect === "1") return;
    sel.dataset.cselect = "1";

    const wrap = document.createElement("div");
    wrap.className = "cselect";
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "cselect-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");

    const menu = document.createElement("ul");
    menu.className = "cselect-menu hidden";
    menu.setAttribute("role", "listbox");

    function syncTrigger() {
      const opt = sel.options[sel.selectedIndex];
      trigger.textContent = opt?.textContent?.trim() || "선택";
      menu.querySelectorAll(".cselect-opt").forEach((li) => {
        const on = li.dataset.value === sel.value;
        li.classList.toggle("active", on);
        li.setAttribute("aria-selected", on ? "true" : "false");
      });
    }

    [...sel.options].forEach((opt) => {
      const li = document.createElement("li");
      li.className = "cselect-opt";
      li.dataset.value = opt.value;
      li.textContent = opt.textContent;
      li.setAttribute("role", "option");
      li.tabIndex = -1;
      li.addEventListener("click", (e) => {
        e.stopPropagation();
        sel.value = opt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        sel.dispatchEvent(new Event("input", { bubbles: true }));
        menu.classList.add("hidden");
        trigger.setAttribute("aria-expanded", "false");
        syncTrigger();
      });
      menu.appendChild(li);
    });

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle("hidden");
      trigger.setAttribute("aria-expanded", open ? "false" : "true");
      if (!open) closeAllMenus(menu);
    });

    wrap.appendChild(trigger);
    wrap.appendChild(menu);
    syncTrigger();
  }

  function init(root = document) {
    root.querySelectorAll("select.select-pill").forEach(enhanceSelect);
  }

  document.addEventListener("click", () => closeAllMenus());

  window.TUiSelect = { init, enhanceSelect };
})();
