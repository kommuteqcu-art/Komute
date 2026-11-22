// Komute backend (Version 15): serves the website, searches places, and asks Gemini for a commute guide.
// Run with:  npm start      (from this "backend" folder)
// Test AI:   npm run check-ai
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = loadEnvFile();

// ---------- Settings (from .env) ----------
const PORT = Number(process.env.PORT || 8080);
const GEMINI_KEY = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
// Current stable Gemini models (checked November 2026). The first one that works is used.
const BUILT_IN_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-flash-latest", "gemini-3.1-flash-lite"];
const GEMINI_MODEL = (process.env.GEMINI_MODEL || BUILT_IN_MODELS[0]).trim();
// Your own fallbacks first, then the built-in list, so an old .env still works when a model is retired.
const MODELS = unique([GEMINI_MODEL, ...splitList(process.env.GEMINI_FALLBACK_MODELS), ...BUILT_IN_MODELS]);
const MAPS_GROUNDING = process.env.GEMINI_MAPS_GROUNDING !== "false";
const GEMINI_API_BASE = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
let useVertex = process.env.GEMINI_USE_VERTEX === "true"; // Vertex AI express-mode keys
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT || "Komute/15 educational project";

const SERVICE_AREA = { name: "Quezon City", west: 120.98, east: 121.14, south: 14.58, north: 14.79 };
const WEB_DIR = findWebDir();
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8"
};
const placeCache = new Map();
let nominatimQueue = Promise.resolve();
let lastNominatimRequestAt = 0;
let lastAiResult = null;

// ---------- Fare facts given to the AI (LTFRB rates in force from September 28, 2026) ----------
const FARE_REFERENCE = `Metro Manila fares in force since September 28, 2026 (regular / 20% off for students, seniors, PWD with ID):
- Traditional jeepney: PHP 14 for the first 4 km, then PHP 2.00 per km.
- Modern jeepney: PHP 17 for the first 4 km, then PHP 2.40 per km.
- City bus ordinary: PHP 15 for the first 5 km, then PHP 2.49 per km. Aircon city bus: PHP 18 for the first 5 km, then PHP 2.98 per km.
- EDSA Carousel (busway): priced station to station, about PHP 18 minimum.
- UV Express: provisional per-km rate (about PHP 2.60 traditional, PHP 3.00 modern). Tricycle: set by the barangay/city, ask first.
- Q City Bus (Quezon City government): FREE. 8 routes: 1 QC Hall-Cubao, 2 QC Hall-Litex/IBP Road, 3 Welcome Rotonda-Aurora Blvd/Katipunan, 4 QC Hall-General Luis, 5 QC Hall-Mindanao Ave, 6 QC Hall-Gilmore, 7 QC Hall-C5/Ortigas Ave Ext, 8 QC Hall-Munoz.
- MRT-3: PHP 13-28 regular, 50% off for everyone since March 23, 2026 (about PHP 6.50-14). LRT-2: 50% off for everyone (about PHP 6.50-16.50 Beep). LRT-1: regular fares (about PHP 16-52 Beep, PHP 20-55 single journey).
- MRT-7 is NOT open yet. Do not suggest it.
- Taxi (provisional): PHP 65 flag-down + PHP 13.50/km + PHP 2/min. Grab/TNVS sedan: PHP 65 base + PHP 15/km + PHP 2/min (+ pick-up fare). Motorcycle taxi (Angkas, JoyRide, Move It): about PHP 50 for the first 2 km, then about PHP 10/km.`;

// ---------- Server ----------
const server = http.createServer(async (request, response) => {
  try {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (request.method === "OPTIONS") { response.writeHead(204); return response.end(); }
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, {
        ok: true, version: "15", webFolder: WEB_DIR || "NOT FOUND",
        placeSearch: "Nominatim", autocomplete: GOOGLE_PLACES_KEY ? "Google Places" : TOMTOM_KEY ? "TomTom" : GEOAPIFY_KEY ? "Geoapify" : "Photon (OpenStreetMap)", aiConfigured: PROVIDERS.length > 0, aiProviders: PROVIDERS.map(providerName), aiModels: MODELS,
        mapsGroundingRequested: MAPS_GROUNDING, lastAiResult, redditConfigured: redditConfigured()
      });
    }
    if (request.method === "GET" && url.pathname === "/api/autocomplete") {
      // Test in a browser: /api/autocomplete?q=sandigan
      return await autocompleteEndpoint(response, { query: url.searchParams.get("q") || "" }, true);
    }
    if (request.method === "GET" && url.pathname === "/api/ai-status") {
      return json(response, 200, await checkAi());
    }
    if (request.method === "GET" || request.method === "HEAD") return serveStatic(request, response, url);
    if (request.method !== "POST") return json(response, 404, { error: "Not found" });

    const body = await readJson(request);
    if (url.pathname === "/api/places") return await placesEndpoint(response, body);
    if (url.pathname === "/api/reverse") return await reverseEndpoint(response, body);
    if (url.pathname === "/api/autocomplete") return await autocompleteEndpoint(response, body);
    if (url.pathname === "/api/place-details") return await placeDetailsEndpoint(response, body);
    if (url.pathname === "/api/commute-plan") return await commutePlanEndpoint(response, body);
    if (url.pathname === "/api/routes") {
      return json(response, 410, { error: "Use /api/commute-plan for the AI commute plan." });
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return json(response, error.statusCode || 500, { error: error.publicMessage || error.message || "Unexpected server error" });
  }
});

if (process.argv.includes("--check-ai")) {
  setImmediate(() => checkAi().then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); }));
} else {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`\nKomute is running. Open http://localhost:${PORT} in your browser.`);
    console.log(`.env file: ${ENV_FILE ? "found at " + ENV_FILE : "NOT FOUND (copy .env.example to .env in the backend folder)"}`);
    console.log(`Website folder: ${WEB_DIR || "NOT FOUND. Put the 'web' folder next to the 'backend' folder."}`);
    console.log(GEMINI_KEY ? `Gemini key: loaded (${GEMINI_KEY.length} characters, starts with "${GEMINI_KEY.slice(0, 3)}")` : "Gemini key: NONE  <-- " + missingKeyMessage());
    console.log(`Gemini models (in order): ${MODELS.join(", ")}`);
    console.log(`AI services (tried in this order): ${PROVIDERS.length ? PROVIDERS.map(providerName).join(" -> ") : "NONE"}`);
    console.log(`Test the AI any time: open http://localhost:${PORT}/api/ai-status\n`);
  });
}

// ---------- Places ----------
async function placesEndpoint(response, body) {
  const query = cleanText(body.query, 180);
  if (!query) return json(response, 400, { error: "Enter a place to search." });
  return json(response, 200, { suggestions: await searchNominatim(query, body.near) });
}

