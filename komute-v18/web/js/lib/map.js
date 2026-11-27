// Vector map (MapLibre GL + OpenFreeMap tiles): sharp on phones, can rotate and tilt like Google/Apple Maps.
// Every map is limited to Quezon City. This file wraps the map so the screens only call simple functions.
(function (K) {
  const cfg = window.KOMUTE_CONFIG || {};
  const QC_CENTER = [121.0437, 14.676];
  let QC_BOUNDS = [[120.95, 14.55], [121.17, 14.82]]; // just around the city; made exact once the real border loads
  let qcGeom = null;                                  // the real Quezon City border (GeoJSON), when loaded
  const instances = new Set();
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
      maxBounds: QC_BOUNDS, minZoom: 10, maxZoom: 19, attributionControl: false,
      pitchWithRotate: true, dragRotate: true, touchZoomRotate: true
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), "top-right");
    map.touchZoomRotate.enableRotation();
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");
    // Keep the map credit collapsed to the small "i" button (tap to read it); the credit itself must stay.
    const foldCredit = () => el.querySelectorAll(".maplibregl-ctrl-attrib").forEach((a) => a.classList.remove("maplibregl-compact-show"));
    map.on("load", foldCredit); map.on("styledata", foldCredit);

    const state = { routes: null, me: null, onRouteClick: null };
    const markers = { a: null, b: null, me: null, labels: [] };

    function beforeLabels() {
      const layers = (map.getStyle() && map.getStyle().layers) || [];
      const first = layers.find((l) => l.type === "symbol");
      return first ? first.id : undefined;
    }

    // Our route and accuracy layers are lost when the map style changes, so add them again on every style load.
    // Grey out everything outside Quezon City and draw the city border
    function addMask() {
      if (!qcGeom || map.getSource("k-qc")) return;
      const polys = qcGeom.type === "MultiPolygon" ? qcGeom.coordinates : [qcGeom.coordinates];
      const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
      map.addSource("k-qc-mask", { type: "geojson", data: { type: "Feature", geometry: { type: "Polygon", coordinates: [world, ...polys.map((p) => p[0])] } } });
      map.addSource("k-qc", { type: "geojson", data: { type: "Feature", geometry: { type: "MultiPolygon", coordinates: polys } } });
      const before = map.getLayer("k-routes-faint") ? "k-routes-faint" : undefined;
      map.addLayer({ id: "k-qc-mask", type: "fill", source: "k-qc-mask", paint: { "fill-color": "#e9eeeb", "fill-opacity": 0.78 } }, before);
      map.addLayer({ id: "k-qc-line", type: "line", source: "k-qc", paint: { "line-color": "#047857", "line-width": 2.5, "line-opacity": 0.9 } }, before);
    }

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
        map.addLayer({ id: "k-routes-casing", type: "line", source: "k-routes", filter: ["all", ["==", ["get", "sel"], 1], ["==", ["get", "dash"], 0]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#0b2f9e", "line-width": 11 } }, before);
        map.addLayer({ id: "k-routes-main", type: "line", source: "k-routes", filter: ["all", ["==", ["get", "sel"], 1], ["==", ["get", "dash"], 0]],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#2563eb", "line-width": 7 } }, before);
        map.addLayer({ id: "k-routes-dash", type: "line", source: "k-routes", filter: ["all", ["==", ["get", "sel"], 1], ["==", ["get", "dash"], 1]],
          layout: { "line-cap": "butt", "line-join": "round" },
          paint: { "line-color": "#2563eb", "line-width": 5, "line-dasharray": [1.2, 1.4] } }, before);
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
      if (!map.getSource("k-transit")) {
        map.addSource("k-transit", { type: "geojson", data: transitData() });
        map.addLayer({ id: "k-transit", type: "circle", source: "k-transit",
          layout: { visibility: state.transit ? "visible" : "none" },
          paint: { "circle-color": ["get", "color"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 15, 8], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      }
      if (!map.getSource("k-pt") && K.transitPoints) {
        map.addSource("k-pt", { type: "geojson", data: { type: "FeatureCollection", features: K.transitPoints } });
        const vis = state.transit ? "visible" : "none";
        const color = ["match", ["get", "k"], "terminal", "#1d4ed8", "jeepney", "#b45309", "jeepstop", "#f59e0b", "tricycle", "#15803d",
          "uv", "#9d174d", "train", "#6d28d9", "#0ea5e9"];
        map.addLayer({ id: "k-pt-stops", type: "circle", source: "k-pt", minzoom: 14.5, filter: ["in", ["get", "k"], ["literal", ["stop", "jeepstop"]]],
          layout: { visibility: vis }, paint: { "circle-color": color, "circle-radius": 4.5, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
        map.addLayer({ id: "k-pt-major", type: "circle", source: "k-pt", minzoom: 11.5, filter: ["in", ["get", "k"], ["literal", ["terminal", "jeepney", "tricycle", "uv", "train"]]],
          layout: { visibility: vis }, paint: { "circle-color": color, "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 4, 16, 8], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      }
      if (!map.getSource("k-me-acc")) {
        map.addSource("k-me-acc", { type: "geojson", data: state.me ? K.geo.circle(state.me.p, state.me.acc) : empty() });
        map.addLayer({ id: "k-me-acc", type: "fill", source: "k-me-acc", paint: { "fill-color": "#1a73e8", "fill-opacity": 0.13 } });
      }
    }
    // Street View coverage: blue lines show where Street View exists (shown only while the Street View button is on)
    function addStreetCoverage() {
      if (map.getSource("k-sv")) return;
      map.addSource("k-sv", { type: "raster", tileSize: 256, maxzoom: 21, attribution: "Street View © Google",
        tiles: ["https://mts1.google.com/vt?hl=en&lyrs=svv|cb_client:apiv3&style=40,18&x={x}&y={y}&z={z}"] });
      map.addLayer({ id: "k-sv", type: "raster", source: "k-sv", layout: { visibility: state.street ? "visible" : "none" }, paint: { "raster-opacity": 0.9 } });
    }
    // Live traffic: green / orange / red road colours, shown only while the Traffic button is on
    function addTraffic() {
      if (map.getSource("k-traffic")) return;
      map.addSource("k-traffic", { type: "raster", tileSize: 256, maxzoom: 19, attribution: "Traffic © Google",
        tiles: ["https://mt1.google.com/vt?lyrs=h@159000000,traffic|seconds_into_week:-1&style=3&x={x}&y={y}&z={z}"] });
      map.addLayer({ id: "k-traffic", type: "raster", source: "k-traffic", layout: { visibility: state.traffic ? "visible" : "none" },
        paint: { "raster-opacity": 0.85 } }, map.getLayer("k-routes-faint") ? "k-routes-faint" : undefined);
    }
    map.on("style.load", () => { addLayers(); addMask(); addStreetCoverage(); addTraffic(); });
    instances.add({ map, addMask });
    map.on("remove", () => { for (const i of instances) if (i.map === map) instances.delete(i); });

    const empty = () => ({ type: "FeatureCollection", features: [] });
    const LINE_COLOR = { "MRT-3": "#2563eb", "LRT-1": "#16a34a", "LRT-2": "#7e22ce", "EDSA Carousel": "#dc2626" };
    const PT_COLOR = { terminal: "#1d4ed8", jeepney: "#b45309", jeepstop: "#f59e0b", tricycle: "#15803d", uv: "#9d174d", train: "#6d28d9", stop: "#0ea5e9" };
    function transitData() {
      return { type: "FeatureCollection", features: (K.data().transit.stations || []).map((st) => ({
        type: "Feature", geometry: { type: "Point", coordinates: [st.lng, st.lat] },
        properties: { name: st.name, line: st.line, color: LINE_COLOR[st.line] || "#444" } })) };
    }
    state.transit = K.store.get("showTransit", false);
    // One tap handler: a station tap opens the station, any other tap goes to fn(e)
    map.on("click", (e) => {
      let hit = [];
      try {
        const layers = ["k-transit", "k-pt-major", "k-pt-stops"].filter((id) => map.getLayer(id));
        if (state.transit && layers.length) hit = map.queryRenderedFeatures([[e.point.x - 9, e.point.y - 9], [e.point.x + 9, e.point.y + 9]], { layers });
      } catch { hit = []; }
      if (hit.length && state.onStation) {
        const f = hit[0], p = f.properties, lngLat = { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
        // stations from our list have "line"; OpenStreetMap points have k (kind), n (name), r (routes)
        state.onStation(p.line ? { ...p, kind: p.line === "EDSA Carousel" ? "carousel" : "train", lngLat }
          : { name: p.n || K.t("pt." + p.k), line: K.t("pt." + p.k), color: PT_COLOR[p.k] || "#0ea5e9", kind: p.k, routes: p.r || "", lngLat });
        return;
      }
      if (state.street) { api.openStreetView(e.lngLat); return; } // Street View mode: a tap opens Street View there
      if (state.onTap) state.onTap(e);
    });
    // Run fn as soon as the style is usable. "load" fires only once, so wait on styledata/idle instead, or lines would never be drawn.
    const ready = (fn) => {
      if (map.isStyleLoaded()) return fn();
      const h = () => { if (!map.isStyleLoaded()) return; map.off("styledata", h); map.off("idle", h); fn(); };
      map.on("styledata", h); map.on("idle", h);
    };
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
          if (!markers[k]) {
            markers[k] = new maplibregl.Marker({ element: pinEl(k), anchor: "bottom", draggable: !!opts.draggable });
            // drag a pin to fine-tune the exact spot (house, gate, corner)
            markers[k].on("dragend", () => { if (state.onDrag) state.onDrag(k, markers[k].getLngLat()); });
          }
          markers[k].setLngLat([p.longitude, p.latitude]).addTo(map);
        }
        if (fit) api.fit([a, b].filter(Boolean));
      },

      onPinDrag(fn) { state.onDrag = fn; },
      onTap(fn) { state.onTap = fn; },
      onStation(fn) { state.onStation = fn; },
      // Show/hide train stations and EDSA Carousel stops
      setTransit(on, btn) {
        state.transit = !!on;
        K.store.set("showTransit", state.transit);
        if (btn) btn.setAttribute("aria-pressed", String(state.transit));
        const apply = () => {
          addLayers();
          ["k-transit", "k-pt-major", "k-pt-stops"].forEach((id) => { if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", state.transit ? "visible" : "none"); });
          const legend = map.getContainer().parentElement.querySelector(".k-legend");
          if (legend) legend.classList.toggle("d-none", !state.transit);
        };
        ready(apply);
        // load terminals, stops, TODA and jeepney terminals the first time
        if (state.transit && !K.transitPoints) {
          if (btn) btn.classList.add("k-loading-btn");
          K.api.transitPoints().then(() => ready(apply)).catch(() => {
            const legend = map.getContainer().parentElement.querySelector(".k-legend");
            if (legend) legend.querySelector(".k-legend-err").classList.remove("d-none");
          }).finally(() => btn && btn.classList.remove("k-loading-btn"));
        }
      },
      transitOn: () => state.transit,

      // A small info bubble on the map (used for "Start here / Go here")
      popup(lngLat, html) {
        if (state.pop) state.pop.remove();
        const wrap = map.getContainer().parentElement;
        wrap.classList.add("k-pop-open");
        const pop = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "290px", offset: 8 })
          .setLngLat(lngLat).setHTML(html).addTo(map);
        if (pop.on) pop.on("close", () => { if (state.pop === pop) wrap.classList.remove("k-pop-open"); });
        state.pop = pop;
        return pop.getElement();
      },
      closePopup() {
        if (state.pop) { state.pop.remove(); state.pop = null; }
        map.getContainer().parentElement.classList.remove("k-pop-open");
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
        state.routes = { type: "FeatureCollection", features: (list || []).flatMap((r, i) => {
          if (!r) return [];
          const segs = r.segments || [r.geometry];
          return segs.filter((g) => g && g.coordinates && g.coordinates.length > 1).map((g) => ({
            type: "Feature", geometry: { type: "LineString", coordinates: g.coordinates }, properties: { idx: i, sel: !faint && i === sel ? 1 : 0, faint: faint ? 1 : 0, dash: g.dashed ? 1 : 0 } }));
        }) };
        ready(() => { addLayers(); setData("k-routes", state.routes); });
        markers.labels.forEach((m) => m.remove());
        markers.labels = [];
        if (!faint && labels && list) {
          list.forEach((r, i) => {
            if (!r) return;
            const c = ((r.segments && r.segments[0]) || r.geometry).coordinates, mid = c[Math.floor(c.length / 2)];
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
        const c = route.segments ? route.segments.flatMap((g) => g.coordinates) : route.geometry.coordinates;
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
      // Street View button: turns the blue Street View lines on or off; tapping a spot then opens Street View there
      toggleStreet(btn) {
        state.street = !state.street;
        if (map.getLayer("k-sv")) map.setLayoutProperty("k-sv", "visibility", state.street ? "visible" : "none");
        if (btn) { btn.setAttribute("aria-pressed", String(state.street)); }
        const old = document.getElementById("k-sv-hint"); if (old) old.remove();
        if (state.street) {
          if (map.getZoom() < 14) map.easeTo({ zoom: 14, duration: 400 });
          const h = document.createElement("div"); h.id = "k-sv-hint"; h.className = "k-sv-hint"; h.textContent = K.t("map.streetHint");
          map.getContainer().appendChild(h); setTimeout(() => h.remove(), 6000);
        }
      },
      toggleTraffic(btn) {
        state.traffic = !state.traffic;
        if (map.getLayer("k-traffic")) map.setLayoutProperty("k-traffic", "visibility", state.traffic ? "visible" : "none");
        if (btn) btn.setAttribute("aria-pressed", String(state.traffic));
      },
      // Shows Google Street View for a spot in a panel on top of our own page
      openStreetView(lngLat) {
        const c = lngLat || map.getCenter(), ll = c.lat.toFixed(6) + "," + c.lng.toFixed(6);
        const src = "https://maps.google.com/maps?layer=c&cbll=" + ll + "&cbp=12,0,0,0,0&output=svembed";
        const out = "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + ll;
        let box = document.getElementById("k-sv");
        if (box) box.remove();
        box = document.createElement("div"); box.id = "k-sv"; box.className = "k-sv";
        box.innerHTML = '<div class="k-sv-bar"><strong><i class="bi bi-person-walking"></i> ' + K.esc(K.t("map.street")) + '</strong>' +
          '<span><a class="k-sv-open" href="' + out + '" target="_blank" rel="noopener">' + K.esc(K.t("map.streetOpen")) + '</a>' +
          '<button type="button" class="btn-close btn-close-white" aria-label="Close"></button></span></div>' +
          '<iframe title="Street View" allowfullscreen loading="eager" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
          '<p class="k-sv-note">' + K.esc(K.t("map.streetNote")) + '</p>';
        document.body.appendChild(box);
        box.querySelector("iframe").src = src;
        const close = () => { box.remove(); document.removeEventListener("keydown", esc); };
        const esc = (e) => { if (e.key === "Escape") close(); };
        box.querySelector(".btn-close").onclick = close;
        document.addEventListener("keydown", esc);
      },
      labelStyle(btn) { if (btn) { btn.title = K.t("map.style." + styleName); btn.setAttribute("aria-label", btn.title); } },
      styleName: () => styleName
    };
    return api;
  }

  // ---------- Quezon City border ----------
  function ringHas(ring, lon, lat) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // Inside the real border once it is loaded; before that, inside a rough box
  function inQC(p) {
    if (!(p.longitude >= 120.98 && p.longitude <= 121.14 && p.latitude >= 14.58 && p.latitude <= 14.79)) return false;
    if (!qcGeom) return true;
    const polys = qcGeom.type === "MultiPolygon" ? qcGeom.coordinates : [qcGeom.coordinates];
    return polys.some((rings) => ringHas(rings[0], p.longitude, p.latitude) && !rings.slice(1).some((h) => ringHas(h, p.longitude, p.latitude)));
  }
  // Called once the server sends the real border: lock every map to the city and grey out the rest
  function setBoundary(geom) {
    if (!geom || !/^(Multi)?Polygon$/.test(geom.type)) return;
    qcGeom = geom;
    const polys = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
    let w = 180, s = 90, e = -180, n = -90;
    polys.forEach((p) => p[0].forEach(([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }));
    const pad = 0.012; // a little room around the edge so pins on the border still fit
    QC_BOUNDS = [[w - pad, s - pad], [e + pad, n + pad]];
    for (const i of instances) {
      try { i.map.setMaxBounds(QC_BOUNDS); i.map.once("idle", () => {}); const go = () => i.addMask(); i.map.isStyleLoaded() ? go() : i.map.once("load", go); } catch { /* map was removed */ }
    }
    document.dispatchEvent(new CustomEvent("komute:border"));
  }

  K.maps = { create, load: async () => {}, supported, QC_CENTER, inQC, setBoundary };
})(window.Komute);
