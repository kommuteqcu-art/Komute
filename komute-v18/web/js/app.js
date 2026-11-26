// App start-up, page switching (#plan, #results, #saved, #guide, #fares), language switch, and "Find routes".
(function (K) {
  const S = K.state;
  const VIEWS = ["plan", "results", "saved", "guide", "fares"];

  async function requestPlan() {
    S.requested = true;
    K.planView.setTab("commute");
    S.ai = { loading: true, error: null, plan: "", guide: null, sources: [], grounded: false, language: K.lang };
    K.results.render();
    try {
      let busHints = [];
      try {
        const [a, b] = await Promise.all([K.fareEstimate.resolve(S.origin, S.originPoint), K.fareEstimate.resolve(S.destination, S.destinationPoint)]);
        if (a && b) busHints = K.buses.pick(a, b).items.map(({ r }) => `Route ${r.no} ${r.name} via ${r.via}`);
      } catch { /* hints are optional */ }
      const r = await K.api.planCommute({
        originText: S.origin, destinationText: S.destination,
        origin: S.originPoint, destination: S.destinationPoint,
        beginnerMode: S.newCommuterMode, language: K.lang, busHints
      });
      S.ai = { loading: false, error: null, plan: r.plan, guide: r.guide, sources: r.sources, grounded: r.grounded, language: r.language || K.lang, model: r.model, transit: r.transit };
      if (K.account) K.account.update(r.account);
    } catch (e) {
      S.ai = { loading: false, error: e.message, code: e.code || "", plan: "", guide: null, sources: [], grounded: false, language: K.lang };
      if (K.account) K.account.blocked(e);
    }
    if (K.fareEstimate && document.getElementById("resultsFare")) K.fareEstimate.update(document.getElementById("resultsFare")); // fares follow the planned ride
    if (currentView() === "results") { K.results.render(); K.buses.render(document.getElementById("busesBox")); }
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
    K.guide.relabel(); K.fares.relabel(); K.saved.init(); K.home.relabel(); K.results.relabel(); K.feedback.relabel(); if (K.account) K.account.relabel();
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

    K.home.init(); K.results.init(); K.saved.init(); K.guide.init(); K.fares.init(); K.navigate.init(); K.feedback.init();
    try { if (K.account) K.account.init(); } catch (e) { console.warn("Account button not available:", e); }
    // Step-by-step guide for new users: offered once (first visit, not signed in); "Show me around" starts it again
    document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-tour-start]"); if (b && K.tour) K.tour.start(); });
    try { if (K.tour) K.tour.init(); } catch (e) { console.warn("Guide not available:", e); }
    window.addEventListener("hashchange", route);
    // Load the transit points in the background so terminals show up in search.
    K.api.loadBorder();
    setTimeout(() => K.api.transitPoints().catch(() => {}), 1500);
    route();
  });
})(window.Komute);