async function reverseEndpoint(response, body) {
  if (!validCoordinate(body)) return json(response, 400, { error: "Invalid coordinates." });
  const lat = Number(body.latitude), lon = Number(body.longitude);
  const key = `rev|${lat.toFixed(5)},${lon.toFixed(5)}`;
  const cached = placeCache.get(key);
  if (cached) return json(response, 200, cached.value);
  if (TOMTOM_KEY) {
    try {
      const t = await tomtomReverse(lat, lon);
      if (t) { placeCache.set(key, { savedAt: Date.now(), value: t }); return json(response, 200, t); }
    } catch (e) { console.warn("TomTom address lookup failed:", e.message); }
  }
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "18");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  const data = await throttledNominatimFetch(url);
  const full = cleanText(data?.display_name, 240);
  const value = full
    ? { label: full, inArea: full.toLowerCase().includes("quezon city") }
    : { label: "", inArea: insideServiceArea({ latitude: lat, longitude: lon }) ? null : false };
  placeCache.set(key, { savedAt: Date.now(), value });
  return json(response, 200, value);
}

async function searchNominatim(query, near) {
  const nearKey = validCoordinate(near) ? `${Number(near.latitude).toFixed(2)},${Number(near.longitude).toFixed(2)}` : "none";
  const cacheKey = `${query.toLowerCase()}|${nearKey}`;
  const cached = placeCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < 10 * 60 * 1000) return cached.value;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "ph");
  url.searchParams.set("limit", "10");
  url.searchParams.set("viewbox", `${SERVICE_AREA.west},${SERVICE_AREA.north},${SERVICE_AREA.east},${SERVICE_AREA.south}`);
  url.searchParams.set("bounded", "1");

  const data = await throttledNominatimFetch(url);
  const places = (Array.isArray(data) ? data : []).map((place) => ({
    id: String(place.place_id),
    label: cleanText(place.display_name, 240),
    name: cleanText(place.name, 120),
    location: { latitude: Number(place.lat), longitude: Number(place.lon) }
  }))
    .filter((p) => validCoordinate(p.location) && p.label)
    .filter((p) => p.label.toLowerCase().includes("quezon city"))
    .slice(0, 6);
  placeCache.set(cacheKey, { savedAt: Date.now(), value: places });
  if (placeCache.size > 300) placeCache.delete(placeCache.keys().next().value);
  return places;
}

// ---------- Type-ahead suggestions (search as you type) ----------
// Free by default: Photon (OpenStreetMap, made for search-as-you-type, no key).
// Optional, better house-number coverage: GEOAPIFY_API_KEY (free 3,000/day) or GOOGLE_PLACES_API_KEY (needs Google billing).
const PHOTON_URL = (process.env.PHOTON_URL || "https://photon.komoot.io").replace(/\/$/, "");
const GEOAPIFY_KEY = (process.env.GEOAPIFY_API_KEY || "").trim();
const GOOGLE_PLACES_KEY = (process.env.GOOGLE_PLACES_API_KEY || "").trim();
const TOMTOM_KEY = (process.env.TOMTOM_API_KEY || "").trim();
const TOMTOM_BASE = (process.env.TOMTOM_API_BASE || "https://api.tomtom.com").replace(/\/$/, ""); // free 2,500 requests/day, no card: developer.tomtom.com
const OTHER_CITIES = /\b(manila|caloocan|marikina|pasig|san juan|mandaluyong|valenzuela|malabon|navotas|makati|rizal|bulacan|san mateo|rodriguez)\b/i;
const acCache = new Map();

async function autocompleteEndpoint(response, body, debug = false) {
  const query = cleanText(body.query, 120);
  if (query.length < 2) return json(response, 200, { suggestions: [] });
  const near = validCoordinate(body.near) ? { latitude: Number(body.near.latitude), longitude: Number(body.near.longitude) } : null;
  const key = `${query.toLowerCase()}|${near ? near.latitude.toFixed(2) + "," + near.longitude.toFixed(2) : ""}`;
  const hit = acCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60 * 1000) return json(response, 200, { suggestions: hit.value, provider: hit.provider });

  const providers = [GOOGLE_PLACES_KEY && ["google", googleAutocomplete], TOMTOM_KEY && ["tomtom", tomtomAutocomplete],
    GEOAPIFY_KEY && ["geoapify", geoapifyAutocomplete], ["photon", photonAutocomplete]].filter(Boolean);
  let list = [], used = "none";
  const problems = [];
  for (const [name, fn] of providers) {
    try {
      list = await fn(query, near, body.sessionToken);
      used = name;
      if (list.length) break;
      problems.push(`${name}: no results`);
    } catch (e) {
      problems.push(`${name}: ${e.message}`);
      console.warn(`Autocomplete via ${name} failed: ${e.message}`);
    }
  }
  // A paid-data provider found only a few? Add OpenStreetMap results below them.
  if (used !== "photon" && list.length < 4) {
    try {
      const names = new Set(list.map((x) => x.name.toLowerCase()));
      (await photonAutocomplete(query, near)).forEach((x) => { if (!names.has(x.name.toLowerCase())) { names.add(x.name.toLowerCase()); list.push(x); } });
    } catch { /* fine */ }
  }
  list = withHouseNumber(query, list).slice(0, 8);
  if (debug) return json(response, 200, { query, provider: used, problems, suggestions: list });
  // only remember good answers, so a short outage is not cached
  if (list.length) acCache.set(key, { at: Date.now(), value: list, provider: used });
  if (acCache.size > 2000) acCache.delete(acCache.keys().next().value);
  return json(response, 200, { suggestions: list, provider: used });
}

// When you type a house number ("123 Maginhawa") and the map only knows the street,
// keep your number in the label and put the pin on the street. You can drag the pin to the exact house.
function withHouseNumber(query, list) {
  const m = query.match(/^\s*(\d+[a-zA-Z]?(?:-\d+)?)\s+(.+)/);
  if (!m) return list;
  return list.map((s) => (s.kind === "street" && !/^\d/.test(s.name)
    ? { ...s, name: `${m[1]} ${s.name}`, label: `${m[1]} ${s.label}`, approx: true } : s));
}

function inQC(fields, lat, lon) {
  const text = fields.filter(Boolean).join(", ");
  if (/quezon city/i.test(text)) return true;
  if (OTHER_CITIES.test(text)) return false;
  return lat >= SERVICE_AREA.south && lat <= SERVICE_AREA.north && lon >= SERVICE_AREA.west && lon <= SERVICE_AREA.east;
}

function kindOf(type) {
  type = String(type || "").toLowerCase();
  if (/house|building|amenity|shop|office|school|hospital|mall|poi|establishment|tourism|leisure|station|stop/.test(type)) return "place";
  if (/street|road|highway|route|primary|secondary|residential|tertiary|trunk/.test(type)) return "street";
  if (/district|suburb|locality|neighbourhood|quarter|sublocality|village|barangay/.test(type)) return "area";
  return "place";
}

