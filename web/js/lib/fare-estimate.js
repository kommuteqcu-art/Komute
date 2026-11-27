// Fare estimate for a trip: jeepney, bus, train, UV Express, motorcycle taxi, taxi, Grab.
// Uses the road distance from the route when known, otherwise straight-line distance x 1.3.
(function (K) {
  const S = K.state, cache = {};
  const updates = new WeakMap();

  async function resolve(text, point) {
    if (point) return point;
    if (!text || !text.trim()) return null;
    if (cache[text]) return cache[text];
    const s = (await K.api.searchPlaces(text, null))[0];
    return s ? (cache[text] = { latitude: s.location.latitude, longitude: s.location.longitude, label: s.label }) : null;
  }

  const L = (o) => K.L(o);
  const puv = (m, km) => K.fmt.quarter(m.base + Math.max(0, Math.ceil(km) - m.coverKm) * m.perKm);
  const discount = (n) => K.fmt.quarter(n * 0.8);

  function nearestStation(p, line) {
    let best = null;
    for (const st of K.data().transit.stations) {
      if (line && st.line !== line) continue;
      const d = K.geo.dist(p, { latitude: st.lat, longitude: st.lng });
      if (!best || d < best.d) best = { st, d };
    }
    return best;
  }

  // Train fare when both ends are within a short walk of stations on the same line.
  function trainRow(a, b) {
    const f = K.data().fares;
    for (const line of ["MRT-3", "LRT-2", "LRT-1"]) {
      const x = nearestStation(a, line), y = nearestStation(b, line);
      if (!x || !y || x.st.idx === y.st.idx || x.d > 1300 || y.d > 1300) continue;
      const label = `${line}: ${x.st.name} → ${y.st.name}`;
      if (line === "MRT-3") {
        const pair = f.mrt3.pairs.find(([i, j]) => (i === x.st.idx && j === y.st.idx) || (j === x.st.idx && i === y.st.idx));
        if (pair) return { icon: "bi-train-front", name: label, price: K.fmt.peso(pair[2] / 2), sub: K.t("fare.regularWas", { p: K.fmt.peso(pair[2]) }), disc: K.fmt.peso(pair[2] / 2) };
      }
      if (line === "LRT-2") return { icon: "bi-train-lightrail-front", name: label, price: K.t("fare.from", { p: "₱6.50" }), sub: K.t("fare.lrt2Poster"), disc: "" };
      if (line === "LRT-1") {
        const trip = f.lrt1.trips.find((t) => t.trip.includes(x.st.name) && t.trip.includes(y.st.name));
        if (trip) return { icon: "bi-train-lightrail-front", name: label, price: K.fmt.peso(trip.beep), sub: K.t("fare.beepSjt", { b: K.fmt.peso(trip.beep), s: K.fmt.peso(trip.sjt) }), disc: "" };
      }
    }
    return null;
  }

  function rows(a, b) {
    const f = K.data().fares.estimate;
    const km = S.road && S.road.km ? S.road.km : (K.geo.dist(a, b) / 1000) * f.roadDetourFactor;
    const min = S.road && S.road.min ? S.road.min : (km / f.trafficKmh) * 60;
    const out = { km, groups: [] };

    out.groups.push({ title: K.t("fare.group.free"), items: [
      { icon: "bi-gift", name: "Q City Bus", price: K.t("fare.free"), sub: K.t("fare.qcbusIf"), disc: "", free: true }] });

    const names = { jeep: "fare.m.jeep", mjeep: "fare.m.mjeep", bus: "fare.m.bus", abus: "fare.m.abus" };
    const icons = { jeep: "bi-truck-front", mjeep: "bi-truck-front-fill", bus: "bi-bus-front", abus: "bi-bus-front-fill" };
    out.groups.push({ title: K.t("fare.group.puv"), items: f.puv.map((m) => {
      const p = puv(m, km);
      return { icon: icons[m.id], name: K.t(names[m.id]), price: K.fmt.peso(p), disc: K.fmt.peso(discount(p)) };
    }) });
    const train = trainRow(a, b);
    if (train) out.groups[1].items.push(train);
    out.groups[1].items.push({ icon: "bi-car-front", name: "UV Express", price: K.fmt.range(km * f.uv.perKm[0], km * f.uv.perKm[1]), sub: K.t("fare.provisional"), disc: "" });

    const mc = f.mcTaxi;
    const mcPrice = mc.base + Math.max(0, Math.min(km, mc.afterKm) - mc.coverKm) * mc.perKm + Math.max(0, km - mc.afterKm) * mc.perKmAfter;
    const taxi = (t, mins) => t.flag + km * t.perKm + mins * t.perMin;
    out.groups.push({ title: K.t("fare.group.door"), items: [
      { icon: "bi-scooter", name: K.t("fare.m.mc"), price: K.fmt.range(mcPrice * 0.95, mcPrice * 1.15), sub: K.t("fare.appPrice"), disc: "" },
      { icon: "bi-taxi-front", name: K.t("fare.m.taxi"), price: K.fmt.range(taxi(f.taxi, min), taxi(f.taxi, min * 1.6)), sub: K.t("fare.traffic"), disc: "" },
      { icon: "bi-phone", name: K.t("fare.m.tnvs"), price: K.fmt.range(taxi(f.tnvs, min), taxi(f.tnvs, min * 1.6) + 30), sub: K.t("fare.surge"), disc: "" }
    ] });
    return out;
  }

  function html(r) {
    const groups = r.groups.map((g) => `<div class="k-fare-group">${K.esc(g.title)}</div>` + g.items.map((it) => `
      <div class="k-fare-row${it.free ? " free" : ""}"><i class="bi ${it.icon}"></i>
        <span class="k-fare-name">${K.esc(it.name)}${it.sub ? `<small>${K.esc(it.sub)}</small>` : ""}</span>
        <span class="k-fare-price"><strong>${K.esc(it.price)}</strong>${it.disc ? `<small>${K.esc(K.t("fare.discShort", { p: it.disc }))}</small>` : ""}</span>
      </div>`).join("")).join("");
    return `<div class="k-fare-est">
      <h3 class="h6 mb-1"><i class="bi bi-cash-coin"></i> ${K.esc(K.t("fare.estTitle", { km: r.km.toFixed(1) }))}</h3>
      <p class="small text-muted mb-2">${K.esc(K.t(S.road ? "fare.byRoad" : "fare.byStraight"))}</p>
      ${groups}
      <p class="small text-muted mt-2 mb-0">${K.esc(K.t("fare.disclaimer"))} <a href="#fares">${K.esc(K.t("fare.seeAll"))}</a></p></div>`;
  }

  async function update(el) {
    if (!el) return;
    const turn = {};
    updates.set(el, turn);
    if (!S.destination.trim()) { el.innerHTML = ""; return; }
    el.innerHTML = `<div class="k-fare-est small text-muted"><span class="spinner-border spinner-border-sm"></span> ${K.esc(K.t("fare.estimating"))}</div>`;
    try {
      const endpoints = el.id === "resultsFare" && S.ai.guide?.endpoints;
      const [a, b] = endpoints || await Promise.all([resolve(S.origin, S.originPoint), resolve(S.destination, S.destinationPoint)]);
      if (updates.get(el) !== turn) return;
      if (!a || !b) throw new Error("no points");
      el.innerHTML = html(rows(a, b));
    } catch {
      if (updates.get(el) !== turn) return;
      el.innerHTML = `<p class="small text-muted k-fare-est mb-0">${K.esc(K.t("fare.needPoints"))}</p>`;
    }
  }

  K.fareEstimate = { update, resolve, nearestStation };
})(window.Komute);
