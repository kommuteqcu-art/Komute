// Results screen: map on top, bottom sheet with the AI commute guide, road routes, compass, and fares.
(function (K) {
  const S = K.state;
  const $ = (id) => document.getElementById(id);
  let km = null, mapAttempted = false;

  async function loadMap() {
    if (mapAttempted) return;
    await K.maps.load();
    if (mapAttempted || K.app.currentView() !== "results") return;
    mapAttempted = true;
    $("tripMap").replaceChildren();
    km = K.maps.create("tripMap");
    if (km) {
      km.bindCompass($("tripCompass"), () => K.compass.start());
      km.labelStyle($("tripStyleBtn"));
      $("tripStyleBtn").onclick = () => km.nextStyle($("tripStyleBtn"));
      km.setTransit(km.transitOn(), $("tripTransitBtn"));
      $("tripTransitBtn").onclick = () => km.setTransit(!km.transitOn(), $("tripTransitBtn"));
      km.onStation((st) => km.popup(st.lngLat, `<div class="k-pop"><div class="k-pop-addr"><span class="k-legend-dot" style="background:${K.esc(st.color)}"></span> ${K.esc(st.name)}</div>
        <div class="small text-muted">${K.esc(st.line)}${st.routes ? " · " + K.esc(K.t("pt.routes", { r: st.routes })) : ""}</div>
        ${st.kind === "carousel" ? `<div class="small text-muted">${K.esc(K.t("ta.carouselTip"))}</div>` : ""}</div>`));
      $("tripMapOptions").classList.remove("d-none");
      $("btnMyLoc").classList.remove("d-none");
      K.routeView.attachMap(km);
      K.dirCompass.mount($("dirCompass"), km);
    } else {
      $("tripMapOptions").classList.add("d-none");
      $("btnMyLoc").classList.add("d-none");
    }
  }

  function init() {
    $("btnBack").onclick = () => { location.hash = "#plan"; };
    $("btnSwap").onclick = swap;
    $("btnMyLoc").onclick = locate;
    document.querySelectorAll("[data-mode]").forEach((b) => { b.onclick = () => K.routeView.setMode(b.dataset.mode); });
    K.bindTabs($("travelModes"));
    $("btnViewRoutes").onclick = () => goTo("navSheet", "routeHeading");
    $("btnViewMap").onclick = () => goTo("tripMapSection");
    for (const panel of document.querySelectorAll(".k-trip-mapbar details, #tripMapOptions")) {
      panel.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !panel.open) return;
        panel.open = false;
        panel.querySelector("summary").focus();
      });
    }
  }

  function goTo(id, heading = id) {
    const edge = $(id).getBoundingClientRect().top + window.scrollY;
    const offset = document.querySelector(".k-header").offsetHeight + 8;
    $(heading).focus({ preventScroll: true });
    window.scrollTo({ top: Math.max(0, edge - offset), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  function swap() {
    [S.origin, S.destination] = [S.destination, S.origin];
    [S.originPoint, S.destinationPoint] = [S.destinationPoint, S.originPoint];
    $("origin").value = S.origin; $("destination").value = S.destination;
    K.app.requestPlan();
    show();
  }

  let unGps = null;
  function locate() {
    if (!km) return;
    if (K.gps.last) km.map.easeTo({ center: K.geo.ll(K.gps.last.p), zoom: 16, duration: 600 });
    if (unGps) return;
    let first = !K.gps.last;
    unGps = K.gps.watch((f, err) => {
      if (err) { $("btnMyLoc").classList.add("text-danger"); return; }
      km.setMe(f.p, f.acc, K.compass.heading ?? undefined);
      if (first) { first = false; km.map.easeTo({ center: K.geo.ll(f.p), zoom: 16, duration: 600 }); }
    });
    K.compass.on(() => { if (K.gps.last && !K.navigate.active()) km.setMe(K.gps.last.p, K.gps.last.acc, K.compass.heading); });
  }

  function show() {
    $("navFrom").textContent = $("navFrom").title = K.fmt.first(S.origin);
    $("navTo").textContent = $("navTo").title = K.fmt.first(S.destination);
    K.routeView.setMode("commute");
    K.dirCompass.mount($("dirCompass"), km);
    render();
    K.fareEstimate.update($("resultsFare"));
    K.buses.render($("busesBox"));
    K.feedback.reset();
    K.routeView.show(km);
    loadMap();
  }

  function render() {
    const ai = S.ai, body = $("planBody"), sources = $("planSources");
    sources.innerHTML = "";
    $("planTools").classList.add("d-none");
    $("fbRate").classList.add("d-none");
    if (ai.loading || ai.error || (!ai.plan && !ai.guide)) K.routeView.setCommute([], 0);
    if (ai.loading) {
      $("groundNote").textContent = "";
      body.innerHTML = `<div class="k-loading">
        <div class="spinner-border text-primary" role="status" aria-hidden="true"></div>
        <div><strong>${K.esc(K.t("res.loading"))}</strong><div class="small text-muted">${K.esc(K.t("res.loadingSub"))}</div></div></div>
        <div class="k-skel"></div><div class="k-skel"></div>`;
      return;
    }
    if (ai.error && (ai.code === "login" || ai.code === "pay" || ai.code === "expired")) {
      $("groundNote").textContent = "";
      const pay = ai.code === "pay";
      body.innerHTML = `<div class="k-card k-paywall text-center">
        <i class="bi ${pay ? "bi-stars" : "bi-person-circle"} k-paywall-icon"></i>
        <p class="fw-semibold mb-3">${K.esc(ai.error)}</p>
        <button id="btnAcct" class="btn btn-primary" type="button">${K.esc(K.t(pay ? "acct.getUnlimited" : "acct.signIn"))}</button></div>`;
      $("btnAcct").onclick = () => K.account.open(ai.error);
      return;
    }
    if (ai.error) {
      $("groundNote").textContent = "";
      body.innerHTML = `<div class="alert alert-danger" role="alert"><i class="bi bi-exclamation-octagon"></i> ${K.esc(ai.error)}</div>
        <button id="btnRetry" class="btn btn-primary" type="button"><i class="bi bi-arrow-clockwise"></i> ${K.esc(K.t("res.retry"))}</button>
        <p class="small text-muted mt-2">${K.esc(K.t("res.errorHelp"))}</p>`;
      $("btnRetry").onclick = () => K.app.requestPlan();
      return;
    }
    if (!ai.plan && !ai.guide) { body.innerHTML = ""; return; }

    $("groundNote").textContent = K.t(ai.model === "komute-route-data" ? "res.routeData" : ai.grounded ? "res.grounded" : "res.notGrounded");
    const otherLang = ai.language && ai.language !== K.lang;
    body.innerHTML = (otherLang ? `<div class="alert k-info small d-flex align-items-center gap-2"><i class="bi bi-translate"></i><span class="flex-grow-1">${K.esc(K.t("res.otherLang"))}</span>
        <button type="button" id="btnRelang" class="btn btn-sm btn-primary">${K.esc(K.t("res.makeAgain"))}</button></div>` : "") +
      `<div class="k-plan">${K.planView.render(ai)}</div>`;
    K.planView.bind(body, ai, K.routeView.setCommute);
    if (ai.guide?.endpoints && !$("resultsFare").querySelector(".k-fare-row")) K.fareEstimate.update($("resultsFare"));
    if (K.tour) K.tour.onResults(); // the step-by-step guide continues here the first time
    if (otherLang) $("btnRelang").onclick = () => K.app.requestPlan();
    $("planTools").classList.remove("d-none");
    $("fbRate").classList.remove("d-none");
    $("btnAgain").onclick = () => K.app.requestPlan();
    $("btnSharePlan").onclick = async () => {
      const text = K.planView.shareText(ai);
      try {
        if (navigator.share) await navigator.share({ title: "Komute", text });
        else { await navigator.clipboard.writeText(text); $("btnSharePlan").innerHTML = `<i class="bi bi-check2"></i> ${K.esc(K.t("route.copied"))}`; }
      } catch { /* cancelled */ }
    };

    const safe = ai.sources.filter((s) => /^https?:\/\//i.test(s.url || ""));
    if (safe.length) {
      sources.innerHTML = `<h4 class="h6">${K.esc(K.t("res.sources"))}</h4>` +
        safe.map((s) => `<a class="k-src" href="${K.esc(s.url)}" target="_blank" rel="noopener noreferrer">
          <span>${K.esc(s.title || "Google Maps")}</span><i class="bi bi-box-arrow-up-right"></i></a>`).join("");
    }
  }

  function relabel() {
    if (K.app.currentView() !== "results") return;
    render();
    K.dirCompass.mount($("dirCompass"), km);
    K.fareEstimate.update($("resultsFare"));
    K.buses.render($("busesBox"));
    K.routeView.setMode(K.routeView.mode());
    if (km) km.labelStyle($("tripStyleBtn"));
  }

  K.results = { init, show, render, relabel, kmap: () => km };
})(window.Komute);
