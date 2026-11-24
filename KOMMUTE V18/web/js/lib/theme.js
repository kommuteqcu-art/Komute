// Light, dark, or default (follows the phone). One tap on the sun/moon button in the header.
(function (K) {
  const KEY = "theme";
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const ICON = { light: "bi-sun-fill", dark: "bi-moon-stars-fill", auto: "bi-circle-half" };
  let mode = K.store.get(KEY, "auto");
  if (!ICON[mode]) mode = "auto";

  const isDark = () => mode === "dark" || (mode === "auto" && Boolean(media && media.matches));

  function apply() {
    document.documentElement.setAttribute("data-bs-theme", isDark() ? "dark" : "light");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark() ? "#0a2a24" : "#004d40");
    const btn = document.getElementById("themeBtn");
    if (btn) { const i = btn.querySelector("i"); if (i) i.className = "bi " + ICON[mode]; }
    document.querySelectorAll("[data-theme]").forEach((b) => {
      const on = b.dataset.theme === mode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    document.dispatchEvent(new CustomEvent("komute:theme", { detail: { dark: isDark(), mode } }));
  }

  function set(next) { mode = ICON[next] ? next : "auto"; K.store.set(KEY, mode); apply(); }

  function init() {
    document.querySelectorAll("[data-theme]").forEach((b) => { b.onclick = () => set(b.dataset.theme); });
    if (media) {
      const onChange = () => { if (mode === "auto") apply(); };
      if (media.addEventListener) media.addEventListener("change", onChange); else if (media.addListener) media.addListener(onChange);
    }
    apply();
  }

  K.theme = { set, get: () => mode, isDark };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})(window.Komute);
