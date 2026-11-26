// Fares screen: road fares, Q City Bus routes, train fares, and discounts (data: js/data/fares.js, js/data/transit.js).
(function (K) {
  const peso = K.fmt.peso;

  function roadCard(f) {
    return `<div class="k-card mb-3">
      <h2 class="h5"><i class="bi bi-bus-front"></i> ${K.esc(K.t("fares.road"))}</h2>
      <p class="small text-muted">${K.esc(K.L(f.effective))}</p>
      <div class="k-fare-list">${f.road.map((r) => `<div class="k-fare-item${r.free ? " free" : ""}">
          <i class="bi ${r.icon}"></i><div><div class="fw-semibold">${K.esc(K.L(r.mode))}</div><div class="small">${K.esc(K.L(r.fare))}</div></div></div>`).join("")}
      </div></div>`;
  }

  // Route lists from js/data/routes.js (the same data the planner uses)
  const net = () => K.data().network || { points: {}, routes: [] };
  const ptName = (k) => { const p = net().points[k.replace(/[<>]$/, "")]; return p ? p[0] : k; };
  const stopList = (r) => `<ol class="k-stops">${r.stops.map((k) => `<li>${K.esc(ptName(k))}${/[<>]$/.test(k) ? ` <small>(${K.esc(K.t(k.endsWith(">") ? "fares.oneWayTo" : "fares.oneWayFrom", { e: r.ends[k.endsWith(">") ? 1 : 0] }))})</small>` : ""}</li>`).join("")}</ol>`;
  const routeRow = (r, label) => `<li><details><summary>${label}</summary>
      <div class="mt-1"><span class="k-sign">${K.esc(r.ends.join(" – "))}</span> ${r.via ? `<span class="small fw-semibold">via ${K.esc(r.via)}</span>` : ""}</div>
      ${r.note ? `<div class="small text-muted mt-1">${K.esc(K.L(r.note))}</div>` : ""}
      ${stopList(r)}</details></li>`;

  function qcBusCard() {
    const q = K.data().transit.qcityBus;
    const routes = net().routes.filter((r) => r.type === "qcity_bus");
    const list = routes.length
      ? `<ul class="k-netlist">${routes.map((r) => { const no = r.code.replace("Route ", ""); const named = q.routes.find((x) => String(x.no) === no);
        return routeRow(r, `<span class="k-route-no">${K.esc(no)}</span> ${K.esc(named ? named.name : r.ends.join(" ↔ "))}`); }).join("")}</ul>`
      : `<ol class="k-qcbus">${q.routes.map((r) => `<li><span class="k-route-no">${r.no}</span> ${K.esc(r.name)}</li>`).join("")}</ol>`;
    return `<div class="k-card mb-3 k-card-free">
      <h2 class="h5"><i class="bi bi-gift"></i> ${K.esc(K.t("fares.qcbus"))}</h2>
      ${list}
      <p class="small text-muted mt-2 mb-1">${K.esc(K.L(q.note))}</p>
      <a class="small" href="${K.esc(q.link)}" target="_blank" rel="noopener noreferrer">${K.esc(K.t("fares.qcbusLink"))} <i class="bi bi-box-arrow-up-right"></i></a>
    </div>`;
  }

  function cityBusCard() {
    const routes = net().routes.filter((r) => r.type === "bus");
    const car = net().routes.find((r) => r.type === "carousel");
    if (!routes.length) return "";
    // City buses from the bus guide (js/data/transit.js) that are not in the route data yet: show them without stops
    const have = new Set(routes.flatMap((r) => String(r.code).match(/\d+[A-Z]?/g) || []));
    const extra = ((K.data().transit || {}).busRoutes || []).filter((r) => !r.carousel && !have.has(String(r.no)));
    const qcStations = car ? car.stops.filter((k) => { const p = net().points[k]; return p && p[1] !== null && /^car_/.test(k); }) : [];
    return `<div class="k-card mb-3">
      <h2 class="h5"><i class="bi bi-bus-front"></i> ${K.esc(K.t("fares.citybus"))}</h2>
      <p class="small text-muted">${K.esc(K.t("fares.citybusSub"))}</p>
      <ul class="k-netlist">${routes.map((r) => routeRow(r, `${K.esc(r.code)}: ${K.esc(r.ends.join(" – "))}`)).join("")}</ul>
      ${extra.length ? `<h3 class="h6 mt-3">${K.esc(K.t("fares.moreBuses"))}</h3>
        ${extra.map((r) => `<div class="k-bus"><span class="k-bus-no">${K.esc(r.no)}</span>
          <div><div class="fw-semibold">${K.esc(r.name)}</div><div class="small text-muted">${K.esc(K.t("bus.via", { v: r.via }))}</div></div></div>`).join("")}` : ""}
      ${car ? `<h3 class="h6 mt-3"><i class="bi bi-bus-front-fill"></i> ${K.esc(K.t("fares.carousel"))}</h3>
        <p class="small text-muted mb-1">${K.esc(K.t("fares.carouselSub"))}</p>
        <ol class="k-stops small">${qcStations.map((k) => `<li>${K.esc(ptName(k))}</li>`).join("")}</ol>` : ""}
    </div>`;
  }

  // Tricycle areas: registered TODAs (Quezon City "Tricycle Operators and Drivers 2026")
  function todaCard() {
    const list = net().todas || [];
    if (!list.length) return "";
    return `<div class="k-card mb-3">
      <h2 class="h5"><i class="bi bi-bicycle"></i> ${K.esc(K.t("fares.todaTitle", { n: list.length }))}</h2>
      <p class="small text-muted">${K.esc(K.t("fares.todaSub"))}</p>
      <details><summary class="fw-semibold">${K.esc(K.t("fares.todaShow"))}</summary>
        <p class="small mt-2 mb-0">${list.map((x) => K.esc(x[0])).join(" · ")}</p></details></div>`;
  }

  function jeepCard() {
    const routes = net().routes.filter((r) => r.family === "jeep" || r.type === "jeepney" || r.type === "modern_jeepney" || r.type === "uv_express");
    if (!routes.length) return "";
    const label = (r) => `${K.esc(r.ends.join(" – "))} <small class="text-muted">(${K.esc(r.type === "uv_express" ? "UV Express" : r.type === "modern_jeepney" ? K.t("mode.modern_jeepney") : K.t("mode.jeepney"))} ${K.esc(r.code)})</small>`;
    return `<div class="k-card mb-3">
      <h2 class="h5"><i class="bi bi-truck-front"></i> ${K.esc(K.t("fares.jeepList"))}</h2>
      <p class="small text-muted">${K.esc(K.t("fares.jeepListSub"))}</p>
      <ul class="k-netlist">${routes.map((r) => routeRow(r, label(r))).join("")}</ul></div>`;
  }

  // Every jeepney route on LTFRB's list that starts, ends, or passes through Quezon City (web/js/data/ltfrb-jeep.js)
  function ltfrbCard() {
    const d = (K.data() || {}).ltfrbJeep;
    if (!d || !d.routes || !d.routes.length) return "";
    const inPlanner = d.routes.filter((r) => r.planner && r.planner.length).length;
    const rows = d.routes.map((r) => `<li data-q="${K.esc(r.name.toLowerCase())}">${r.planner && r.planner.length
      ? `<i class="bi bi-check-circle-fill text-success" title="${K.esc(K.t("fares.ltfrbInApp"))}"></i>` : `<i class="bi bi-dash-circle text-muted"></i>`}
      ${K.esc(r.name)}${r.newRoute ? ` <span class="badge text-bg-warning">${K.esc(K.t("fares.ltfrbNew"))}</span>` : ""}</li>`).join("");
    return `<div class="k-card mb-3">
      <h2 class="h5"><i class="bi bi-list-check"></i> ${K.esc(K.t("fares.ltfrbTitle", { n: d.routes.length }))}</h2>
      <p class="small text-muted">${K.esc(K.t("fares.ltfrbSub", { n: inPlanner }))}</p>
      <input id="ltfrbFilter" class="form-control form-control-sm mb-2" type="search" autocomplete="off" placeholder="${K.esc(K.t("fares.ltfrbSearch"))}">
      <details><summary class="fw-semibold">${K.esc(K.t("fares.ltfrbShow"))}</summary>
        <ul class="k-ltfrblist">${rows}</ul></details></div>`;
  }

  function mrt3Card(f) {
    const m = f.mrt3, fare = {};
    m.pairs.forEach(([a, b, v]) => { fare[a + "-" + b] = v; fare[b + "-" + a] = v; });
    const head = m.stations.map((s) => `<th scope="col" class="small">${K.esc(s)}</th>`).join("");
    const rows = m.stations.map((from, i) => `<tr><th scope="row" class="small text-start">${K.esc(from)}</th>` +
      m.stations.map((_, j) => {
        if (i === j) return `<td class="text-muted">–</td>`;
        const v = fare[i + "-" + j];
        return `<td><strong>${peso(v / 2)}</strong><div class="small text-muted text-decoration-line-through">${peso(v)}</div></td>`;
      }).join("") + "</tr>").join("");
    return `<div class="k-card mb-3">
      <h2 class="h5"><i class="bi bi-train-front"></i> ${K.esc(K.t("fares.mrt3"))}</h2>
      <p class="small text-muted">${K.esc(K.t("fares.mrt3Sub"))}</p>
      <div class="table-responsive"><table class="table table-sm align-middle text-center mb-2">
        <thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small text-muted mb-0">${K.esc(K.L(m.note))}</p></div>`;
  }

  function lrtCard(f) {
    const rows = f.lrt1.trips.map((r) => `<tr><th scope="row" class="fw-semibold">${K.esc(r.trip)}</th><td>${peso(r.beep)}</td><td>${peso(r.sjt)}</td></tr>`).join("");
    return `<div class="k-card mb-3">
      <h2 class="h5"><i class="bi bi-train-lightrail-front"></i> LRT-1 &amp; LRT-2</h2>
      <h3 class="h6 mt-3">${K.esc(K.t("fares.lrt1"))}</h3>
      <div class="table-responsive"><table class="table table-sm align-middle">
        <thead><tr><th scope="col">${K.esc(K.t("fares.trip"))}</th><th scope="col">Beep</th><th scope="col">${K.esc(K.t("fares.sjt"))}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="small text-muted">${K.esc(K.L(f.lrt1.range))}</p>
      <h3 class="h6 mt-3">${K.esc(K.t("fares.lrt2"))}</h3>
      <p class="mb-1"><strong>${K.esc(K.t("fares.now50"))}</strong> ${K.esc(K.L(f.lrt2.discounted))}</p>
      <p class="mb-0 small text-muted"><strong>${K.esc(K.t("fares.regular"))}</strong> ${K.esc(K.L(f.lrt2.regular))}</p>
      ${f.notes.map((n) => `<div class="alert k-info small mt-3 mb-0"><i class="bi bi-info-circle"></i> ${K.esc(K.L(n))}</div>`).join("")}
    </div>`;
  }

  function discountCard(f) {
    return `<div class="k-card mb-3">
      <h2 class="h5"><i class="bi bi-percent"></i> ${K.esc(K.t("fares.discounts"))}</h2>
      <ul class="mb-0">${f.discounts.map((d) => `<li class="mb-2">${K.esc(K.L(d))}</li>`).join("")}</ul></div>`;
  }

  function init() {
    const f = K.data().fares;
    document.getElementById("fareList").innerHTML =
      `<div class="row g-3"><div class="col-lg-6">${roadCard(f)}${qcBusCard()}${cityBusCard()}</div><div class="col-lg-6">${mrt3Card(f)}${lrtCard(f)}${discountCard(f)}${jeepCard()}${ltfrbCard()}${todaCard()}</div></div>` +
      `<div class="alert k-warn small" role="note">${K.esc(K.t("fares.warn", { d: K.L(f.lastChecked) }))}</div>`;
    const box = document.getElementById("ltfrbFilter");
    if (box) box.oninput = () => {
      const q = box.value.trim().toLowerCase();
      const card = box.closest(".k-card");
      if (q) card.querySelector("details").open = true;
      card.querySelectorAll(".k-ltfrblist li").forEach((li) => { li.hidden = q && !li.dataset.q.includes(q); });
    };
  }

  K.fares = { init, show() {}, relabel: init };
})(window.Komute);
