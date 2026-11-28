// Fares screen: road fares, Q City Bus routes, train fares, and discounts (data: js/data/fares.js, js/data/transit.js).
(function (K) {
  const peso = K.fmt.peso;
  const section = (id, icon, title, body) => `<details class="k-disclosure k-fare-section" data-fare-section="${id}">
    <summary><i class="bi ${icon}" aria-hidden="true"></i><span>${K.esc(title)}</span></summary>
    <div class="k-disclosure-body">${body}</div>
  </details>`;

  function roadCard(f) {
    return section("road", "bi-cash-coin", K.t("fares.road"), `
      <p class="small text-muted">${K.esc(K.L(f.effective))}</p>
      <div class="k-fare-list">${f.road.map((r) => `<div class="k-fare-item${r.free ? " free" : ""}">
          <i class="bi ${r.icon}"></i><div><div class="fw-semibold">${K.esc(K.L(r.mode))}</div><div class="small">${K.esc(K.L(r.fare))}</div></div></div>`).join("")}
      </div>`);
  }

  // Route lists from js/data/routes.js (the same data the planner uses)
  const net = () => K.data().network || { points: {}, routes: [] };
  const ptName = (k) => { const p = net().points[k.replace(/[<>]$/, "")]; return p ? p[0] : k; };
  const stopList = (r) => `<ol class="k-stops">${r.stops.map((k) => `<li>${K.esc(ptName(k))}${/[<>]$/.test(k) ? ` <small>(${K.esc(K.t(k.endsWith(">") ? "fares.oneWayTo" : "fares.oneWayFrom", { e: r.ends[k.endsWith(">") ? 1 : 0] }))})</small>` : ""}</li>`).join("")}</ol>`;
  const routeRow = (r, label) => `<li><details data-fare-route="${K.esc(r.id)}"><summary>${label}</summary>
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
    return section("qcity-bus", "bi-gift", K.t("fares.qcbus"), `
      ${list}
      <p class="small text-muted mt-2 mb-1">${K.esc(K.L(q.note))}</p>
      <a class="small" href="${K.esc(q.link)}" target="_blank" rel="noopener noreferrer">${K.esc(K.t("fares.qcbusLink"))} <i class="bi bi-box-arrow-up-right"></i></a>
    `);
  }

  function cityBusCard() {
    const routes = net().routes.filter((r) => r.type === "bus");
    if (!routes.length) return "";
    // City buses from the bus guide (js/data/transit.js) that are not in the route data yet: show them without stops
    const have = new Set(routes.flatMap((r) => String(r.code).match(/\d+[A-Z]?/g) || []));
    const extra = ((K.data().transit || {}).busRoutes || []).filter((r) => !r.carousel && !have.has(String(r.no)));
    return section("city-bus", "bi-bus-front", K.t("fares.citybus"), `
      <p class="small text-muted">${K.esc(K.t("fares.citybusSub"))}</p>
      <ul class="k-netlist">${routes.map((r) => routeRow(r, `${K.esc(r.code)}: ${K.esc(r.ends.join(" – "))}`)).join("")}</ul>
      ${extra.length ? `<h3 class="h6 mt-3">${K.esc(K.t("fares.moreBuses"))}</h3>
        ${extra.map((r) => `<div class="k-bus"><span class="k-bus-no">${K.esc(r.no)}</span>
          <div><div class="fw-semibold">${K.esc(r.name)}</div><div class="small text-muted">${K.esc(K.t("bus.via", { v: r.via }))}</div></div></div>`).join("")}` : ""}
    `);
  }

  function carouselCard() {
    const route = net().routes.find((r) => r.type === "carousel");
    if (!route) return "";
    const stations = route.stops.filter((k) => net().points[k]?.[1] != null && /^car_/.test(k));
    return section("carousel", "bi-bus-front-fill", K.t("fares.carousel"), `
      <p class="small text-muted">${K.esc(K.t("fares.carouselSub"))}</p>
      <ol class="k-stops">${stations.map((k) => `<li>${K.esc(ptName(k))}</li>`).join("")}</ol>`);
  }

  // Tricycle areas: registered TODAs (Quezon City "Tricycle Operators and Drivers 2026")
  function todaCard() {
    const list = net().todas || [];
    if (!list.length) return "";
    return section("toda", "bi-bicycle", K.t("fares.todaTitle", { n: list.length }), `
      <p class="small text-muted">${K.esc(K.t("fares.todaSub"))}</p>
      <input id="todaFilter" class="form-control form-control-sm mb-2" type="search" autocomplete="off" placeholder="${K.esc(K.t("fares.todaSearch"))}">
      <div class="k-todawrap"><table class="table table-sm table-striped align-middle k-todatable mb-0">
        <thead><tr><th scope="col">#</th><th scope="col">${K.esc(K.t("fares.todaCol"))}</th><th scope="col" class="text-end">${K.esc(K.t("fares.todaMap"))}</th></tr></thead>
        <tbody>${list.map((x, i) => `<tr data-q="${K.esc(String(x[0]).toLowerCase())}"><td class="text-muted">${i + 1}</td><td>${K.esc(x[0])}</td>
          <td class="text-end"><a href="https://www.google.com/maps/search/?api=1&query=${x[1]},${x[2]}" target="_blank" rel="noopener noreferrer" aria-label="${K.esc(K.t("fares.todaMap"))}: ${K.esc(x[0])}"><i class="bi bi-geo-alt"></i></a></td></tr>`).join("")}</tbody>
      </table></div>`);
  }

  function jeepCard() {
    const routes = net().routes.filter((r) => r.family === "jeep" || r.type === "jeepney" || r.type === "modern_jeepney" || r.type === "uv_express");
    if (!routes.length) return "";
    const label = (r) => `${K.esc(r.ends.join(" – "))} <small class="text-muted">(${K.esc(r.type === "uv_express" ? "UV Express" : r.type === "modern_jeepney" ? K.t("mode.modern_jeepney") : K.t("mode.jeepney"))} ${K.esc(r.code)})</small>`;
    return section("jeep-uv", "bi-truck-front", K.t("fares.jeepList"), `
      <p class="small text-muted">${K.esc(K.t("fares.jeepListSub"))}</p>
      <ul class="k-netlist">${routes.map((r) => routeRow(r, label(r))).join("")}</ul>`);
  }

  // Every jeepney route on LTFRB's list that starts, ends, or passes through Quezon City (web/js/data/ltfrb-jeep.js)
  function ltfrbCard() {
    const d = (K.data() || {}).ltfrbJeep;
    if (!d || !d.routes || !d.routes.length) return "";
    const inPlanner = d.routes.filter((r) => r.planner && r.planner.length).length;
    const rows = d.routes.map((r) => `<li data-q="${K.esc(r.name.toLowerCase())}">${r.planner && r.planner.length
      ? `<i class="bi bi-check-circle-fill text-success" title="${K.esc(K.t("fares.ltfrbInApp"))}"></i>` : `<i class="bi bi-dash-circle text-muted"></i>`}
      ${K.esc(r.name)}${r.newRoute ? ` <span class="badge text-bg-warning">${K.esc(K.t("fares.ltfrbNew"))}</span>` : ""}</li>`).join("");
    return section("ltfrb", "bi-list-check", K.t("fares.ltfrbTitle", { n: d.routes.length }), `
      <p class="small text-muted">${K.esc(K.t("fares.ltfrbSub", { n: inPlanner }))}</p>
      <label for="ltfrbFilter" class="form-label fw-semibold">${K.esc(K.t("fares.findRoute"))}</label>
      <input id="ltfrbFilter" class="form-control mb-2" type="search" autocomplete="off" placeholder="${K.esc(K.t("fares.ltfrbSearch"))}">
      <p id="ltfrbStatus" class="small text-muted mb-2" role="status"></p>
      <ul class="k-ltfrblist" tabindex="0" aria-label="${K.esc(K.t("fares.ltfrbTitle", { n: d.routes.length }))}">${rows}</ul>`);
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
    return section("mrt3", "bi-train-front", K.t("fares.mrt3"), `
      <p class="small text-muted">${K.esc(K.t("fares.mrt3Sub"))}</p>
      <div class="table-responsive" role="region" tabindex="0" aria-label="${K.esc(K.t("fares.mrt3"))}"><table class="table table-sm align-middle text-center mb-2">
        <thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small text-muted mb-0">${K.esc(K.L(m.note))}</p>`);
  }

  function lrt1Card(f) {
    const rows = f.lrt1.trips.map((r) => `<tr><th scope="row" class="fw-semibold">${K.esc(r.trip)}</th><td>${peso(r.beep)}</td><td>${peso(r.sjt)}</td></tr>`).join("");
    return section("lrt1", "bi-train-lightrail-front", K.t("fares.lrt1"), `
      <div class="table-responsive"><table class="table table-sm align-middle">
        <thead><tr><th scope="col">${K.esc(K.t("fares.trip"))}</th><th scope="col">Beep</th><th scope="col">${K.esc(K.t("fares.sjt"))}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="small text-muted mb-0">${K.esc(K.L(f.lrt1.range))}</p>`);
  }

  function lrt2Card(f) {
    return section("lrt2", "bi-train-lightrail-front", "LRT-2", `
      <p class="small text-muted">${K.esc(K.t("fares.lrt2"))}</p>
      <p class="mb-1"><strong>${K.esc(K.t("fares.now50"))}</strong> ${K.esc(K.L(f.lrt2.discounted))}</p>
      <p class="mb-0 small text-muted"><strong>${K.esc(K.t("fares.regular"))}</strong> ${K.esc(K.L(f.lrt2.regular))}</p>
      ${f.notes.map((n) => `<div class="alert k-info small mt-3 mb-0"><i class="bi bi-info-circle"></i> ${K.esc(K.L(n))}</div>`).join("")}
    `);
  }

  function discountCard(f) {
    return section("discounts", "bi-percent", K.t("fares.discounts"),
      `<ul class="mb-0">${f.discounts.map((d) => `<li class="mb-2">${K.esc(K.L(d))}</li>`).join("")}</ul>`);
  }

  function init() {
    const f = K.data().fares;
    const list = document.getElementById("fareList");
    const key = (item) => item.dataset.fareSection || item.dataset.fareRoute;
    const opened = new Set(Array.from(list.querySelectorAll("details[open]"), key));
    const query = list.querySelector("#ltfrbFilter")?.value || "";
    list.innerHTML = `${roadCard(f)}${mrt3Card(f)}${lrt1Card(f)}${lrt2Card(f)}${discountCard(f)}
      ${qcBusCard()}${cityBusCard()}${carouselCard()}${jeepCard()}${ltfrbCard()}${todaCard()}
      <p class="k-fares-note" role="note">${K.esc(K.t("fares.warn", { d: K.L(f.lastChecked) }))}</p>`;
    list.querySelectorAll("details").forEach((item) => { item.open = opened.has(key(item)); });
    const tb = list.querySelector("#todaFilter");
    if (tb) tb.oninput = () => {
      const q = tb.value.trim().toLowerCase();
      list.querySelectorAll(".k-todatable tbody tr").forEach((tr) => { tr.hidden = q && !tr.dataset.q.includes(q); });
    };
    const box = list.querySelector("#ltfrbFilter");
    if (box) {
      const status = list.querySelector("#ltfrbStatus");
      const rows = list.querySelectorAll(".k-ltfrblist li");
      box.oninput = () => {
        const q = box.value.trim().toLowerCase();
        let count = 0;
        rows.forEach((row) => {
          row.hidden = !row.dataset.q.includes(q);
          if (!row.hidden) count++;
        });
        const message = count === 1 ? "fares.oneRoute" : count ? "fares.routeMatches" : "fares.noRoutes";
        status.textContent = q ? K.t(message, { n: count }) : "";
      };
      box.value = query;
      box.oninput();
    }
  }

  K.fares = { init, show() {}, relabel: init };
})(window.Komute);