async function photonAutocomplete(query, near) {
  const url = new URL(PHOTON_URL + "/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "15");
  url.searchParams.set("lang", "en");
  url.searchParams.set("bbox", `${SERVICE_AREA.west},${SERVICE_AREA.south},${SERVICE_AREA.east},${SERVICE_AREA.north}`);
  const bias = near || { latitude: 14.6507, longitude: 121.0494 };
  url.searchParams.set("lat", String(bias.latitude));
  url.searchParams.set("lon", String(bias.longitude));
  let res;
  try {
    res = await fetch(url, { headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(7000) });
  } catch (e) { throw new Error(`Photon not reachable (${e.cause?.code || e.name})`); }
  if (!res.ok) throw new Error("Photon HTTP " + res.status);
  const data = await res.json();
  const seen = new Set();
  return (data.features || []).map((f) => {
    const p = f.properties || {}, [lon, lat] = f.geometry?.coordinates || [];
    const houseLine = p.housenumber ? `${p.housenumber} ${p.street || ""}`.trim() : "";
    const name = p.name || houseLine || p.street || "";
    const area = [p.name && p.street && p.name !== p.street ? (p.housenumber ? houseLine : p.street) : "", p.district || p.locality, "Quezon City"]
      .filter((x, i, a) => x && a.indexOf(x) === i && x !== name);
    return {
      id: `ph:${p.osm_type || ""}${p.osm_id || lat + "," + lon}`, name, sub: area.join(", "),
      label: [name, ...area].join(", "), kind: kindOf(p.housenumber ? "house" : p.type === "street" ? "street" : p.osm_key === "highway" ? "street" : p.type === "district" || p.type === "locality" ? "district" : p.osm_value || p.type),
      location: { latitude: lat, longitude: lon }, keep: inQC([p.city, p.county, p.district, p.locality, p.state], lat, lon)
    };
  }).filter((s) => s.keep && s.name && Number.isFinite(s.location.latitude) && !seen.has(s.label) && seen.add(s.label))
    .map(({ keep, ...s }) => s);
}

// TomTom Search (commercial map data: schools, malls, offices, numbered addresses). Uses the gate/entrance point when known.
async function tomtomAutocomplete(query, near) {
  const url = new URL(`${TOMTOM_BASE}/search/2/search/${encodeURIComponent(query)}.json`);
  url.searchParams.set("key", TOMTOM_KEY);
  url.searchParams.set("typeahead", "true");
  url.searchParams.set("limit", "10");
  url.searchParams.set("countrySet", "PH");
  url.searchParams.set("language", "en-US");
  url.searchParams.set("topLeft", `${SERVICE_AREA.north},${SERVICE_AREA.west}`);
  url.searchParams.set("btmRight", `${SERVICE_AREA.south},${SERVICE_AREA.east}`);
  const bias = near || { latitude: 14.6507, longitude: 121.0494 };
  url.searchParams.set("lat", String(bias.latitude));
  url.searchParams.set("lon", String(bias.longitude));
  let res;
  try { res = await fetch(url, { signal: AbortSignal.timeout(6000) }); } catch (e) { throw new Error(`TomTom not reachable (${e.cause?.code || e.name})`); }
  if (!res.ok) throw new Error("TomTom HTTP " + res.status + (res.status === 403 ? " (check TOMTOM_API_KEY)" : res.status === 429 ? " (daily free limit reached)" : ""));
  const data = await res.json();
  const seen = new Set();
  return (data.results || []).map((r) => {
    const a = r.address || {};
    const pos = (r.entryPoints || []).find((e) => e.type === "main")?.position || r.position || {};
    const numbered = a.streetNumber ? `${a.streetNumber} ${a.streetName || ""}`.trim() : "";
    const name = r.poi?.name || numbered || a.streetName || a.municipalitySubdivision || a.freeformAddress || "";
    const sub = [r.poi ? (numbered || a.streetName) : "", a.municipalitySubdivision, "Quezon City"]
      .filter((x, i, arr) => x && arr.indexOf(x) === i && x !== name).join(", ");
    const kind = r.type === "POI" ? "place" : /street/i.test(r.type) ? "street" : /address/i.test(r.type) ? "place" : "area";
    return {
      id: "tt:" + (r.id || pos.lat + "," + pos.lon), name, sub, label: [name, sub].filter(Boolean).join(", "), kind,
      location: { latitude: pos.lat, longitude: pos.lon },
      keep: inQC([a.municipality, a.municipalitySubdivision, a.countrySecondarySubdivision, a.freeformAddress], pos.lat, pos.lon)
    };
  }).filter((x) => x.keep && x.name && Number.isFinite(x.location.latitude) && !seen.has(x.label) && seen.add(x.label))
    .map(({ keep, ...x }) => x);
}

async function tomtomReverse(lat, lon) {
  const url = new URL(`${TOMTOM_BASE}/search/2/reverseGeocode/${lat},${lon}.json`);
  url.searchParams.set("key", TOMTOM_KEY);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("returnSpeedLimit", "false");
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error("TomTom reverse HTTP " + res.status);
  const a = (await res.json()).addresses?.[0]?.address;
  if (!a) return null;
  const parts = [a.streetNumber && a.streetName ? `${a.streetNumber} ${a.streetName}` : a.streetName, a.municipalitySubdivision, a.municipality].filter(Boolean);
  const label = cleanText(parts.join(", ") || a.freeformAddress, 240);
  return label ? { label, inArea: /quezon city/i.test(label + " " + (a.freeformAddress || "")) || insideServiceArea({ latitude: lat, longitude: lon }) } : null;
}

async function geoapifyAutocomplete(query, near) {
  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", query.toLowerCase().includes("quezon") ? query : query + ", Quezon City");
  url.searchParams.set("filter", `rect:${SERVICE_AREA.west},${SERVICE_AREA.south},${SERVICE_AREA.east},${SERVICE_AREA.north}`);
  if (near) url.searchParams.set("bias", `proximity:${near.longitude},${near.latitude}`);
  url.searchParams.set("limit", "10");
  url.searchParams.set("lang", "en");
  url.searchParams.set("format", "json");
  url.searchParams.set("apiKey", GEOAPIFY_KEY);
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error("Geoapify HTTP " + res.status);
  const data = await res.json();
  return (data.results || []).filter((r) => inQC([r.city, r.county, r.formatted], r.lat, r.lon)).map((r) => ({
    id: "ga:" + (r.place_id || r.lat + "," + r.lon), name: r.address_line1 || r.name || r.formatted,
    sub: r.address_line2 || "", label: r.formatted, kind: kindOf(r.result_type),
    location: { latitude: r.lat, longitude: r.lon }
  }));
}

async function googleAutocomplete(query, near, sessionToken) {
  const body = {
    input: query, includedRegionCodes: ["ph"], languageCode: "en",
    locationRestriction: { rectangle: { low: { latitude: SERVICE_AREA.south, longitude: SERVICE_AREA.west }, high: { latitude: SERVICE_AREA.north, longitude: SERVICE_AREA.east } } }
  };
  if (near) body.origin = { latitude: near.latitude, longitude: near.longitude };
  if (sessionToken) body.sessionToken = cleanText(sessionToken, 64);
  const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE_PLACES_KEY },
    body: JSON.stringify(body), signal: AbortSignal.timeout(6000)
  });
  if (!res.ok) throw new Error("Google Places HTTP " + res.status);
  const data = await res.json();
  return (data.suggestions || []).map((s) => s.placePrediction).filter(Boolean)
    .filter((p) => /quezon city/i.test(p.text?.text || ""))
    .map((p) => ({
      id: "gp:" + p.placeId, placeId: p.placeId, name: p.structuredFormat?.mainText?.text || p.text.text,
      sub: p.structuredFormat?.secondaryText?.text || "", label: p.text.text, kind: kindOf((p.types || []).join(" ")), location: null
    }));
}

