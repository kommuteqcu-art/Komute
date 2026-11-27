// Google Maps adapter for the Plan and Results screens.
(function (K) {
  const QC_CENTER = [121.0437, 14.676];
  const STYLES = { streets: "roadmap", terrain: "terrain", satellite: "satellite" };
  const COLORS = { "MRT-3": "#2563eb", "LRT-1": "#16a34a", "LRT-2": "#7e22ce", "EDSA Carousel": "#dc2626",
    terminal: "#1d4ed8", jeepney: "#b45309", jeepstop: "#f59e0b", tricycle: "#15803d", uv: "#9d174d", train: "#6d28d9", stop: "#0ea5e9" };
  let bounds = { west: 120.95, south: 14.55, east: 121.17, north: 14.82 };
  let qcGeom, mapId, loading;
  let authFailed = false;
  const instances = [];

  const coord = ([lng, lat]) => ({ lat, lng });
  const point = ({ latitude: lat, longitude: lng }) => ({ lat, lng });
  const literal = (p) => typeof p.toJSON === "function" ? p.toJSON() : p;

  function fallback(el) {
    el.innerHTML = '<div class="k-map-fallback" role="status"><i class="bi bi-map" aria-hidden="true"></i><p data-i18n="map.unsupported">' +
      K.esc(K.t("map.unsupported")) + '</p></div>';
  }

  function load() {
    return loading ||= loadGoogle().catch((error) => console.warn("Google Maps:", error.message));
  }

  async function loadGoogle() {
    const base = (window.KOMUTE_CONFIG?.API_BASE || "").replace(/\/$/, "");
    const response = await fetch(base + "/api/map-config", { signal: AbortSignal.timeout(3500) });
    if (!response.ok) throw new Error("Map configuration could not be loaded");
    const config = await response.json();
    if (!config.browserKey) return;
    mapId = config.mapId;
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = setTimeout(() => finish(new Error("Maps script timed out")), 7000);
      function finish(error) {
        clearTimeout(timeout);
        window.komuteGoogleMapsReady = () => {};
        if (error) { script.remove(); reject(error); }
        else resolve();
      }
      window.gm_authFailure = () => {
        authFailed = true;
        for (const { el } of instances) fallback(el);
        finish(new Error("Maps authorization failed"));
      };
      window.komuteGoogleMapsReady = () => finish();
      const query = new URLSearchParams({ key: config.browserKey, v: "quarterly", libraries: "marker",
        loading: "async", callback: "komuteGoogleMapsReady" });
      script.src = "https://maps.googleapis.com/maps/api/js?" + query;
      script.async = true;
      script.onerror = () => finish(new Error("Maps script could not be loaded"));
      document.head.append(script);
    });
  }

  function supported() {
    return !authFailed && !!window.google?.maps?.marker?.AdvancedMarkerElement;
  }

  function create(containerId, opts = {}) {
    const el = document.getElementById(containerId);
    if (!supported()) { fallback(el); return null; }
    const maps = google.maps;
    const wrap = el.parentElement;
    let style = K.store.get("mapStyle", "streets");
    if (style === "light") style = "terrain";
    if (!Object.hasOwn(STYLES, style)) style = "streets";

    const map = new maps.Map(el, {
      center: coord(opts.center || QC_CENTER), zoom: opts.zoom || 12, minZoom: 10, maxZoom: 19,
      mapId, renderingType: "VECTOR", mapTypeId: STYLES[style],
      restriction: { latLngBounds: bounds, strictBounds: false },
      gestureHandling: "greedy", headingInteractionEnabled: true, tiltInteractionEnabled: true,
      disableDefaultUI: true, zoomControl: !matchMedia("(max-width: 767px)").matches,
      zoomControlOptions: { position: maps.ControlPosition.RIGHT_TOP }, clickableIcons: false
    });

    const state = { transit: K.store.get("showTransit", false) };
    const pins = {};
    const lines = [];
    const labels = [];
    const listeners = new Map();
    const info = new maps.InfoWindow({ maxWidth: 290 });
    const accuracy = new maps.Circle({ fillColor: "#1a73e8", fillOpacity: 0.13, strokeWeight: 0, clickable: false });
    const boundary = new maps.Data({ map, style: (f) => f.getProperty("mask")
      ? { fillColor: "#e9eeeb", fillOpacity: 0.66, strokeWeight: 0, clickable: false, zIndex: 0 }
      : { fillOpacity: 0, strokeColor: "#047857", strokeWeight: 2.5, clickable: false, zIndex: 1 } });
    const transit = new maps.Data({ map, style: transitStyle });
    let builtInStopsLoaded = false;
    let transitPoints;
    let me, pendingFit;

    function drawBoundary() {
      map.setOptions({ restriction: { latLngBounds: bounds, strictBounds: false } });
      boundary.forEach((feature) => boundary.remove(feature));
      if (!qcGeom) return;
      const polygons = qcGeom.type === "MultiPolygon" ? qcGeom.coordinates : [qcGeom.coordinates];
      const outer = [[119, 13], [123, 13], [123, 16], [119, 16], [119, 13]];
      boundary.addGeoJson({ type: "Feature", properties: { mask: true },
        geometry: { type: "Polygon", coordinates: [outer, ...polygons.map((rings) => rings[0])] } });
      boundary.addGeoJson({ type: "Feature", properties: {}, geometry: qcGeom });
    }
    instances.push({ el, drawBoundary });
    drawBoundary();

    function transitStyle(feature) {
      const line = feature.getProperty("line");
      const kind = feature.getProperty("k");
      const zoom = map.getZoom() || 12;
      const stop = kind === "stop" || kind === "jeepstop";
      return { visible: !!state.transit && (!!line || zoom >= (stop ? 14.5 : 11.5)), zIndex: 3,
        icon: { path: maps.SymbolPath.CIRCLE, scale: stop ? 4.5 : Math.min(8, Math.max(4, zoom - 8)),
          fillColor: COLORS[line || kind] || "#444", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 } };
    }

    function drawTransit() {
      if (state.transit && !builtInStopsLoaded) {
        const stations = (K.data().transit.stations || []).map((st) => ({
          type: "Feature", geometry: { type: "Point", coordinates: [st.lng, st.lat] },
          properties: { name: st.name, line: st.line }
        }));
        transit.addGeoJson({ type: "FeatureCollection", features: stations });
        builtInStopsLoaded = true;
      }
      if (state.transit && K.transitPoints && transitPoints !== K.transitPoints) {
        transitPoints = K.transitPoints;
        transit.addGeoJson({ type: "FeatureCollection", features: transitPoints });
      }
      transit.setStyle(transitStyle);
    }

    transit.addListener("click", ({ feature, latLng }) => {
      const lngLat = literal(latLng);
      const line = feature.getProperty("line");
      const kind = feature.getProperty("k");
      state.onStation?.(line
        ? { name: feature.getProperty("name"), line, color: COLORS[line] || "#444",
          kind: line === "EDSA Carousel" ? "carousel" : "train", lngLat }
        : { name: feature.getProperty("n") || K.t("pt." + kind), line: K.t("pt." + kind),
          color: COLORS[kind] || "#0ea5e9", kind, routes: feature.getProperty("r") || "", lngLat });
    });
    map.addListener("click", ({ latLng }) => {
      if (!latLng) return;
      if (state.street) { api.openStreetView(latLng); return; } // Street View mode: a tap looks around at that spot
      state.onTap?.({ lngLat: literal(latLng) });
    });
    map.addListener("zoom_changed", () => transit.setStyle(transitStyle));
    info.addListener("close", () => wrap.classList.remove("k-pop-open"));

    function marker(position, content, options) {
      const pin = new maps.marker.AdvancedMarkerElement({ map, position, ...options });
      pin.append(content);
      return pin;
    }

    // Keep the camera operations called by the existing views.
    const camera = {
      on(event, fn) {
        const callbacks = listeners.get(event) || new Map();
        if (!callbacks.has(fn)) callbacks.set(fn, map.addListener(event === "moveend" ? "idle" : event, fn));
        listeners.set(event, callbacks);
      },
      off(event, fn) {
        const callbacks = listeners.get(event);
        callbacks?.get(fn)?.remove();
        callbacks?.delete(fn);
      },
      getCenter: () => map.getCenter()?.toJSON() || coord(QC_CENTER),
      getBearing: () => map.getHeading() || 0,
      getZoom: () => map.getZoom() || 12,
      easeTo({ center, zoom, bearing, pitch }) {
        map.moveCamera({
          ...(center && { center: Array.isArray(center) ? coord(center) : center }),
          ...(zoom !== undefined && { zoom }),
          ...(bearing !== undefined && { heading: bearing }),
          ...(pitch !== undefined && { tilt: pitch })
        });
      }
    };

    const api = {
      map: camera,
      ready: (fn) => fn(),
      resize() {
        if (!pendingFit || !el.clientWidth || !el.clientHeight) return;
        const fit = pendingFit;
        pendingFit = null;
        fit();
      },
      setEndpoints(a, b, { fit = true } = {}) {
        for (const [kind, p] of [["a", a], ["b", b]]) {
          if (!p) {
            if (pins[kind]) { pins[kind].map = null; delete pins[kind]; }
            continue;
          }
          if (pins[kind]) { pins[kind].position = point(p); continue; }
          const content = document.createElement("div");
          content.className = "k-pin k-pin-" + kind;
          content.innerHTML = '<svg viewBox="0 0 32 42" aria-hidden="true"><path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 41 16 41s15-14 15-25.2C31 7.6 24.3 1 16 1z" fill="currentColor" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="6" fill="#fff"/></svg>' +
            (kind === "a" ? "<b>A</b>" : "<b>B</b>");
          const title = K.t(kind === "a" ? "map.pinA" : "map.pinB");
          const pin = marker(point(p), content, { gmpDraggable: !!opts.draggable, title, zIndex: 11 });
          if (opts.draggable) pin.addEventListener("gmp-dragend", () => state.onDrag?.(kind, literal(pin.position)));
          pins[kind] = pin;
        }
        if (fit) api.fit([a, b].filter(Boolean));
      },
      onPinDrag(fn) { state.onDrag = fn; },
      onTap(fn) { state.onTap = fn; },
      onStation(fn) { state.onStation = fn; },
      setTransit(on, btn) {
        state.transit = !!on;
        K.store.set("showTransit", state.transit);
        btn?.setAttribute("aria-pressed", String(state.transit));
        const legend = wrap.querySelector(".k-legend");
        const error = legend?.querySelector(".k-legend-err");
        legend?.classList.toggle("d-none", !state.transit);
        drawTransit();
        if (state.transit && !K.transitPoints) {
          error?.classList.add("d-none");
          btn?.classList.add("k-loading-btn");
          K.api.transitPoints().then(drawTransit).catch(() => error?.classList.remove("d-none"))
            .finally(() => btn?.classList.remove("k-loading-btn"));
        }
      },
      transitOn: () => state.transit,
      popup(lngLat, html) {
        const content = document.createElement("div");
        content.innerHTML = html;
        info.setOptions({ position: lngLat, content });
        info.open({ map, shouldFocus: false });
        wrap.classList.add("k-pop-open");
        return content;
      },
      closePopup() {
        info.close();
        wrap.classList.remove("k-pop-open");
      },
      fit(points, { padding = 70, maxZoom = 16 } = {}) {
        pendingFit = null;
        if (!points.length) return;
        if (!el.clientWidth || !el.clientHeight) {
          pendingFit = () => api.fit(points, { padding, maxZoom });
          return;
        }
        if (points.length === 1) { camera.easeTo({ center: point(points[0]), zoom: 15 }); return; }
        const extent = new maps.LatLngBounds();
        for (const p of points) extent.extend(point(p));
        if (extent.getNorthEast().equals(extent.getSouthWest())) {
          camera.easeTo({ center: extent.getCenter().toJSON(), zoom: maxZoom });
          return;
        }
        const inset = typeof padding === "number" ? { top: padding + 30, bottom: padding, left: padding, right: padding } : padding;
        state.fitListener?.remove();
        state.fitListener = maps.event.addListenerOnce(map, "idle", () => {
          if (map.getZoom() > maxZoom) map.setZoom(maxZoom);
        });
        map.fitBounds(extent, inset);
      },
      setRoutes(list, selected, { faint = false, labels: showLabels = true, onPick, compact = false } = {}) {
        for (const line of lines.splice(0)) line.setMap(null);
        for (const label of labels.splice(0)) label.map = null;
        (list || []).forEach((route, index) => {
          if (!route) return;
          const segments = route.segments || [route.geometry];
          const active = !faint && index === selected;
          for (const segment of segments) {
            const path = segment.coordinates.map(coord);
            if (path.length < 2) continue;
            const dashed = faint || segment.dashed;
            const color = active ? "#2563eb" : "#7698df";
            if (active && !dashed) lines.push(new maps.Polyline({
              map, path, strokeColor: "#0b2f9e", strokeWeight: compact ? 7 : 11, clickable: false, zIndex: 5
            }));
            const line = new maps.Polyline({
              map, path, strokeColor: color, strokeWeight: active ? (compact ? 5 : 7) : (compact ? 4 : 5),
              strokeOpacity: dashed ? 0 : compact && !active ? 0.6 : 1, clickable: !faint && !!onPick, zIndex: active ? 6 : 4,
              ...(dashed && { icons: [{ icon: { path: "M 0,-1 0,1", strokeColor: color,
                strokeOpacity: compact && !active ? 0.45 : 0.85, strokeWeight: compact ? 2 : 3, scale: 2 }, repeat: "12px" }] })
            });
            lines.push(line);
            if (!faint && onPick) line.addListener("click", () => onPick(index));
          }
          if (!faint && showLabels) {
            const path = segments[0]?.coordinates || [];
            if (!path.length) return;
            const tag = document.createElement("button");
            tag.type = "button";
            tag.className = "k-eta" + (active ? " on" : "");
            tag.textContent = K.fmt.mins(route.duration);
            tag.onclick = (event) => { event.stopPropagation(); onPick?.(index); };
            labels.push(marker(coord(path[Math.floor(path.length / 2)]), tag, { anchorTop: "-50%", zIndex: active ? 10 : 9 }));
          }
        });
      },
      fitRoute(route, padding) {
        const points = (route.segments || [route.geometry]).flatMap((segment) => segment.coordinates.map(K.geo.pt));
        api.fit(points, { padding: padding || 60, maxZoom: 17 });
      },
      setMe(p, acc, heading) {
        if (!p) {
          if (me) { me.pin.map = null; me = null; }
          accuracy.setMap(null);
          return;
        }
        const position = point(p);
        if (!me) {
          const content = document.createElement("div");
          content.className = "k-me";
          content.innerHTML = '<span class="k-me-cone"></span><span class="k-me-dot"></span>';
          me = { pin: marker(position, content, { anchorTop: "-50%", zIndex: 12 }), content };
        }
        me.pin.position = position;
        me.heading = heading;
        updateLocationHeading();
        accuracy.setOptions({ map, center: position, radius: Math.min(acc || 20, 300) });
      },
      bindCompass(btn, onTapWhenNorth) {
        if (!btn) return;
        const needle = btn.querySelector(".k-needle");
        const rotated = () => Math.abs(camera.getBearing()) > 0.5 || (map.getTilt() || 0) > 1;
        const update = () => {
          if (needle) needle.style.transform = "rotate(" + -camera.getBearing() + "deg)";
          btn.classList.toggle("rotated", rotated());
        };
        map.addListener("heading_changed", update);
        map.addListener("tilt_changed", update);
        update();
        btn.onclick = () => {
          if (rotated()) camera.easeTo({ bearing: 0, pitch: 0 });
          else onTapWhenNorth?.();
        };
      },
      nextStyle(btn) {
        const styles = Object.keys(STYLES);
        style = styles[(styles.indexOf(style) + 1) % styles.length];
        K.store.set("mapStyle", style);
        map.setMapTypeId(STYLES[style]);
        api.labelStyle(btn);
      },
      // Street View button: shows blue lines where Street View exists; tap a spot and Street View opens inside the map
      toggleStreet(btn) {
        state.street = !state.street;
        if (!state.coverage) state.coverage = new maps.StreetViewCoverageLayer();
        state.coverage.setMap(state.street ? map : null);
        if (btn) btn.setAttribute("aria-pressed", String(state.street));
        const old = el.parentElement.querySelector(".k-sv-hint"); if (old) old.remove();
        if (state.street) {
          if ((map.getZoom() || 0) < 14) map.setZoom(14);
          const h = document.createElement("div"); h.className = "k-sv-hint"; h.textContent = K.t("map.streetHint");
          el.parentElement.appendChild(h); setTimeout(() => h.remove(), 6000);
        } else map.getStreetView().setVisible(false);
      },
      openStreetView(latLng) {
        if (!state.svService) state.svService = new maps.StreetViewService();
        state.svService.getPanorama({ location: latLng, radius: 60, source: maps.StreetViewSource.OUTDOOR }, (data, status) => {
          if (status !== "OK" || !data || !data.location) { info.setContent(K.esc(K.t("map.streetNone"))); info.setPosition(latLng); info.open({ map }); return; }
          const pano = map.getStreetView();
          pano.setOptions({ enableCloseButton: true, addressControl: false, fullscreenControl: false });
          pano.setPano(data.location.pano);
          pano.setPov({ heading: 0, pitch: 0 });
          pano.setVisible(true);
        });
      },
      labelStyle(btn) {
        if (!btn) return;
        btn.title = K.t("map.style." + style);
        btn.setAttribute("aria-label", btn.title);
      },
      styleName: () => style
    };

    function updateLocationHeading() {
      if (!me) return;
      const hasHeading = Number.isFinite(me.heading);
      me.content.classList.toggle("has-heading", hasHeading);
      me.content.style.rotate = hasHeading ? (me.heading - camera.getBearing()) + "deg" : "";
    }
    map.addListener("heading_changed", updateLocationHeading);
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
    bounds = { west: w - pad, south: s - pad, east: e + pad, north: n + pad };
    for (const instance of instances) instance.drawBoundary();
    document.dispatchEvent(new CustomEvent("komute:border"));
  }

  K.maps = { create, load, supported, QC_CENTER, inQC, setBoundary };
})(window.Komute);
