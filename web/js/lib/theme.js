// Light, Dark, or System (follows the phone or computer setting). Saved on this device.
// The page already got the right theme from the small script at the top of index.html (no white flash);
// this file keeps it up to date, runs the button in the header (each tap: Light, Dark, System), and tells the maps when to change.
(function (K) {
  const MODES = ["light", "dark", "system"];
  const ICON = { light: "bi-sun-fill", dark: "bi-moon-stars-fill", system: "bi-circle-half" };
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const listeners = [];
  let lastDark = null;

  const mode = () => { const m = K.store.get("theme", "system"); return MODES.includes(m) ? m : "system"; };
  const isDark = () => mode() === "dark" || (mode() === "system" && !!mq && mq.matches);

  function apply() {
    const m = mode(), dark = isDark(), root = document.documentElement;
    root.setAttribute("data-bs-theme", dark ? "dark" : "light");
    root.setAttribute("data-theme-mode", m);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0c2621" : "#004d40");
    document.querySelectorAll("[data-theme-set]").forEach((b) => {
      const on = b.dataset.themeSet === m;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
    const icon = document.getElementById("themeIcon");
    if (icon) icon.className = "bi " + ICON[m];
    const btn = document.getElementById("themeBtn");
    if (btn && K.t) {
      const label = `${K.t("theme.label")} (${K.t("theme." + m)})`;
      btn.setAttribute("aria-label", label);
      btn.title = label;
    }
    if (lastDark !== null && lastDark !== dark) listeners.forEach((f) => { try { f(dark); } catch (e) { console.warn(e); } });
    lastDark = dark;
  }

  K.theme = {
    mode, isDark, apply,
    set(m) { if (MODES.includes(m)) { K.store.set("theme", m); apply(); } },
    onChange(f) { listeners.push(f); }
  };

  if (mq) { if (mq.addEventListener) mq.addEventListener("change", apply); else if (mq.addListener) mq.addListener(apply); }
  window.addEventListener("storage", (e) => { if (e.key === "komute.theme") apply(); }); // changed in another tab
  // Tap the theme button: Light -> Dark -> System -> Light, with a short note saying which one is on
  const NEXT = { light: "dark", dark: "system", system: "light" };
  let noteTimer = null;
  function showNote() {
    let el = document.getElementById("themeNote");
    if (!el) {
      el = document.createElement("div");
      el.id = "themeNote"; el.className = "k-theme-note"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    const m = mode();
    el.innerHTML = `<i class="bi ${ICON[m]}"></i> ${K.esc(K.t("theme.label"))}: <b>${K.esc(K.t("theme." + m))}</b>` +
      (m === "system" ? `<small>${K.esc(K.t("theme.systemSub"))}</small>` : "");
    el.classList.add("show");
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => el.classList.remove("show"), 1800);
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("#themeBtn, [data-theme-set]");
    if (!b) return;
    K.theme.set(b.dataset.themeSet || NEXT[mode()]);
    showNote();
  });
  apply();
  document.addEventListener("DOMContentLoaded", apply);
})(window.Komute);
