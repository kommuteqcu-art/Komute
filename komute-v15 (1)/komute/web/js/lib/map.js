// Vector map (MapLibre GL + OpenFreeMap tiles): sharp on phones, can rotate and tilt like Google/Apple Maps.
// Every map is limited to Quezon City. This file wraps the map so the screens only call simple functions.
(function (K) {
  const cfg = window.KOMUTE_CONFIG || {};
  const QC_CENTER = [121.0437, 14.676];
  const QC_BOUNDS = [[120.90, 14.52], [121.22, 14.85]]; // a little bigger than the city so pins near the edge fit
  const STYLES = {
    streets: cfg.MAP_STYLE || "https://tiles.openfreemap.org/styles/liberty",
    light: "https://tiles.openfreemap.org/styles/positron",
    satellite: {
      version: 8,
      sources: { sat: { type: "raster", tileSize: 256, maxzoom: 19, attribution: "Tiles © Esri",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] } },
      layers: [{ id: "sat", type: "raster", source: "sat" }]
    }
  };
  const STYLE_ORDER = ["streets", "light", "satellite"];
  const PIN_SVG = `<svg viewBox="0 0 32 42" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1z" fill="currentColor" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="6" fill="#fff"/></svg>`;

  function supported() {
    if (!window.maplibregl) return false;
    try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
  }

  function create(containerId, opts = {}) {
    const el = document.getElementById(containerId);
    if (!supported()) {
      el.innerHTML = `<div class="k-map-fallback"><i class="bi bi-map"></i><p>${K.esc(K.t("map.unsupported"))}</p></div>`;
      return null;
    }
    let styleName = K.store.get("mapStyle", "streets");
    if (!STYLES[styleName]) styleName = "streets";
    const map = new maplibregl.Map({
      container: el, style: STYLES[styleName], center: opts.center || QC_CENTER, zoom: opts.zoom || 12,
      maxBounds: QC_BOUNDS, minZoom: 10, maxZoom: 19, attributionControl: { compact: true },
      pitchWithRotate: true, dragRotate: true, touchZoomRotate: true
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), "top-right");
    map.touchZoomRotate.enableRotation();

    const state = { routes: null, me: null, onRouteClick: null };
    const markers = { a: null, b: null, me: null, labels: [] };

    function beforeLabels() {
      const layers = (map.getStyle() && map.getStyle().layers) || [];
      const first = layers.find((l) => l.type === "symbol");
      return first ? first.id : undefined;
    }

    // Our route and accuracy layers are lost when the map style changes, so add them again on every style load.
    function addLayers() {
      if (!map.getSource("k-routes")) {
        map.addSource("k-routes", { type: "geojson", data: state.routes || empty() });
        const before = beforeLabels();
        map.addLayer({ id: "k-routes-faint", type: "line", source: "k-routes", filter: ["==", ["get", "faint"], 1],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#5b7fd6", "line-width": 4, "line-opacity": 0.7, "line-dasharray": [1.5, 1.5] } }, before);
        map.addLayer({ id: "k-routes-alt", type: "line", source: "k-routes",
          filter: ["all", ["==", ["get", "sel"], 0], ["==", ["get", "faint"], 0]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#9db7ef", "line-width": 7 } }, before);
        map.addLayer({ id: "k-routes-casing", type: "line", source: "k-routes", filter: ["==", ["get", "sel"], 1],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0b2f9e", "line-width": 11 } }, before);
        map.addLayer({ id: "k-routes-main", type: "line", source: "k-routes", filter: ["==", ["get", "sel"], 1],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#2563eb", "line-width": 7 } }, before);
        if (!state.bound) { // bind once; the layer keeps the same id after a style change
          state.bound = true;
          map.on("click", "k-routes-alt", (e) => {
            const f = e.features && e.features[0];
            if (f && state.onRouteClick) state.onRouteClick(f.properties.idx);
          });
          map.on("mouseenter", "k-routes-alt", () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", "k-routes-alt", () => { map.getCanvas().style.cursor = ""; });
        }
      }
      if (!map.getSource("k-me-acc")) {
        map.addSource("k-me-acc", { type: "geojson", data: state.me ? K.geo.circle(state.me.p, state.me.acc) : empty() });
        map.addLayer({ id: "k-me-acc", type: "fill", source: "k-me-acc", paint: { "fill-color": "#1a73e8", "fill-opacity": 0.13 } });
      }
    }
    map.on("style.load", addLayers);

    const empty = () => ({ type: "FeatureCollection", features: [] });
    const ready = (fn) => (map.isStyleLoaded() ? fn() : map.once("load", fn));
    const setData = (id, data) => { const s = map.getSource(id); if (s) s.setData(data); };

    function pinEl(kind) {
      const d = document.createElement("div");
      d.className = "k-pin k-pin-" + kind;
      d.innerHTML = PIN_SVG + `<b>${kind === "a" ? "A" : "B"}</b>`;
      d.title = K.t(kind === "a" ? "map.pinA" : "map.pinB");
      return d;
    }

    const api = {
      map,
      ready,
      resize: () => map.resize(),

      setEndpoints(a, b, { fit = true } = {}) {
        for (const [k, p] of [["a", a], ["b", b]]) {
          if (!p) { if (markers[k]) { markers[k].remove(); markers[k] = null; } continue; }
          if (!markers[k]) markers[k] = new maplibregl.Marker({ element: pinEl(k), anchor: "bottom" });
          markers[k].setLngLat([p.longitude, p.latitude]).addTo(map);
        }
        if (fit) api.fit([a, b].filter(Boolean));
      },

      fit(points, { padding = 70, maxZoom = 16 } = {}) {
        if (!points.length) return;
        if (points.length === 1) { map.easeTo({ center: K.geo.ll(points[0]), zoom: 15, duration: 600 }); return; }
        const lngs = points.map((p) => p.longitude), lats = points.map((p) => p.latitude);
        map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: typeof padding === "number" ? { top: padding + 30, bottom: padding, left: padding, right: padding } : padding, maxZoom, duration: 700 });
      },

      // list = OSRM routes, sel = selected index, faint = show as dashed preview
      setRoutes(list, sel, { faint = false, labels = true, onPick } = {}) {
        state.onRouteClick = onPick || null;
        state.routes = { type: "FeatureCollection", features: (list || []).map((r, i) => ({
          type: "Feature", geometry: r.geometry, properties: { idx: i, sel: !faint && i === sel ? 1 : 0, faint: faint ? 1 : 0 } })) };
        ready(() => { addLayers(); setData("k-routes", state.routes); });
        markers.labels.forEach((m) => m.remove());
        markers.labels = [];
        if (!faint && labels && list) {
          list.forEach((r, i) => {
            const c = r.geometry.coordinates, mid = c[Math.floor(c.length / 2)];
            const tag = document.createElement("button");
            tag.type = "button";
            tag.className = "k-eta" + (i === sel ? " on" : "");
            tag.textContent = K.fmt.mins(r.duration);
            tag.onclick = (e) => { e.stopPropagation(); if (onPick) onPick(i); };
            markers.labels.push(new maplibregl.Marker({ element: tag }).setLngLat(mid).addTo(map));
          });
        }
      },

      fitRoute(route, padding) {
        const c = route.geometry.coordinates;
        api.fit(c.map(K.geo.pt), { padding: padding || 60, maxZoom: 17 });
      },

      // Blue "you are here" dot. heading (degrees) shows a direction cone, like Google Maps.
      setMe(p, acc, heading) {
        if (!p) { if (markers.me) { markers.me.remove(); markers.me = null; } state.me = null; setData("k-me-acc", empty()); return; }
        state.me = { p, acc: Math.min(acc || 20, 300) };
        if (!markers.me) {
          const d = document.createElement("div");
          d.className = "k-me";
          d.innerHTML = `<span class="k-me-cone"></span><span class="k-me-dot"></span>`;
          markers.me = new maplibregl.Marker({ element: d, rotationAlignment: "map", pitchAlignment: "map" });
        }
        markers.me.setLngLat(K.geo.ll(p)).addTo(map);
        const el = markers.me.getElement();
        el.classList.toggle("has-heading", typeof heading === "number");
        if (typeof heading === "number") markers.me.setRotation(heading);
        ready(() => { addLayers(); setData("k-me-acc", K.geo.circle(p, state.me.acc)); });
      },

      // Round compass button: the needle always points north. Tap = face north again.
      bindCompass(btn, onTapWhenNorth) {
        if (!btn) return;
        const needle = btn.querySelector(".k-needle");
        const update = () => {
          const b = map.getBearing();
          if (needle) needle.style.transform = `rotate(${-b}deg)`;
          btn.classList.toggle("rotated", Math.abs(b) > 0.5 || map.getPitch() > 1);
        };
        map.on("rotate", update);
        map.on("pitch", update);
        update();
        btn.onclick = () => {
          if (Math.abs(map.getBearing()) > 0.5 || map.getPitch() > 1) map.easeTo({ bearing: 0, pitch: 0, duration: 500 });
          else if (onTapWhenNorth) onTapWhenNorth();
        };
      },

      // Cycles Streets -> Light -> Satellite
      nextStyle(btn) {
        styleName = STYLE_ORDER[(STYLE_ORDER.indexOf(styleName) + 1) % STYLE_ORDER.length];
        K.store.set("mapStyle", styleName);
        map.setStyle(STYLES[styleName], { diff: false });
        if (btn) api.labelStyle(btn);
      },
      labelStyle(btn) { if (btn) { btn.title = K.t("map.style." + styleName); btn.setAttribute("aria-label", btn.title); } },
      styleName: () => styleName
    };
    return api;
  }

  function inQC(p) { return p.longitude >= 120.98 && p.longitude <= 121.14 && p.latitude >= 14.58 && p.latitude <= 14.79; }

  K.maps = { create, supported, QC_CENTER, inQC };
})(window.Komute);
