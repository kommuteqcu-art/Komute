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

  function qcBusCard() {
    const q = K.data().transit.qcityBus;
    return `<div class="k-card mb-3 k-card-free">
      <h2 class="h5"><i class="bi bi-gift"></i> ${K.esc(K.t("fares.qcbus"))}</h2>
      <ol class="k-qcbus">${q.routes.map((r) => `<li><span class="k-route-no">${r.no}</span> ${K.esc(r.name)}</li>`).join("")}</ol>
      <p class="small text-muted mb-1">${K.esc(K.L(q.note))}</p>
      <a class="small" href="${K.esc(q.link)}" target="_blank" rel="noopener noreferrer">${K.esc(K.t("fares.qcbusLink"))} <i class="bi bi-box-arrow-up-right"></i></a>
    </div>`;
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
      `<div class="row g-3"><div class="col-lg-6">${roadCard(f)}${qcBusCard()}</div><div class="col-lg-6">${mrt3Card(f)}${lrtCard(f)}${discountCard(f)}</div></div>` +
      `<div class="alert k-warn small" role="note">${K.esc(K.t("fares.warn", { d: K.L(f.lastChecked) }))}</div>`;
  }

  K.fares = { init, show() {}, relabel: init };
})(window.Komute);
