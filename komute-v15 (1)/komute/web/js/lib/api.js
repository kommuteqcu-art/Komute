// Talks to the Komute backend (same endpoints as the Android app) and the free OpenStreetMap router.
(function (K) {
  const cfg = window.KOMUTE_CONFIG || {};
  const base = (cfg.API_BASE || "").replace(/\/$/, "");
  const ROUTER = (cfg.ROUTER || "https://routing.openstreetmap.de").replace(/\/$/, "");

  async function post(path, body) {
    let res;
    try {
      res = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      throw new Error(K.t("err.backend"));
    }
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) throw new Error(data.error || `Server returned HTTP ${res.status}`);
    return data;
  }

  const point = (p) => (p ? { latitude: p.latitude, longitude: p.longitude } : null);

  async function searchPlaces(query, near) {
    const data = await post("/api/places", { query, near: point(near) });
    return data.suggestions || [];
  }

  async function planCommute({ originText, destinationText, origin, destination, beginnerMode, language }) {
    const data = await post("/api/commute-plan", {
      origin: { text: originText, location: point(origin) },
      destination: { text: destinationText, location: point(destination) },
      beginnerMode, language
    });
    return { plan: data.plan || "", guide: data.guide || null, grounded: !!data.usedMapsGrounding, sources: data.sources || [], language: data.language, model: data.model };
  }

  // Map tap or GPS position -> readable address. Returns { label, inArea } (inArea null = unknown).
  async function reverseGeocode(lat, lng) {
    try {
      const r = await post("/api/reverse", { latitude: lat, longitude: lng });
      if (r && r.label) return r;
    } catch { /* try OpenStreetMap directly */ }
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`;
      const data = await (await fetch(url, { headers: { Accept: "application/json" } })).json();
      if (data && data.display_name) return { label: data.display_name, inArea: /quezon city/i.test(data.display_name) };
    } catch { /* use the fallback below */ }
    return { label: `${K.t("place.pinned")} (${lat.toFixed(5)}, ${lng.toFixed(5)}), Quezon City`, inArea: K.maps.inQC({ latitude: lat, longitude: lng }) ? null : false };
  }

  // OSRM road routes. profile: drive | walk | bike
  const PROFILES = { drive: "routed-car", walk: "routed-foot", bike: "routed-bike" };
  async function roadRoutes(profile, a, b, alternatives = true) {
    const url = `${ROUTER}/${PROFILES[profile]}/route/v1/driving/${a.longitude},${a.latitude};${b.longitude},${b.latitude}` +
      `?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.routes || !data.routes.length) throw new Error("no route");
    return data.routes;
  }

  K.api = { searchPlaces, planCommute, reverseGeocode, roadRoutes };
})(window.Komute);
