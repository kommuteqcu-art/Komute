// Talks to the Komute backend (same endpoints as the Android app) and the free OpenStreetMap router.
(function (K) {
  const cfg = window.KOMUTE_CONFIG || {};
  const base = (cfg.API_BASE || "").replace(/\/$/, "");
  const ROUTER = (cfg.ROUTER || "https://routing.openstreetmap.de").replace(/\/$/, "");

  async function post(path, body, retried) {
    let res;
    const headers = { "Content-Type": "application/json" };
    const tok = K.account ? await K.account.token() : "";
    if (tok) headers.Authorization = "Bearer " + tok;
    try {
      res = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
    } catch {
      throw new Error(K.t("err.backend"));
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      // sign-in expired: get a new one once and try again
      if (data.code === "expired" && !retried && K.account && (await K.account.forceRefresh())) return post(path, body, true);
      throw Object.assign(new Error(data.error || `Server returned HTTP ${res.status}`), { code: data.code, status: res.status });
    }
    return data;
  }

  const point = (p) => (p ? { latitude: p.latitude, longitude: p.longitude } : null);

  async function searchPlaces(query, near) {
    const data = await post("/api/places", { query, near: point(near) });
    return data.suggestions || [];
  }

  // Search-as-you-type suggestions (streets, buildings, barangays in Quezon City)
  const insideOnly = (list) => list.filter((x) => !x.location || K.maps.inQC(x.location));
  async function autocomplete(query, near, sessionToken) {
    let list = [];
    try { list = (await post("/api/autocomplete", { query, near: point(near), sessionToken })).suggestions || []; } catch { /* use the backup */ }
    list = insideOnly(list);
    if (list.length) return list;
    try {
      list = await photonDirect(query, near);
      const m = query.match(/^\s*(\d+[a-zA-Z]?(?:-\d+)?)\s+(.+)/); // keep a typed house number
      if (m) list = list.map((x) => (x.kind === "street" && !/^\d/.test(x.name) ? { ...x, name: `${m[1]} ${x.name}`, label: `${m[1]} ${x.label}`, approx: true } : x));
    } catch { /* nothing more to try */ }
    return insideOnly(list);
  }
  // The real Quezon City border: the map locks to it and greys out everything outside
  function loadBorder() {
    return fetch(base + "/api/qc-boundary").then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
      .then((d) => K.maps.setBoundary(d.geometry)).catch(() => { /* the rough box is used instead */ });
  }
  // Backup: ask Photon (OpenStreetMap search-as-you-type) straight from this phone/browser.
  const QC = { w: 120.98, s: 14.58, e: 121.14, n: 14.79 };
  const OTHER = /\b(manila|caloocan|marikina|pasig|san juan|mandaluyong|valenzuela|malabon|navotas|makati|rizal|bulacan|san mateo|rodriguez)\b/i;
  async function photonDirect(query, near) {
    const b = near || { latitude: 14.6507, longitude: 121.0494 };
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=15&lang=en&bbox=${QC.w},${QC.s},${QC.e},${QC.n}&lat=${b.latitude}&lon=${b.longitude}`;
    const data = await (await fetch(url)).json();
    const seen = new Set();
    return (data.features || []).map((f) => {
      const p = f.properties || {}, [lon, lat] = (f.geometry && f.geometry.coordinates) || [];
      const houseLine = p.housenumber ? `${p.housenumber} ${p.street || ""}`.trim() : "";
      const name = p.name || houseLine || p.street || "";
      const area = [p.name && p.street && p.name !== p.street ? (p.housenumber ? houseLine : p.street) : "", p.district || p.locality, "Quezon City"]
        .filter((x, i, a) => x && a.indexOf(x) === i && x !== name);
      const where = [p.city, p.county, p.district, p.locality, p.state].filter(Boolean).join(", ");
      const inQC = /quezon city/i.test(where) || (!OTHER.test(where) && lat >= QC.s && lat <= QC.n && lon >= QC.w && lon <= QC.e);
      const street = p.osm_key === "highway" || p.type === "street";
      const kind = p.housenumber ? "place" : street ? "street" : /district|locality|suburb|quarter|neighbourhood/.test(p.type + " " + p.osm_value) ? "area" : "place";
      return inQC && name ? { id: "pd:" + (p.osm_id || lat + "," + lon), name, sub: area.join(", "), label: [name, ...area].join(", "), kind, location: { latitude: lat, longitude: lon } } : null;
    }).filter((x) => x && Number.isFinite(x.location.latitude) && !seen.has(x.label) && seen.add(x.label)).slice(0, 8);
  }

  async function placeDetails(placeId, sessionToken) {
    return post("/api/place-details", { placeId, sessionToken });
  }

  async function planCommute({ originText, destinationText, origin, destination, beginnerMode, language, busHints }) {
    const data = await post("/api/commute-plan", {
      origin: { text: originText, location: point(origin) },
      destination: { text: destinationText, location: point(destination) },
      beginnerMode, language, busHints
    });
    return { plan: data.plan || "", guide: data.guide || null, grounded: !!data.usedMapsGrounding, sources: data.sources || [], language: data.language, model: data.model, transit: data.transit || null, account: data.account || null };
  }

  // Map tap or GPS position -> readable address. Returns { label, inArea } (inArea null = unknown).
  async function reverseGeocode(lat, lng) {
    const pinnedLabel = `${K.t("place.pinned")} (${lat.toFixed(5)}, ${lng.toFixed(5)}), Quezon City`;
    try {
      const r = await post("/api/reverse", { latitude: lat, longitude: lng });
      return { ...r, label: r.label || pinnedLabel };
    } catch { /* try OpenStreetMap directly */ }
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`;
      const data = await (await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(4000) })).json();
      if (data && data.display_name) return { label: data.display_name, inArea: /quezon city/i.test(data.display_name) };
    } catch { /* use the fallback below */ }
    return { label: pinnedLabel, inArea: K.maps.inQC({ latitude: lat, longitude: lng }) ? null : false };
  }

  const PROFILES = { drive: "routed-car", walk: "routed-foot", bike: "routed-bike" };
  const junctionWait = { drive: [5, 10], walk: [6, 12], bike: [4, 8] };
  const manilaClock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila", weekday: "short", hour: "2-digit", hourCycle: "h23"
  });

  // Add a rough allowance for intersections where trips may stop for cross traffic.
  function withJunctionDelays(route, profile, departure) {
    const { weekday, hour } = Object.fromEntries(manilaClock.formatToParts(departure).map(({ type, value }) => [type, value]));
    const h = Number(hour);
    const busier = weekday !== "Sat" && weekday !== "Sun" && ((h >= 7 && h < 10) || (h >= 16 && h < 20));
    const seen = new Set();
    let delay = 0;
    for (const { steps } of route.legs) {
      for (const step of steps) {
        (step.intersections || []).forEach((junction, index) => {
          if ((index === 0 && step.maneuver.type === "depart") || step.maneuver.type === "arrive") return;
          const branches = junction.bearings?.length || 0;
          if (branches < 3 || !junction.location) return;
          const key = junction.location.join(",");
          if (seen.has(key)) return;
          seen.add(key);
          delay += junctionWait[profile][branches >= 4 ? 1 : 0];
        });
      }
    }
    return { ...route, duration: route.duration + Math.round(delay * (busier ? 1.5 : 1)),
      trafficEstimate: seen.size ? "junctions" : "unavailable" };
  }

  async function drivingWithTraffic(a, b, alternatives) {
    const latLng = (p) => ({ lat: p.latitude, lng: p.longitude });
    const coordinate = (p) => [p.lng, p.lat];
    await K.maps.load();
    if (!K.maps.supported()) return [];
    const { Route } = await google.maps.importLibrary("routes");
    const { routes = [], fallbackInfo } = await Route.computeRoutes({
      origin: latLng(a), destination: latLng(b), travelMode: "DRIVING", routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: alternatives, polylineQuality: "HIGH_QUALITY", language: K.lang === "tl" ? "fil" : "en",
      fields: ["path", "legs", "distanceMeters", "durationMillis", "warnings"]
    });
    if (fallbackInfo && fallbackInfo.routingMode !== "TRAFFIC_AWARE") return [];

    return routes.flatMap((route) => {
      if (!Number.isFinite(route.durationMillis) || !Number.isFinite(route.distanceMeters) || !(route.path?.length >= 2)) return [];
      const coordinates = route.path.map(coordinate);
      const steps = (route.legs || []).flatMap((leg) => leg.steps || []).flatMap((step, i) => {
        const point = step.path?.[0];
        if (!point) return [];
        const maneuver = (step.maneuver || "").toLowerCase().replace(/_/g, " ");
        const modifier = /(?:slight |sharp )?(?:left|right)|straight|uturn/.exec(maneuver)?.[0];
        const instructions = (step.instructions || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        return [{ instructions, distance: step.distanceMeters || 0, maneuver: {
          type: i === 0 ? "depart" : maneuver.includes("roundabout") ? "roundabout" : "turn", modifier, location: coordinate(point)
        } }];
      });
      if (!steps.length) return [];
      steps.push({ distance: 0, maneuver: { type: "arrive", location: coordinates[coordinates.length - 1] } });
      return [{ geometry: { type: "LineString", coordinates }, legs: [{ steps }],
        duration: route.durationMillis / 1000, distance: route.distanceMeters, warnings: route.warnings,
        trafficEstimate: "google" }];
    }).sort((x, y) => x.duration - y.duration);
  }

  async function roadRoutes(profile, a, b, alternatives = true) {
    const departure = new Date();
    if (profile === "drive") {
      const traffic = await drivingWithTraffic(a, b, alternatives).catch(() => []);
      if (traffic.length) return traffic;
    }
    const url = `${ROUTER}/${PROFILES[profile]}/route/v1/driving/${a.longitude},${a.latitude};${b.longitude},${b.latitude}` +
      `?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = await res.json();
    if (!res.ok || !data.routes?.length) throw new Error("no route");
    return data.routes.map((route) => withJunctionDelays(route, profile, departure)).sort((x, y) => x.duration - y.duration);
  }

  async function feedback(payload) { return post("/api/feedback", payload); }

  // Every mapped terminal, stop, and station in Quezon City (OpenStreetMap), loaded once per visit.
  let pointsPromise = null;
  function transitPoints() {
    if (!pointsPromise) {
      pointsPromise = fetch(base + "/api/transit-points").then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
        .then((d) => { K.transitPoints = d.features || []; return d; })
        .catch((e) => { pointsPromise = null; throw e; });
    }
    return pointsPromise;
  }

  K.api = { feedback, transitPoints, loadBorder, searchPlaces, autocomplete, placeDetails, planCommute, reverseGeocode, roadRoutes };
})(window.Komute);
