// "Which way do I go?" card: an arrow that points to your destination (or the nearest train station),
// using the phone's GPS and compass. Shown on the Commute tab.
(function (K) {
  const S = K.state;
  let el, unGps, unHead, fix = null, kmap = null, target = "dest";

  function mount(container, km) {
    el = container; kmap = km;
    el.innerHTML = `<div class="k-dir">
      <div class="k-dir-dial" aria-hidden="true"><span class="k-dir-n">N</span><i class="bi bi-arrow-up k-dir-arrow" id="dirArrow"></i></div>
      <div class="k-dir-info">
        <div class="k-dir-title">${K.esc(K.t("dir.title"))}</div>
        <div class="k-dir-seg" role="group">
          <button type="button" data-t="dest" aria-pressed="true">${K.esc(K.t("dir.toDest"))}</button>
          <button type="button" data-t="station" aria-pressed="false">${K.esc(K.t("dir.toStation"))}</button>
        </div>
        <div id="dirText" class="k-dir-text">${K.esc(K.t("dir.tapStart"))}</div>
        <button type="button" id="dirStart" class="btn btn-primary btn-sm rounded-pill"><i class="bi bi-compass"></i> ${K.esc(K.t("dir.start"))}</button>
      </div></div>`;
    el.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => {
      target = b.dataset.t;
      el.querySelectorAll("[data-t]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      draw();
    });
    el.querySelector("#dirStart").onclick = startSensors;
    if (K.gps.last) { fix = K.gps.last; draw(); }
  }

  async function startSensors() {
    const btn = el.querySelector("#dirStart");
    btn.disabled = true;
    const ok = await K.compass.start();
    if (!unHead) unHead = K.compass.on(draw);
    if (!unGps) unGps = K.gps.watch((f, err) => {
      if (err) { el.querySelector("#dirText").textContent = K.t("dir.noGps"); return; }
      fix = f;
      if (kmap) kmap.setMe(f.p, f.acc, K.compass.heading ?? undefined);
      draw();
    });
    btn.innerHTML = ok ? `<i class="bi bi-check2"></i> ${K.esc(K.t("dir.on"))}` : `<i class="bi bi-compass"></i> ${K.esc(K.t("dir.noCompass"))}`;
  }

  function goal() {
    if (target === "station" && fix) {
      const n = K.fareEstimate.nearestStation(fix.p);
      return n ? { p: { latitude: n.st.lat, longitude: n.st.lng }, name: `${n.st.line} ${n.st.name}` } : null;
    }
    const pts = K.routeView.points();
    const b = (pts && pts[1]) || S.destinationPoint;
    return b ? { p: b, name: K.fmt.first(S.destination) } : null;
  }

  function draw() {
    if (!el || !fix) return;
    const g = goal();
    const text = el.querySelector("#dirText"), arrow = el.querySelector("#dirArrow");
    if (!g) { text.textContent = K.t("dir.noDest"); return; }
    const brg = K.geo.bearing(fix.p, g.p), d = K.geo.dist(fix.p, g.p);
    const h = K.compass.heading;
    arrow.style.transform = `rotate(${brg - (h ?? 0)}deg)`;
    el.querySelector(".k-dir-dial").style.setProperty("--north", `${-(h ?? 0)}deg`);
    text.textContent = K.t("dir.line", { d: K.fmt.dist(d), c: K.t("card." + K.geo.cardinal(brg)), n: g.name }) +
      (h === null ? " " + K.t("dir.northUp") : "");
  }

  function unmount() {
    if (unGps) { unGps(); unGps = null; }
    if (unHead) { unHead(); unHead = null; }
  }

  K.dirCompass = { mount, unmount };
})(window.Komute);
