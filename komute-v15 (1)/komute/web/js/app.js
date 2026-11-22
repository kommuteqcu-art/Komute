// App start-up, page switching (#plan, #results, #saved, #guide, #fares), language switch, and "Find routes".
(function (K) {
  const S = K.state;
  const VIEWS = ["plan", "results", "saved", "guide", "fares"];

  async function requestPlan() {
    S.requested = true;
    S.ai = { loading: true, error: null, plan: "", guide: null, sources: [], grounded: false, language: K.lang };
    K.results.render();
    try {
      const r = await K.api.planCommute({
        originText: S.origin, destinationText: S.destination,
        origin: S.originPoint, destination: S.destinationPoint,
        beginnerMode: S.newCommuterMode, language: K.lang
      });
      S.ai = { loading: false, error: null, plan: r.plan, guide: r.guide, sources: r.sources, grounded: r.grounded, language: r.language || K.lang };
    } catch (e) {
      S.ai = { loading: false, error: e.message, plan: "", guide: null, sources: [], grounded: false, language: K.lang };
    }
    if (currentView() === "results") K.results.render();
  }

  function findRoutes() {
    if (!S.destination.trim() || !S.origin.trim()) return;
    K.recent.add(S);
    location.hash = "#results";
    requestPlan();
  }

  function currentView() {
    const v = (location.hash || "#plan").slice(1);
    return VIEWS.includes(v) ? v : "plan";
  }

  function route() {
    const v = currentView();
    if (v === "results" && !S.requested) { location.hash = "#plan"; return; }
    if (v !== "results" && K.navigate.active()) K.navigate.stop();
    VIEWS.forEach((name) => document.getElementById("view-" + name).classList.toggle("d-none", name !== v));
    document.body.dataset.view = v;
    const navKey = v === "results" ? "plan" : v;
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const on = a.dataset.nav === navKey;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    ({ plan: K.home, results: K.results, saved: K.saved, guide: K.guide, fares: K.fares })[v].show();
    window.scrollTo(0, 0);
  }

  function setLanguage(lang) {
    K.setLang(lang);
    document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === K.lang)));
    K.guide.relabel(); K.fares.relabel(); K.saved.init(); K.home.relabel(); K.results.relabel();
  }

  K.app = { findRoutes, requestPlan, currentView };

  document.addEventListener("DOMContentLoaded", () => {
    K.applyI18n();
    document.querySelectorAll("[data-lang]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.lang === K.lang));
      b.onclick = () => setLanguage(b.dataset.lang);
    });
    const box = document.getElementById("welcome");
    if (K.store.get("welcomeHidden", false)) box.classList.add("d-none");
    document.getElementById("btnWelcomeClose").onclick = () => { box.classList.add("d-none"); K.store.set("welcomeHidden", true); };

    K.home.init(); K.results.init(); K.saved.init(); K.guide.init(); K.fares.init(); K.navigate.init();
    window.addEventListener("hashchange", route);
    route();
  });
})(window.Komute);