// Google suggestions have no coordinates; this looks them up when you pick one.
async function placeDetailsEndpoint(response, body) {
  const id = cleanText(body.placeId, 300);
  if (!GOOGLE_PLACES_KEY || !id) return json(response, 400, { error: "Place details are not available." });
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`);
  if (body.sessionToken) url.searchParams.set("sessionToken", cleanText(body.sessionToken, 64));
  const res = await fetch(url, {
    headers: { "X-Goog-Api-Key": GOOGLE_PLACES_KEY, "X-Goog-FieldMask": "location,formattedAddress,displayName" },
    signal: AbortSignal.timeout(8000)
  });
  const data = await safeJson(res);
  if (!res.ok || !data.location) return json(response, 502, { error: "Could not get that place's location." });
  return json(response, 200, { label: data.formattedAddress, location: { latitude: data.location.latitude, longitude: data.location.longitude } });
}

async function throttledNominatimFetch(url) {
  const task = nominatimQueue.then(async () => {
    const waitMs = Math.max(0, 1000 - (Date.now() - lastNominatimRequestAt));
    if (waitMs) await delay(waitMs);
    lastNominatimRequestAt = Date.now();
    let res;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json", "Accept-Language": "en" },
        signal: AbortSignal.timeout(15000)
      });
    } catch (e) {
      throw publicError(502, "Place search is not reachable right now. Try again, or tap the map to set the spot.");
    }
    const data = await safeJson(res);
    if (!res.ok) throw upstreamError("OpenStreetMap place search", data, res.status);
    return data;
  });
  nominatimQueue = task.catch(() => undefined);
  return task;
}

// ---------- Commute plan ----------
async function commutePlanEndpoint(response, body) {
  if (!PROVIDERS.length) return json(response, 503, { error: missingKeyMessage() });
  const origin = parseEndpoint(body.origin, "starting point");
  const destination = parseEndpoint(body.destination, "destination");
  const beginnerMode = body.beginnerMode !== false;
  const language = body.language === "tl" ? "tl" : "en";
  const communityTips = await searchRedditTips(`${origin.text} ${destination.text}`).catch((e) => {
    console.warn("Optional Reddit search unavailable:", e.message);
    return [];
  });

  const prompt = buildPrompt({ origin, destination, beginnerMode, language, communityTips });
  const generated = await generatePlan(prompt, origin.location);
  const guide = parseGuide(generated.text);
  const sources = extractMapsSources(generated.data);
  return json(response, 200, {
    plan: guide ? guideToText(guide) : generated.text,
    guide,
    language,
    model: generated.model,
    usedMapsGrounding: sources.length > 0,
    sources
  });
}

function buildPrompt({ origin, destination, beginnerMode, language, communityTips }) {
  const km = validCoordinate(origin.location) && validCoordinate(destination.location)
    ? haversineKm(origin.location, destination.location).toFixed(1) : null;
  return [
    "You are the planning engine of Komute, a public-transport helper for commuters in Quezon City, Philippines.",
    `Service area: ${SERVICE_AREA.name} only. Keep every option, transfer point, and landmark inside ${SERVICE_AREA.name}. If the usual way leaves the city, say so in "outsideArea" and give only the part inside it.`,
    "Plan 2 or 3 realistic options from Point A to Point B using jeepneys, modern jeepneys, city buses, the EDSA Carousel, the FREE Q City Bus, UV Express, tricycles, MRT-3, LRT-1, LRT-2, and walking. When it helps, add one door-to-door option (Grab/taxi or motorcycle taxi) as the last option.",
    "Be honest about certainty. Never say a route, stop, signboard, fare, or time is verified unless grounding evidence supports it. Use words like 'usually', 'about', 'likely'. Never invent exact schedules.",
    "Fares: compute an approximate fare for each ride with the fare table below and the distance. Write it like 'about PHP 14' or 'about PHP 14-18'. Q City Bus is free.",
    FARE_REFERENCE,
    "Write very simple sentences that a first-time commuter can follow. Each step does one thing.",
    "KEEP IT SHORT: at most 7 steps per option. Each text value at most 20 words; 'where' and 'getOff' at most 12 words; 'sign' at most 5 words. No long explanations.",
    "For every ride step: 'where' = exactly where to stand or board (street, side of the road, landmark, terminal, or station); 'sign' = the words likely written on the vehicle's route signboard (for example 'CUBAO - QUIAPO'), or the train direction (for example 'Southbound to Taft'); 'getOff' = the landmark or stop where to get off and what to say ('Para po').",
    beginnerMode
      ? "New Commuter Mode is ON: explain how to spot the right vehicle, how to pay, and where to ask for help. Add 4 to 6 short tips."
      : "The user wants a short plan: keep steps brief and give at most 3 tips.",
    language === "tl"
      ? "LANGUAGE: Write every text value in Filipino (Tagalog), the way people in Metro Manila talk. Keep place names, street names, vehicle names, and signboard words as they are (for example 'jeep', 'MRT-3', 'Para po')."
      : "LANGUAGE: Write every text value in clear, simple English. Keep Filipino phrases a commuter needs, like 'Para po'.",
    `Reply ONLY with one JSON object, no markdown, in this shape:
{"summary": string,
 "outsideArea": string (empty if not needed),
 "options": [{"title": string, "tag": "cheapest" | "fastest" | "easiest" | "fewest transfers" | "",
   "modes": [one or more of "walk","jeepney","modern_jeepney","bus","carousel","qcity_bus","uv_express","tricycle","mrt3","lrt1","lrt2","taxi","tnvs","mc_taxi"],
   "duration": string (approximate total time, for example "about 35-50 min"),
   "fare": string (approximate total fare),
   "steps": [{"kind": "start" | "walk" | "ride" | "transfer" | "getoff" | "arrive",
              "mode": one of the modes above or "",
              "text": string (one simple instruction),
              "where": string, "sign": string, "getOff": string, "fare": string, "tip": string}],
   "why": string (main advantage), "check": string (what to confirm before going)}],
 "tips": [string], "checks": [string]}`,
    `Point A: ${origin.text}${coordinateSuffix(origin.location)}`,
    `Point B: ${destination.text}${coordinateSuffix(destination.location)}`,
    km ? `Straight-line distance: about ${km} km (road distance is usually 20-40% more).` : "",
    communityTips.length ? `Unverified recent community posts (use only as hints): ${JSON.stringify(communityTips)}` : ""
  ].filter(Boolean).join("\n\n");
}

const PLAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    outsideArea: { type: "STRING" },
    options: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" }, tag: { type: "STRING" },
          modes: { type: "ARRAY", items: { type: "STRING" } },
          duration: { type: "STRING" }, fare: { type: "STRING" },
          steps: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                kind: { type: "STRING" }, mode: { type: "STRING" }, text: { type: "STRING" },
                where: { type: "STRING" }, sign: { type: "STRING" }, getOff: { type: "STRING" },
                fare: { type: "STRING" }, tip: { type: "STRING" }
              },
              required: ["kind", "text"]
            }
          },
          why: { type: "STRING" }, check: { type: "STRING" }
        },
        required: ["title", "steps"]
      }
    },
    tips: { type: "ARRAY", items: { type: "STRING" } },
    checks: { type: "ARRAY", items: { type: "STRING" } }
  },
  required: ["summary", "options"]
};

// ---------- Gemini ----------
const TRANSIENT = [500, 502, 503, 504];

// ---------- AI providers ----------
// Komute can use several AI services. It tries them in order and uses the first one that answers:
//   gemini      (GEMINI_API_KEY)      Google AI Studio, free tier
//   groq        (GROQ_API_KEY)        console.groq.com, free tier, very fast
//   openrouter  (OPENROUTER_API_KEY)  openrouter.ai, free models
// AI_PROVIDER=auto (default) means: every provider that has a key, in the order above.
// AI_PROVIDER=groq (or openrouter, gemini) puts that one first.
const COMPAT = {
  groq: { name: "Groq", key: process.env.GROQ_API_KEY, base: process.env.GROQ_API_BASE || "https://api.groq.com/openai/v1",
    models: unique([...splitList(process.env.GROQ_MODEL), "openai/gpt-oss-120b", "openai/gpt-oss-20b"]),
    prefer: [/gpt-oss-120b/, /gpt-oss/, /llama-4-maverick/, /llama-4/, /qwen/, /kimi/, /llama/] },
  openrouter: { name: "OpenRouter", key: process.env.OPENROUTER_API_KEY, base: process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1",
    models: unique([...splitList(process.env.OPENROUTER_MODEL), "openrouter/free"]), prefer: [/:free$/] }
};
const PROVIDERS = (() => {
  const all = ["gemini", "groq", "openrouter"].filter((p) => (p === "gemini" ? GEMINI_KEY : (COMPAT[p].key || "").trim()));
  const first = (process.env.AI_PROVIDER || "auto").toLowerCase();
  return all.includes(first) ? [first, ...all.filter((p) => p !== first)] : all;
})();
const providerName = (p) => (p === "gemini" ? "Gemini" : COMPAT[p].name);

async function generatePlan(prompt, location, { maxMs = 115000 } = {}) {
  const deadline = Date.now() + maxMs;
  const problems = [];
  for (let i = 0; i < PROVIDERS.length; i++) {
    const p = PROVIDERS[i];
    // leave time for the backups when there are any
    const budget = i < PROVIDERS.length - 1 ? Math.min(deadline - Date.now(), 55000) : deadline - Date.now();
    if (budget < 5000) break;
    try {
      const r = p === "gemini" ? await generateGemini(prompt, location, budget) : await generateCompat(p, prompt, budget);
      lastAiResult = { ok: true, provider: providerName(p), model: r.model, at: new Date().toISOString() };
      return r;
    } catch (e) {
      const msg = e.publicMessage || e.message;
      console.warn(`${providerName(p)} failed: ${msg}${i < PROVIDERS.length - 1 ? " Trying " + providerName(PROVIDERS[i + 1]) + "..." : ""}`);
      problems.push({ provider: providerName(p), msg, status: e.statusCode });
    }
  }
  lastAiResult = { ok: false, problems, at: new Date().toISOString() };
  if (problems.length === 1) throw publicError(problems[0].status || 502, problems[0].msg);
  throw publicError(503, problems.map((x) => (x.msg.startsWith(x.provider) ? x.msg : `${x.provider}: ${x.msg}`)).join("  |  ") || "No AI service answered.");
}

// ---------- Gemini ----------
// Tries each model. For each model it tries a few request "shapes", from the richest
// (Maps grounding, JSON schema, low thinking) down to a plain request, so a model or key
// that does not support a feature still answers.
async function generateGemini(prompt, location, maxMs) {
  const deadline = Date.now() + maxMs;
  const variants = uniqueBy([
    { maps: MAPS_GROUNDING, schema: !MAPS_GROUNDING, thinking: true },
    { maps: false, schema: true, thinking: true },
    { maps: false, schema: false, thinking: false }
  ], (v) => JSON.stringify(v));
  let last = null;

  models: for (const model of MODELS) {
    for (const variant of variants) {
      if (Date.now() + 4000 > deadline) break models;
      let res;
      for (let attempt = 0; attempt < 2; attempt++) {
        res = await callGemini(model, prompt, variant, location, deadline);
        // retry once only for a real "busy" answer, not for timeouts or network problems
        if (res.ok || !TRANSIENT.includes(res.status) || res.network || res.timeout) break;
        console.warn(`Gemini "${model}" is busy (${res.status}), retrying once.`);
        if (Date.now() + 6000 < deadline) await delay(1500); else break;
      }
      if (isKeyError(res) && !useVertex && process.env.GEMINI_API_BASE === undefined) {
        console.warn("The Gemini API rejected the key. Trying the Vertex AI express endpoint with the same key...");
        useVertex = true;
        const viaVertex = await callGemini(model, prompt, variant, location, deadline);
        if (viaVertex.ok || !isKeyError(viaVertex)) res = viaVertex; else useVertex = false;
      }
      last = { model, ...res };
      if (res.ok) {
        const text = extractText(res.data);
        if (text) return { text, data: res.data, model };
        const reason = res.data?.candidates?.[0]?.finishReason || res.data?.promptFeedback?.blockReason || "EMPTY";
        console.warn(`Gemini "${model}" returned no text (${reason}).`);
        last = { model, ok: false, status: 200, data: res.data, empty: reason };
        if (reason === "MAX_TOKENS") continue;
        continue models;
      }
      if (isKeyError(res)) break models;     // a bad key fails on every model
      if (res.network) break models;         // no connection to Google: other models will fail too
      console.warn(`Gemini "${model}" failed (${res.status}) with ${describeVariant(variant)}: ${errorDetail(res.data)}`);
      if (res.status === 400) continue;
      if ((res.status === 403 || res.status === 429) && variant.maps) continue;
      continue models;
    }
  }
  throw friendlyAiError(last);
}

async function callGemini(model, prompt, variant, location, deadline) {
  const generationConfig = { maxOutputTokens: 8192 };
  if (process.env.GEMINI_TEMPERATURE) generationConfig.temperature = Number(process.env.GEMINI_TEMPERATURE);
  if (variant.schema) { generationConfig.responseMimeType = "application/json"; generationConfig.responseSchema = PLAN_SCHEMA; }
  if (variant.thinking && /^gemini-(3|4)|latest$/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: "low" };
  const body = { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig };
  if (variant.maps) {
    body.tools = [{ googleMaps: {} }];
    if (validCoordinate(location)) {
      body.toolConfig = { retrievalConfig: { latLng: { latitude: Number(location.latitude), longitude: Number(location.longitude) } } };
    }
  }
  const url = useVertex
    ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent`
    : `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  return httpJson(url, { "x-goog-api-key": GEMINI_KEY }, body, deadline, `Gemini "${model}"`);
}

// POST JSON with a timeout. Marks network problems and timeouts so they can be explained.
async function httpJson(url, headers, body, deadline, label) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(4000, Math.min(45000, deadline - Date.now())))
    });
    return { ok: res.ok, status: res.status, data: await safeJson(res) };
  } catch (error) {
    const timeout = error.name === "TimeoutError" || error.name === "AbortError";
    const code = error.cause?.code || error.cause?.message || "";
    console.warn(`${label} request failed: ${timeout ? "took too long" : error.message} ${code}`);
    return { ok: false, status: 504, timeout, network: !timeout, data: { message: timeout ? "The AI took too long to answer." : `${error.message}${code ? " (" + code + ")" : ""}` } };
  }
}

function extractText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text).join("\n").trim();
}

function isKeyError(res) {
  if (!res || res.ok || ![400, 401, 403].includes(res.status)) return false;
  const err = res.data?.error || {};
  const reasons = JSON.stringify(err.details || []);
  return /API_KEY_INVALID|API_KEY_SERVICE_BLOCKED|API_KEY_HTTP_REFERRER_BLOCKED/.test(reasons) ||
    /api key not valid|invalid api key|api key expired|unregistered callers|API_KEY/i.test(err.message || "") ||
    res.status === 401;
}

function networkHelp(detail) {
  const tls = /certificate|cert|ssl|tls|SELF_SIGNED|UNABLE_TO/i.test(detail);
  return tls
    ? `this computer blocks secure connections from Node.js (${detail}). Antivirus "HTTPS/web scanning" is the usual cause: turn it off or add node.exe as an exception, then restart the server.`
    : `this computer cannot reach the AI service (${detail}). Check the internet connection, and allow node.exe in Windows Firewall or your antivirus.`;
}

function friendlyAiError(last) {
  if (!last) return publicError(503, "The AI took too long. Please try again.");
  if (isKeyError(last)) {
    return publicError(502, "Gemini rejected the API key. Create a new key at https://aistudio.google.com/apikey, paste it after GEMINI_API_KEY= in backend/.env (no spaces or quotes), then restart the server.");
  }
  if (last.network) return publicError(502, "Gemini: " + networkHelp(errorDetail(last.data)).replace(/^this/, "This"));
  if (last.timeout) return publicError(504, "Gemini took too long to answer. Please try again.");
  if (last.status === 403) return publicError(502, `Gemini refused the request (403): ${errorDetail(last.data)}. Check that the key is allowed to use the Gemini API.`);
  if (last.status === 404) return publicError(502, "None of the Gemini models in backend/.env are available to this key. Set GEMINI_MODEL=gemini-3.8-flash and restart.");
  if (last.status === 429) return publicError(503, `The free Gemini quota is used up for now (${errorDetail(last.data)}). Wait a minute (or until tomorrow for the daily limit), or add a free Groq key as a backup.`);
  if (TRANSIENT.includes(last.status)) return publicError(503, `Gemini is overloaded right now (${last.status}: ${errorDetail(last.data)}). Add a free Groq key in backend/.env as a backup, or try again in a minute.`);
  if (last.empty) return publicError(502, `Gemini did not return a plan (${last.empty}). Please try again.`);
  return publicError(502, `Gemini error (${last.status}): ${errorDetail(last.data)}`);
}

// ---------- OpenAI-compatible providers (Groq, OpenRouter) ----------
const discovered = {};
async function compatModels(id) {
  const c = COMPAT[id];
  if (discovered[id]) return discovered[id];
  let list = [];
  try {
    const res = await fetch(`${c.base}/models`, { headers: { Authorization: `Bearer ${c.key.trim()}` }, signal: AbortSignal.timeout(10000) });
    const data = await safeJson(res);
    const ids = (data.data || []).map((m) => m.id).filter((m) => !/whisper|guard|tts|orpheus|playai|compound|embed|vision|audio|image/i.test(m));
    for (const re of c.prefer) ids.filter((m) => re.test(m) && !list.includes(m)).forEach((m) => list.push(m));
  } catch { /* keep the built-in list */ }
  return (discovered[id] = unique([...c.models, ...list]).slice(0, 6));
}

async function generateCompat(id, prompt, maxMs) {
  const c = COMPAT[id];
  const deadline = Date.now() + maxMs;
  let models = c.models, last = null, discoveredOnce = false;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    for (const json of [true, false]) {
      if (Date.now() + 4000 > deadline) break;
      const body = {
        model, temperature: 0.3, max_tokens: 7000,
        messages: [
          { role: "system", content: "You are Komute's commute planner. Reply with one valid JSON object only." },
          { role: "user", content: prompt }
        ]
      };
      if (json) body.response_format = { type: "json_object" };
      const res = await httpJson(`${c.base}/chat/completions`, { Authorization: `Bearer ${c.key.trim()}`, "HTTP-Referer": "http://localhost", "X-Title": "Komute" },
        body, deadline, `${c.name} "${model}"`);
      last = { model, ...res };
      if (res.ok) {
        const text = String(res.data?.choices?.[0]?.message?.content || "").trim();
        if (text) {
          if (res.data?.choices?.[0]?.finish_reason === "length") console.warn(`${c.name} answer was cut off; Komute will repair it.`);
          return { text, data: {}, model: `${c.name}: ${model}` };
        }
        last = { ...last, ok: false, empty: res.data?.choices?.[0]?.finish_reason || "EMPTY" };
        break;
      }
      if (res.status === 401 || res.status === 403) throw publicError(502, `${c.name} rejected the API key. Check ${id.toUpperCase()}_API_KEY in backend/.env.`);
      if (res.network) throw publicError(502, networkHelp(errorDetail(res.data)));
      console.warn(`${c.name} "${model}" failed (${res.status}): ${errorDetail(res.data)}`);
      if (res.status === 400 && json && !/model/i.test(errorDetail(res.data))) continue; // try without JSON mode
      break; // next model
    }
    // A retired model name: ask the service which models exist now, once.
    if (i === models.length - 1 && !discoveredOnce) {
      discoveredOnce = true;
      const more = (await compatModels(id)).filter((m) => !models.includes(m));
      models = [...models, ...more];
    }
  }
  if (last?.status === 429) throw publicError(503, `${c.name} free limit reached for now. Wait a minute and try again.`);
  if (last?.timeout) throw publicError(504, `${c.name} took too long to answer.`);
  throw publicError(502, `${c.name} error (${last?.status ?? "?"}): ${last ? errorDetail(last.data) : "no answer"}`);
}

async function checkAi() {
  if (!PROVIDERS.length) return { ok: false, problem: missingKeyMessage(), envFile: ENV_FILE };
  const started = Date.now();
  try {
    const r = await generatePlan('Reply with this JSON only: {"summary":"Komute AI is working","options":[]}', null, { maxMs: 90000 });
    return { ok: true, model: r.model, reply: r.text.slice(0, 120), ms: Date.now() - started, providersInOrder: PROVIDERS.map(providerName) };
  } catch (e) {
    return { ok: false, problem: e.publicMessage || e.message, providersInOrder: PROVIDERS.map(providerName), geminiModels: MODELS };
  }
}

// ---------- Plan JSON helpers ----------
// Turns almost-JSON from an AI into a real object: removes code fences, escapes line breaks
// inside strings, drops trailing commas, and closes an answer that was cut off.
function repairJson(text) {
  if (!text) return null;
  let s = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = s.indexOf("{");
  if (start < 0) return null;
  s = s.slice(start);
  const tryParse = (t) => { try { return JSON.parse(t); } catch { return undefined; } };
  let v = tryParse(s.slice(0, s.lastIndexOf("}") + 1));
  if (v !== undefined) return v;
  // escape raw control characters inside strings
  let out = "", inStr = false, esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) { esc = false; out += ch; continue; }
      if (ch === "\\") { esc = true; out += ch; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") continue;
      if (ch === "\t") { out += " "; continue; }
      out += ch;
    } else { if (ch === '"') inStr = true; out += ch; }
  }
  s = out.replace(/,\s*([}\]])/g, "$1");
  v = tryParse(s.slice(0, s.lastIndexOf("}") + 1));
  if (v !== undefined) return v;
  // cut off: go back to a closed object and close everything still open
  const closers = (prefix) => {
    const stack = []; let q = false, e = false;
    for (const ch of prefix) {
      if (q) { if (e) e = false; else if (ch === "\\") e = true; else if (ch === '"') q = false; continue; }
      if (ch === '"') q = true; else if (ch === "{" || ch === "[") stack.push(ch); else if (ch === "}" || ch === "]") stack.pop();
    }
    return q ? null : stack.reverse().map((c) => (c === "{" ? "}" : "]")).join("");
  };
  let tries = 0;
  for (let i = s.length; i > 0 && tries < 400; i--) {
    if (s[i - 1] !== "}" && s[i - 1] !== "]") continue;
    tries++;
    const prefix = s.slice(0, i).replace(/,\s*$/, "");
    const c = closers(prefix);
    if (c === null) continue;
    v = tryParse((prefix + c).replace(/,\s*([}\]])/g, "$1"));
    if (v !== undefined) return v;
  }
  return null;
}

function parseGuide(text) {
  try {
    const g = repairJson(text);
    if (!g || !Array.isArray(g.options) || !g.options.length) return null;
    const str = (v, n = 400) => cleanText(v, n);
    return {
      summary: str(g.summary, 600),
      outsideArea: str(g.outsideArea, 400),
      options: g.options.slice(0, 4).map((o) => ({
        title: str(o.title, 140), tag: str(o.tag, 40),
        modes: (Array.isArray(o.modes) ? o.modes : []).map((m) => str(m, 30).toLowerCase()).filter(Boolean).slice(0, 6),
        duration: str(o.duration, 60), fare: str(o.fare, 80),
        steps: (Array.isArray(o.steps) ? o.steps : []).slice(0, 14).map((st) => ({
          kind: str(st.kind, 20).toLowerCase(), mode: str(st.mode, 30).toLowerCase(), text: str(st.text, 400),
          where: str(st.where, 240), sign: str(st.sign, 80), getOff: str(st.getOff, 240),
          fare: str(st.fare, 60), tip: str(st.tip, 240)
        })).filter((st) => st.text),
        why: str(o.why, 300), check: str(o.check, 300)
      })).filter((o) => o.steps.length),
      tips: (Array.isArray(g.tips) ? g.tips : []).map((t) => str(t, 300)).filter(Boolean).slice(0, 8),
      checks: (Array.isArray(g.checks) ? g.checks : []).map((t) => str(t, 300)).filter(Boolean).slice(0, 8)
    };
  } catch {
    return null;
  }
}

// Plain-text version (the Android app shows "plan" as text).
function guideToText(g) {
  const out = [g.summary];
  if (g.outsideArea) out.push(g.outsideArea);
  g.options.forEach((o, i) => {
    out.push("", `Option ${i + 1}: ${o.title}${o.duration ? ` (${o.duration})` : ""}`);
    o.steps.forEach((s, j) => {
      const end = (t) => t.replace(/[.\s]+$/, "") + ".";
      let line = `${j + 1}. ${s.text}`;
      if (s.where) line += ` Board at: ${end(s.where)}`;
      if (s.sign) line += ` Sign: ${end(s.sign)}`;
      if (s.getOff) line += ` Get off: ${end(s.getOff)}`;
      if (s.fare) line += ` Fare: ${end(s.fare)}`;
      out.push(line);
    });
    if (o.fare) out.push(`Fare: ${o.fare}`);
    if (o.why) out.push(`Advantages: ${o.why}`);
    if (o.check) out.push(`Verify: ${o.check}`);
  });
  if (g.tips.length) out.push("", "BEGINNER GUIDELINES", ...g.tips.map((t) => `- ${t}`));
  if (g.checks.length) out.push("", "IMPORTANT CHECKS", ...g.checks.map((t) => `- ${t}`));
  return out.join("\n").trim();
}

function extractMapsSources(data) {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const found = new Map();
  for (const chunk of chunks) {
    if (chunk.maps?.uri) found.set(chunk.maps.uri, { title: cleanText(chunk.maps.title, 160) || "Google Maps source", url: chunk.maps.uri });
  }
  return [...found.values()].slice(0, 8);
}

// ---------- Optional Reddit tips ----------
async function searchRedditTips(query) {
  if (!redditConfigured()) return [];
  const tokenResponse = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": process.env.REDDIT_USER_AGENT
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(8000)
  });
  const tokenData = await safeJson(tokenResponse);
  if (!tokenResponse.ok || !tokenData.access_token) throw new Error("Reddit OAuth failed");
  const url = new URL("https://oauth.reddit.com/r/HowToGetTherePH/search.json");
  url.searchParams.set("q", cleanText(query, 140));
  url.searchParams.set("restrict_sr", "1");
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("t", "year");
  url.searchParams.set("limit", "5");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, "User-Agent": process.env.REDDIT_USER_AGENT },
    signal: AbortSignal.timeout(8000)
  });
  const data = await safeJson(res);
  if (!res.ok) throw new Error("Reddit search failed");
  return (data.data?.children || []).map(({ data: post }) => ({
    title: cleanText(post.title, 180), excerpt: cleanText(post.selftext, 260),
    postedAt: new Date(Number(post.created_utc) * 1000).toISOString().slice(0, 10), status: "UNVERIFIED"
  }));
}

function redditConfigured() {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET && process.env.REDDIT_USER_AGENT);
}

// ---------- Small helpers ----------
function parseEndpoint(endpoint, name) {
  const text = cleanText(endpoint?.text, 240);
  if (!text) throw publicError(400, `Select or enter a valid ${name}.`);
  const location = validCoordinate(endpoint?.location)
    ? { latitude: Number(endpoint.location.latitude), longitude: Number(endpoint.location.longitude) } : null;
  const namedInArea = text.toLowerCase().includes("quezon city");
  if (!namedInArea && !(location && insideServiceArea(location))) {
    throw publicError(400, `Komute covers ${SERVICE_AREA.name} only. Choose a ${name} inside ${SERVICE_AREA.name}.`);
  }
  return { text, location };
}

function insideServiceArea(p) {
  return p.latitude >= SERVICE_AREA.south && p.latitude <= SERVICE_AREA.north &&
    p.longitude >= SERVICE_AREA.west && p.longitude <= SERVICE_AREA.east;
}

function haversineKm(a, b) {
  const r = Math.PI / 180, dl = (b.latitude - a.latitude) * r, dn = (b.longitude - a.longitude) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin(dn / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function coordinateSuffix(location) {
  return validCoordinate(location) ? ` (${Number(location.latitude).toFixed(6)}, ${Number(location.longitude).toFixed(6)})` : "";
}

function validCoordinate(value) {
  if (!value) return false;
  const latitude = Number(value.latitude), longitude = Number(value.longitude);
  return value.latitude !== null && value.longitude !== null && value.latitude !== "" &&
    Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function cleanText(value, limit = 300) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}
function splitList(s) { return String(s || "").split(",").map((x) => x.trim()).filter(Boolean); }
function unique(list) { return [...new Set(list.filter(Boolean))]; }
function uniqueBy(list, key) { const seen = new Set(); return list.filter((x) => !seen.has(key(x)) && seen.add(key(x))); }
function describeVariant(v) { return [v.maps && "Maps grounding", v.schema && "JSON schema", v.thinking && "low thinking"].filter(Boolean).join(" + ") || "a plain request"; }
function errorDetail(data) { return cleanText(data?.error?.message || data?.message || "no details", 240); }

async function safeJson(response) {
  const text = await response.text();
  try { return JSON.parse(text || "{}"); } catch { return { message: cleanText(text, 240) || `HTTP ${response.status}` }; }
}

function upstreamError(service, data, status) {
  return publicError(502, `${service} error: ${errorDetail(data) || "HTTP " + status}`);
}

function publicError(statusCode, publicMessage) {
  const error = new Error(publicMessage);
  error.statusCode = statusCode;
  error.publicMessage = publicMessage;
  return error;
}

function findWebDir() {
  const candidates = [path.resolve(HERE, "..", "web"), path.resolve(HERE, "web"), path.resolve(HERE, "public"), path.resolve(HERE, "..")];
  if (process.env.WEB_DIR) candidates.unshift(path.resolve(HERE, process.env.WEB_DIR));
  return candidates.find((dir) => fs.existsSync(path.join(dir, "index.html"))) || null;
}

function serveStatic(request, response, url) {
  if (!WEB_DIR) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    return response.end("Komute: the 'web' folder was not found. Put it next to the 'backend' folder.");
  }
  let urlPath;
  try { urlPath = decodeURIComponent(url.pathname); } catch { return json(response, 400, { error: "Bad path" }); }
  const file = path.resolve(WEB_DIR, "." + (urlPath === "/" ? "/index.html" : urlPath));
  const inside = file === WEB_DIR || file.startsWith(WEB_DIR + path.sep);
  if (!inside || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(response, 404, { error: "Not found" });
  response.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
  if (request.method === "HEAD") return response.end();
  fs.createReadStream(file).pipe(response);
}

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 256 * 1024) throw publicError(413, "Request is too large.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw publicError(400, "Invalid JSON request."); }
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// Reads the settings file. Accepts backend/.env, backend/.env.txt (Notepad adds ".txt"),
// backend/env, or the same names one folder up. Works with UTF-8 and "Unicode" (UTF-16) files.
function loadEnvFile() {
  const names = [".env", ".env.txt", "env", "env.txt", ".env.env"];
  const dirs = [HERE, path.join(HERE, "..")];
  const envPath = dirs.flatMap((d) => names.map((n) => path.join(d, n))).find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
  if (!envPath) return null;
  const raw = fs.readFileSync(envPath);
  let text;
  if (raw[0] === 0xff && raw[1] === 0xfe) text = raw.toString("utf16le");
  else if (raw[0] === 0xfe && raw[1] === 0xff) text = Buffer.from(raw).swap16().toString("utf16le");
  else text = raw.toString("utf8");
  text = text.replace(/^﻿/, "").replace(/\u0000/g, "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals < 1) continue;
    const key = trimmed.slice(0, equals).trim().replace(/^export\s+/, "");
    const value = trimmed.slice(equals + 1).trim().replace(/^['"]|['"]$/g, "").trim();
    // An empty variable already set in Windows does not block the value from the file.
    if (!process.env[key]) process.env[key] = value;
  }
  return envPath;
}

// Explains exactly why there is no key, so the fix is obvious.
function missingKeyMessage() {
  if (!ENV_FILE) {
    return `The AI is not set up yet: no .env file was found in ${HERE}. Copy your .env file into that folder (or rename .env.example to .env), put your Gemini key after GEMINI_API_KEY=, then restart the server.`;
  }
  return `The AI is not set up yet: ${ENV_FILE} was found, but it has no AI key. Open that file, paste a key right after GEMINI_API_KEY= (or GROQ_API_KEY=), with no spaces or quotes, save, then close and restart the server.`;
}
