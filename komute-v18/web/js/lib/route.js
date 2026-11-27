// Trip map tabs (Commute / Drive / Walk / Bike): road paths, alternative routes, turn list, Start navigation.
// Road paths are separate from the public-transit itineraries.
(function (K) {
  const S = K.state, $ = (id) => document.getElementById(id);
  const TRAVEL = { drive: "driving", walk: "walking", bike: "bicycling" };
  let km, mode = "commute", pts = null, routes = {}, sel = 0, run = 0;
  let commute = { options: [], selected: 0 };
  const snappedOptions = new WeakMap();
  const rail = new Set(["mrt3", "lrt1", "lrt2", "train"]);

  // Google supplies localized instructions, while OSRM steps use Komute's translations.
  function say(s) {
    if (s.instructions) return s.instructions;
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

  function transitPath(option, endpoints) {
    const valid = (p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]);
    const segments = [];
    let previous = endpoints?.[0] && K.geo.ll(endpoints[0]);
    const addLink = (from, to) => {
      if (valid(from) && valid(to) && (from[0] !== to[0] || from[1] !== to[1])) {
        segments.push({ coordinates: [from, to], dashed: true, profile: "walk" });
      }
    };
    for (const step of option.steps) {
      if (step.kind !== "ride") continue;
      const coordinates = (step.path || [
        step.fromPt && [step.fromPt.lng, step.fromPt.lat], step.toPt && [step.toPt.lng, step.toPt.lat]
      ]).filter(valid);
      if (coordinates.length < 2) { previous = null; continue; }
      addLink(previous, coordinates[0]);
      const onRoad = !rail.has(step.mode);
      segments.push({ coordinates, profile: onRoad ? "drive" : null, dashed: onRoad });
      previous = coordinates[coordinates.length - 1];
    }
    if (!segments.length) return null;
    if (endpoints?.[1]) addLink(previous, K.geo.ll(endpoints[1]));
    return { segments };
  }

  function snappedPath(option, fallback) {
    if (!fallback?.segments.some((segment) => segment.profile)) return fallback;
    const key = JSON.stringify(fallback.segments);
    const cached = snappedOptions.get(option);
    if (cached?.key === key) return cached.path;

    const request = { key, path: fallback };
    snappedOptions.set(option, request);
    Promise.all(fallback.segments.map(async (segment) => {
      if (!segment.profile) return segment;
      const waypoints = segment.coordinates.filter(([lng, lat], i, points) =>
        !i || lng !== points[i - 1][0] || lat !== points[i - 1][1]);
      if (waypoints.length < 2) return segment;
      const shape = await K.api.roadPath(segment.profile, waypoints).catch(() => null);
      return shape ? { ...segment, coordinates: shape, dashed: segment.profile === "walk", snapped: true } : segment;
    })).then((segments) => {
      if (snappedOptions.get(option) !== request) return;
      request.path = { segments };
      if (mode === "commute" && commute.options[commute.selected] === option && K.app.currentView() === "results") {
        renderCommute();
      }
    });
    return request.path;
  }

  function renderCommute(fit = false) {
    const { options, selected, onPick } = commute;
    const endpoints = S.ai.guide?.endpoints || pts;
    const rendered = options.map((o, i) => {
      if (o.steps.some((s) => s.door)) return routes.drive?.[0] || null;
      const path = transitPath(o, endpoints);
      return km && i === selected ? snappedPath(o, path) : snappedOptions.get(o)?.path || path;
    });
    $("mapFareValue").textContent = options[selected]?.fare || "";
    if (!km) return;
    km.setRoutes(rendered, selected, { labels: false, onPick, compact: true });
    if (fit && rendered[selected]) {
      km.fitRoute(rendered[selected], { top: 150, bottom: 40, left: 36, right: 44 });
    }
  }

  function setCommute(options, selected, onPick) {
    commute = { options, selected, onPick };
    $("t-commute").textContent = options[selected]?.duration || "";
    const endpoints = S.ai.guide?.endpoints;
    if (km && endpoints && options.length) km.setEndpoints(...endpoints, { fit: false });
    if (mode === "commute") renderCommute(true);
  }

  function render() {
    const isCommute = mode === "commute";
    const list = routes[mode] || [];
    if (sel >= list.length) sel = 0;
    if (isCommute) renderCommute(true);
    else {
      $("mapFareValue").textContent = "";
      if (km) {
        km.setRoutes(list, sel, { onPick: (i) => { sel = i; render(); } });
        if (list[sel]) km.fitRoute(list[sel], { top: 150, bottom: 60, left: 50, right: 50 });
      }
    }
    $("panel-commute").classList.toggle("d-none", !isCommute);
    $("panel-route").classList.toggle("d-none", isCommute);
    document.querySelectorAll("[data-mode]").forEach((button) => {
      const active = button.dataset.mode === mode;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && !isCommute) $("panel-route").setAttribute("aria-labelledby", button.id);
    });
    if (!isCommute) summary(list);
  }

  function summary(list) {
    const el = $("panel-route"), r = list[sel], travel = TRAVEL[mode];
    if (!r) {
      el.innerHTML = `<p class="text-muted my-3">${K.esc(K.t(pts ? "route.failed" : "route.needPoints"))}</p>
        <a class="btn btn-outline-primary rounded-pill" target="_blank" rel="noopener noreferrer" href="${gmaps(travel)}"><i class="bi bi-google"></i> ${K.esc(K.t("route.openGoogle"))}</a>`;
      return;
    }
    const steps = r.legs[0].steps.map((s) => `<li><i class="bi ${turnIcon(s)}"></i><span>${K.esc(say(s))}</span>${s.distance ? `<small>${K.fmt.dist(s.distance)}</small>` : ""}</li>`).join("");
    const arrive = new Date(Date.now() + r.duration * 1000);
    const trafficNote = r.trafficEstimate === "google" ? "route.googleTraffic"
      : r.trafficEstimate === "junctions" ? "route.junctionDelays" : "route.noTraffic";
    const warnings = (r.warnings || []).map((warning) => `<p class="small text-muted mt-2 mb-0">${K.esc(warning)}</p>`).join("");
    el.innerHTML = `<div class="k-route-sum">
        <div><span class="k-time">${K.fmt.mins(r.duration)}</span> <span class="fs-5 text-muted">· ${K.fmt.dist(r.distance)}</span></div>
        <div class="small text-muted">${K.esc(K.t("route.arriveAt", { t: K.fmt.clock(arrive) }))} · ${K.esc(K.t(sel ? "route.alt" : "route.fastest"))}. ${K.esc(K.t(trafficNote))}${list.length > 1 ? " " + K.esc(K.t("route.tapAlt")) : ""}</div>
        ${warnings}
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
    pts = null;
    Object.keys(TRAVEL).forEach((m) => { $("t-" + m).textContent = ""; });
    let resolved;
    try {
      const [a, b] = S.ai.guide?.endpoints || await Promise.all([K.fareEstimate.resolve(S.origin, S.originPoint), K.fareEstimate.resolve(S.destination, S.destinationPoint)]);
      if (a && b) resolved = [a, b];
    } catch { /* The guide can still supply endpoints when it arrives. */ }
    if (me !== run) return;
    pts = S.ai.guide?.endpoints || resolved || null;
    $("lnkTransit").href = gmaps("transit");
    if (km) km.setEndpoints(pts && pts[0], pts && pts[1], { fit: !!pts });
    if (mode === "commute") renderCommute(true);
    if (!pts) { render(); return; }
    await Promise.all(Object.keys(TRAVEL).map((m) => K.api.roadRoutes(m, pts[0], pts[1], true).then(
      (r) => {
        if (me !== run) return;
        routes[m] = r;
        $("t-" + m).textContent = K.fmt.mins(r[0].duration);
      },
      () => {})));
    if (me !== run) return;
    if (routes.drive) {
      S.road = { km: routes.drive[0].distance / 1000, min: routes.drive[0].duration / 60 };
      K.fareEstimate.update($("resultsFare"));
      if (K.planView.tab() === "taxi" && K.app.currentView() === "results" && S.ai.guide) K.results.render();
    }
    render();
  }

  function attachMap(map) {
    km = map;
    km.resize();
    const endpoints = S.ai.guide?.endpoints || pts;
    if (endpoints) km.setEndpoints(...endpoints);
    render();
  }

  K.routeView = { show, attachMap, setMode, setCommute, say, turnIcon, points: () => pts, routes: () => routes, mode: () => mode };
})(window.Komute);
