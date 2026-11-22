// "Buses near your trip": city bus routes (and the EDSA Carousel) whose main roads pass near your start and destination.
// This is a guide based on main roads, not live bus tracking.
(function (K) {
  const S = K.state;
  const NEAR = 1500; // meters

  function near(route, p) {
    const t = K.data().transit;
    let best = Infinity;
    for (const a of route.anchors) {
      const pts = a === "edsa"
        ? t.stations.filter((s) => s.line === "EDSA Carousel").map((s) => ({ latitude: s.lat, longitude: s.lng }))
        : t.anchors[a] ? [{ latitude: t.anchors[a][0], longitude: t.anchors[a][1] }] : [];
      for (const q of pts) best = Math.min(best, K.geo.dist(p, q));
    }
    return best;
  }

  function pick(a, b) {
    const list = K.data().transit.busRoutes.map((r) => ({ r, da: near(r, a), db: near(r, b) }));
    const both = list.filter((x) => x.da < NEAR && x.db < NEAR).sort((x, y) => x.da + x.db - (y.da + y.db));
    if (both.length) return { kind: "both", items: both.slice(0, 5) };
    const start = list.filter((x) => x.da < NEAR).sort((x, y) => x.da - y.da);
    return { kind: "start", items: start.slice(0, 4) };
  }

  async function render(el) {
    if (!el) return;
    el.innerHTML = "";
    let a, b;
    try {
      [a, b] = await Promise.all([K.fareEstimate.resolve(S.origin, S.originPoint), K.fareEstimate.resolve(S.destination, S.destinationPoint)]);
    } catch { return; }
    if (!a || !b) return;
    const res = pick(a, b);
    const q = K.data().transit.qcityBus;
    el.innerHTML = `<div class="k-card k-buses">
      <h2 class="h5"><i class="bi bi-bus-front"></i> ${K.esc(K.t("bus.title"))}</h2>
      <p class="small text-muted mb-2">${K.esc(K.t(res.items.length ? (res.kind === "both" ? "bus.both" : "bus.start") : "bus.none"))}</p>
      ${res.items.map(({ r, da }) => `<div class="k-bus${r.carousel ? " carousel" : ""}">
          <span class="k-bus-no">${K.esc(r.no)}</span>
          <div><div class="fw-semibold">${K.esc(r.name)}</div><div class="small text-muted">${K.esc(K.t("bus.via", { v: r.via }))}</div>
          ${r.carousel ? `<div class="small">${K.esc(K.t("ta.carouselTip"))}</div>` : ""}
          <div class="small k-bus-dist">${K.esc(K.t("bus.walk", { d: K.fmt.dist(da) }))}</div></div></div>`).join("")}
      <div class="k-bus qcity"><span class="k-bus-no"><i class="bi bi-gift"></i></span>
        <div><div class="fw-semibold">${K.esc(K.t("bus.qcity"))}</div><div class="small text-muted">${K.esc(K.t("bus.qcitySub"))} <a href="#fares">${K.esc(K.t("bus.seeRoutes"))}</a></div></div></div>
      <p class="small text-muted mt-2 mb-0">${K.esc(K.t("bus.note"))} <a href="${K.esc(q.link)}" target="_blank" rel="noopener noreferrer">quezoncity.gov.ph</a></p>
    </div>`;
  }

  K.buses = { render, pick };
})(window.Komute);
