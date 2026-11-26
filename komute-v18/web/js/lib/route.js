// Trip map tabs (Commute / Drive / Walk / Bike): road paths, alternative routes, turn list, Start navigation.
// Road paths come from OpenStreetMap routing. They show roads, not jeepney/bus/train lines.
(function (K) {
  const S = K.state, $ = (id) => document.getElementById(id);
  const TRAVEL = { drive: "driving", walk: "walking", bike: "bicycling" };
  let km, mode = "commute", pts = null, routes = {}, sel = 0, run = 0;

  // Turn instruction text for one OSRM step, in the chosen language.
  function say(s) {
    const m = s.maneuver, name = s.name || "";
    if (m.type === "depart") return name ? K.t("turn.departOn", { n: name }) : K.t("turn.depart");
    if (m.type === "arrive") return K.t("turn.arrive");
    if (/roundabout|rotary/.test(m.type)) return name ? K.t("turn.roundaboutOnto", { n: name }) : K.t("turn.roundabout");
    const key = { left: "left", right: "right", "slight left": "slightLeft", "slight right": "slightRight", "sharp left": "sharpLeft",
      "sharp right": "sharpRight", straight: "straight", uturn: "uturn" }[m.modifier] || "continue";
    return name ? K.t("turn." + key + "Onto", { n: name }) : K.t("turn." + key);
  }
  function turnIcon(s) {
    const m = s.maneuver;
    if (m.type === "arrive") return "bi-flag-fill";
    if (/roundabout|rotary/.test(m.type)) return "bi-arrow-repeat";
    return { left: "bi-arrow-90deg-left", right: "bi-arrow-90deg-right", "slight left": "bi-arrow-up-left", "slight right": "bi-arrow-up-right",
      "sharp left": "bi-arrow-return-left", "sharp right": "bi-arrow-return-right", uturn: "bi-arrow-counterclockwise" }[m.modifier] || "bi-arrow-up";
  }

  function gmaps(travel, nav) {
    const q = (p, t) => (p ? p.latitude + "," + p.longitude : encodeURIComponent(t + ", Quezon City"));
    return `https://www.google.com/maps/dir/?api=1&origin=${q(pts && pts[0], S.origin)}&destination=${q(pts && pts[1], S.destination)}&travelmode=${travel}${nav ? "&dir_action=navigate" : ""}`;
  }

  async function fetchRoutes(m) {
    const r = await K.api.roadRoutes(m, pts[0], pts[1], true);
    return (routes[m] = r);
  }

  function render() {
    const faint = mode === "commute", list = routes[faint ? "drive" : mode] || [];
    if (sel >= list.length) sel = 0;
    if (km) {
      km.setRoutes(faint ? list.slice(0, 1) : list, sel, { faint, onPick: (i) => { sel = i; render(); } });
      if (!faint && list[sel]) km.fitRoute(list[sel], { top: 110, bottom: 60, left: 50, right: 50 });
    }
    $("panel-commute").classList.toggle("d-none", mode !== "commute");
    $("panel-route").classList.toggle("d-none", mode === "commute");
    document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === mode)));
    if (mode !== "commute") summary(list);
  }

  function summary(list) {
    const el = $("panel-route"), r = list[sel], travel = TRAVEL[mode];
    if (!r) {
      el.innerHTML = `<p class="text-muted my-3">${K.esc(K.t(pts ? "route.failed" : "route.needPoints"))}</p>
        <a class="btn btn-outline-primary rounded-pill" target="_blank" rel="noopener noreferrer" href="${gmaps(travel)}"><i class="bi bi-google"></i> ${K.esc(K.t("route.openGoogle"))}</a>`;
      return;
    }
    const steps = r.legs[0].steps.map((s) => `<li><i class="bi ${turnIcon(s)}"></i><span>${K.esc(say(s))}</span><small>${K.fmt.dist(s.distance)}</small></li>`).join("");
    const arrive = new Date(Date.now() + r.duration * 1000);
    el.innerHTML = `<div class="k-route-sum">
        <div><span class="k-time">${K.fmt.mins(r.duration)}</span> <span class="fs-5 text-muted">· ${K.fmt.dist(r.distance)}</span></div>
        <div class="small text-muted">${K.esc(K.t("route.arriveAt", { t: K.fmt.clock(arrive) }))} · ${K.esc(K.t(sel ? "route.alt" : "route.fastest"))}. ${K.esc(K.t("route.noTraffic"))}${list.length > 1 ? " " + K.esc(K.t("route.tapAlt")) : ""}</div>
      </div>
      <div class="k-route-actions">
        <button id="btnStartNav" type="button" class="btn btn-primary btn-lg rounded-pill"><i class="bi bi-cursor-fill"></i> ${K.esc(K.t("nav.start"))}</button>
        <a class="btn btn-outline-primary rounded-pill" target="_blank" rel="noopener noreferrer" href="${gmaps(travel, true)}"><i class="bi bi-google"></i> ${K.esc(K.t("route.googleMaps"))}</a>
        <button id="btnShare" type="button" class="btn btn-outline-primary rounded-pill"><i class="bi bi-share"></i> ${K.esc(K.t("route.share"))}</button>
      </div>
      <details class="k-turns" open><summary class="fw-semibold">${K.esc(K.t("route.steps"))}</summary><ol>${steps}</ol></details>`;
    $("btnStartNav").onclick = () => K.navigate.start(r, mode, pts[1]);
    if (!km) $("btnStartNav").classList.add("d-none");
    $("btnShare").onclick = async () => {
      const url = gmaps(travel);
      try {
        if (navigator.share) await navigator.share({ title: "Komute", text: `${K.fmt.first(S.origin)} → ${K.fmt.first(S.destination)}`, url });
        else { await navigator.clipboard.writeText(url); $("btnShare").innerHTML = `<i class="bi bi-check2"></i> ${K.esc(K.t("route.copied"))}`; }
      } catch { /* cancelled */ }
    };
  }

  function setMode(m) { mode = m; sel = 0; render(); }

  async function show(kmap) {
    km = kmap;
    const me = ++run;
    routes = {}; sel = 0; S.road = null;
    ["drive", "walk", "bike"].forEach((m) => { const t = $("t-" + m); if (t) t.textContent = "…"; });
    try {
      const [a, b] = await Promise.all([K.fareEstimate.resolve(S.origin, S.originPoint), K.fareEstimate.resolve(S.destination, S.destinationPoint)]);
      if (!a || !b) throw new Error("points");
      pts = [a, b];
    } catch { pts = null; }
    if (me !== run) return;
    $("lnkTransit").href = gmaps("transit");
    if (km) km.setEndpoints(pts && pts[0], pts && pts[1], { fit: !!pts });
    if (!pts) { ["drive", "walk", "bike"].forEach((m) => { $("t-" + m).textContent = K.t("tab." + m); }); render(); return; }
    await Promise.all(Object.keys(TRAVEL).map((m) => fetchRoutes(m).then(
      (r) => { if (me === run) $("t-" + m).textContent = K.fmt.mins(r[0].duration); },
      () => { if (me === run) $("t-" + m).textContent = "–"; })));
    if (me !== run) return;
    if (routes.drive) {
      S.road = { km: routes.drive[0].distance / 1000, min: routes.drive[0].duration / 60 };
      K.fareEstimate.update($("resultsFare"));
    }
    render();
  }

  K.routeView = { show, setMode, say, turnIcon, points: () => pts, routes: () => routes, mode: () => mode };
})(window.Komute);
