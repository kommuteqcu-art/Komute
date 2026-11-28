// Shared helpers: safe HTML, saved settings, distance/direction math, and number formats.
window.Komute = window.Komute || {};
(function (K) {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Plain AI text to HTML (used only when the AI did not return the structured plan).
  function planToHtml(text) {
    const out = [];
    let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) { close(); continue; }
      let m;
      if ((m = line.match(/^#{1,4}\s+(.*)/))) { close(); out.push(`<h4>${inline(m[1])}</h4>`); }
      else if ((m = line.match(/^[-*•]\s+(.*)/))) {
        if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; }
        out.push(`<li>${inline(m[1])}</li>`);
      } else if ((m = line.match(/^\d+[.)]\s+(.*)/))) {
        if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; }
        out.push(`<li>${inline(m[1])}</li>`);
      } else { close(); out.push(`<p>${inline(line)}</p>`); }
    }
    close();
    return out.join("");
  }

  // localStorage that never throws (private mode, blocked storage, etc.)
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem("komute." + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem("komute." + key, JSON.stringify(value)); } catch { /* ignore */ } }
  };

  const R = Math.PI / 180;
  const geo = {
    // distance in meters between {latitude, longitude} points
    dist(a, b) {
      const dl = (b.latitude - a.latitude) * R, dn = (b.longitude - a.longitude) * R;
      const h = Math.sin(dl / 2) ** 2 + Math.cos(a.latitude * R) * Math.cos(b.latitude * R) * Math.sin(dn / 2) ** 2;
      return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
    },
    // compass bearing 0..360 from a to b
    bearing(a, b) {
      const y = Math.sin((b.longitude - a.longitude) * R) * Math.cos(b.latitude * R);
      const x = Math.cos(a.latitude * R) * Math.sin(b.latitude * R) -
        Math.sin(a.latitude * R) * Math.cos(b.latitude * R) * Math.cos((b.longitude - a.longitude) * R);
      return (Math.atan2(y, x) / R + 360) % 360;
    },
    pt: (lngLat) => ({ latitude: lngLat[1], longitude: lngLat[0] }),
    ll: (p) => [p.longitude, p.latitude],
    // a circle polygon (GeoJSON) around a point, radius in meters
    circle(p, radius, n = 48) {
      const ring = [];
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * 2 * Math.PI;
        ring.push([p.longitude + (radius * Math.cos(t)) / (111320 * Math.cos(p.latitude * R)), p.latitude + (radius * Math.sin(t)) / 110540]);
      }
      return { type: "Feature", geometry: { type: "Polygon", coordinates: [ring] }, properties: {} };
    },
    // index of the closest coordinate on a line, and the distance to it (meters)
    nearest(coords, p, from = 0, to = coords.length) {
      let best = -1, bestD = Infinity;
      for (let i = Math.max(0, from); i < Math.min(coords.length, to); i++) {
        const d = geo.dist(p, geo.pt(coords[i]));
        if (d < bestD) { bestD = d; best = i; }
      }
      return { i: best, d: bestD };
    },
    cumulative(coords) {
      const out = [0];
      for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + geo.dist(geo.pt(coords[i - 1]), geo.pt(coords[i])));
      return out;
    },
    cardinal(deg) { return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8]; }
  };

  const fmt = {
    peso(n) { return "₱" + (Math.abs(n - Math.round(n)) < 0.001 ? Math.round(n) : n.toFixed(2)); },
    range(lo, hi) { return Math.round(hi) > Math.round(lo) ? `₱${Math.round(lo)}–₱${Math.round(hi)}` : fmt.peso(lo); },
    quarter(n) { return Math.round(n * 4) / 4; },
    dist(m) { return m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + " km" : Math.max(5, Math.round(m / 10) * 10) + " m"; },
    mins(s) {
      const m = Math.max(1, Math.round(s / 60));
      return m >= 60 ? Math.floor(m / 60) + " h " + (m % 60) + " min" : m + " min";
    },
    clock(date) { return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); },
    // Shortens a long OpenStreetMap address: "SM North EDSA, North Avenue, ..., Quezon City, ..." -> "SM North EDSA, North Avenue, Quezon City"
    shortLabel(full) {
      const parts = String(full || "").split(",").map((s) => s.trim()).filter(Boolean);
      const keep = [];
      for (const p of parts) {
        if (/^\d+$/.test(p) || /district|metro manila|philippines|national capital/i.test(p)) continue;
        if (/quezon city/i.test(p)) break;
        if (keep.length < 2 && !keep.includes(p)) keep.push(p);
      }
      const inQC = /quezon city/i.test(full);
      return (keep.join(", ") || parts[0] || "") + (inQC && !/quezon city/i.test(keep.join(",")) ? ", Quezon City" : "");
    },
    // The first part of a label, for small spaces
    first(label) { return String(label || "").split(",")[0].trim(); }
  };

  K.data = () => window.KOMUTE_DATA || {};
  K.esc = esc;
  K.planToHtml = planToHtml;
  K.store = store;
  // A random number made once on this phone: the server allows one account per device for the free route plans.
  K.deviceId = function () {
    try {
      let id = localStorage.getItem("komute.device");
      if (!/^[a-f0-9]{32}$/.test(id || "")) {
        id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
        localStorage.setItem("komute.device", id);
      }
      return id;
    } catch { return ""; }
  };
  K.geo = geo;
  K.fmt = fmt;
  K.bindTabs = (list) => {
    list.onkeydown = (event) => {
      const tabs = Array.from(list.querySelectorAll('[role="tab"]'));
      const index = tabs.indexOf(event.target);
      if (index < 0 || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
        : (index + tabs.length + (event.key === "ArrowRight" ? 1 : -1)) % tabs.length;
      tabs[next].click();
      tabs[next].focus();
    };
  };
  K.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
})(window.Komute);
