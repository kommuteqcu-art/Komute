// Komute backend (Version 15): serves the website, searches places, and asks Gemini for a commute guide.
// Run with:  npm start      (from this "backend" folder)
// Test AI:   npm run check-ai
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadNetwork, loadWebData, findOptions, optionFromCandidate, describeForPrompt, fixRideStep, closeGaps, MAX_RIDES, rideLimit, planFare } from "./transit.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = loadEnvFile();
const billing = await import("./billing.mjs");

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
const NOMINATIM_USER_AGENT = process.env.NOMINATIM_USER_AGENT || "Komute/18 (Quezon City commute helper)";

const SERVICE_AREA = { name: "Quezon City", west: 120.98, east: 121.14, south: 14.58, north: 14.79 };
const WEB_DIR = findWebDir();
let NET = null; // Komute route data (web/js/data/routes.js)
try { NET = loadNetwork(WEB_DIR); } catch (e) { console.warn("Route data (web/js/data/routes.js) could not be loaded:", e.message); }
const LOCAL_PLACES = bundledPlaces(loadWebData(WEB_DIR, ["places.js", "schools.js", "transit.js"]));
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".apk": "application/vnd.android.package-archive"
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
- EDSA Carousel (Route 1, EDSA Busway, Monumento-PITX, 24/7): distance-based, about PHP 15-18 minimum. Cash or cashless.
- UV Express: about PHP 2.60 per km (modern about PHP 3.00). Boards only at its terminal. Tricycle: set by the barangay, agree on the fare first.
- Q City Bus (Quezon City government): FREE, about 6 AM-9 PM on weekdays, fewer trips on weekends. 8 routes:
  1 QC Hall Gate 3 (Kalayaan Ave.) - Cubao (Ali Mall); 2 QC Hall - Commonwealth - IBP Rd. - Litex; 3 Welcome Rotonda - E. Rodriguez - Kamuning - Kamias - Anonas - Aurora/Katipunan (LRT-2);
  4 QC Hall - North Ave. - Mindanao Ave. - Quirino Hwy. (SM Novaliches) - General Luis; 5 QC Hall - Visayas Ave. - Congressional - Mindanao Ave./Quirino Hwy.;
  6 QC Hall - Quezon Ave. - Timog - E. Rodriguez - Gilmore (Robinsons Magnolia); 7 QC Hall - C.P. Garcia - Katipunan - C-5 - Ortigas Ave.; 8 QC Hall - North Ave. - Congressional - Munoz.
- MRT-3: PHP 13-28 regular, 50% off for everyone since March 23, 2026. LRT-2: 50% off for everyone. LRT-1: regular fares (FPJ-Balintawak about PHP 19 Beep).
- MRT-7 is NOT open yet. Do not suggest it.
- EDSA Carousel (Route 1, busway in the middle of EDSA) stops in Quezon City, north to south: Balintawak, Kaingin Road, Roosevelt, SM North EDSA, North Avenue, Philam QC, Quezon Avenue, Kamuning, Nepa Q-Mart, Main Avenue (Cubao), Santolan. Use the footbridge to reach the stop.
- City bus routes through Quezon City (number: route, main QC roads): 3 Antipolo-Cubao/Quiapo (Ortigas Ave Ext); 6 Sapang Palay-PITX (Quezon Ave); 6A Sapang Palay-NIA Road (East Ave); 7 Fairview-PITX (Commonwealth, Elliptical Rd, Quezon Ave); 17 Fairview-Ayala (Commonwealth, Quezon Ave); 18 North EDSA-PITX (C-5); 33 Starmall SJDM-North EDSA; 33X Fairview-One Ayala (Commonwealth, EDSA Busway); 34 Rodriguez-PITX (Commonwealth, Quezon Ave); 36 Fairview-Alabang; 38 and 40 Fairview-Pacita/Alabang via Ayala (Commonwealth, Quezon Ave); 39 and 41 Fairview-Pacita/FTI via C-5; 49 Starmall SJDM-NAIA (Quezon Ave); 51 Valenzuela Gateway-Cubao (Mindanao Ave, SM North EDSA); 53 Cubao-Pacita (E. Rodriguez); 61 Cubao-Dasmarinas. When you suggest a city bus, give its route number and say to check the signboard.
- Taxi, Grab, and motorcycle taxis are added by the app itself. Do not plan them.`;

// ---------- Server ----------
const server = http.createServer(async (request, response) => {
  try {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Komute-Device");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (request.method === "OPTIONS") { response.writeHead(204); return response.end(); }
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET" && url.pathname === "/api/map-config") {
      response.setHeader("Cache-Control", "no-store");
      return json(response, 200, {
        browserKey: (process.env.GOOGLE_MAPS_BROWSER_KEY || "").trim(),
        mapId: (process.env.GOOGLE_MAP_ID || "").trim() || "DEMO_MAP_ID"
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json(response, 200, {
        ok: true, version: "18", webFolder: WEB_DIR || "NOT FOUND", routeData: NET ? NET.routes.length + " routes" : "NOT LOADED",
        placeSearch: "Nominatim", autocomplete: GOOGLE_PLACES_KEY ? "Google Places" : TOMTOM_KEY ? "TomTom" : GEOAPIFY_KEY ? "Geoapify" : "Photon (OpenStreetMap)", aiConfigured: PROVIDERS.length > 0, aiProviders: PROVIDERS.map(providerName), aiModels: MODELS,
        mapsGroundingRequested: MAPS_GROUNDING, lastAiResult, redditConfigured: redditConfigured(), billing: billing.billingStatus()
      });
    }
    if (request.method === "GET" && url.pathname === "/api/autocomplete") {
      // Test in a browser: /api/autocomplete?q=sandigan
      return await autocompleteEndpoint(response, { query: url.searchParams.get("q") || "" }, true);
    }
    if (request.method === "GET" && url.pathname === "/admin/payments") return await billing.adminPage(response, url);
    if (request.method === "GET" && url.pathname === "/feedback") return feedbackAdminPage(response, url);
    if (request.method === "GET" && url.pathname === "/api/qc-boundary") return await qcBoundaryEndpoint(response);
    if (request.method === "GET" && url.pathname === "/api/transit-points") return await transitPointsEndpoint(response);
    if (request.method === "GET" && url.pathname === "/api/ai-status") {
      return json(response, 200, await checkAi());
    }
    // Opening the link in a browser is a quick test: it says whether the key is right. It also accepts ?text=... for apps that send a GET.
    if (request.method === "GET" && url.pathname === "/api/gcash-sms") return json(response, 200, await gcashSms(request, url));
    if (request.method === "GET" && url.pathname === "/api/mail-test") return json(response, 200, await billing.mailTest(url.searchParams.get("key") || ""));
    if (request.method === "GET" || request.method === "HEAD") return serveStatic(request, response, url);
    if (request.method !== "POST") return json(response, 404, { error: "Not found" });

    if (url.pathname === "/api/gcash-sms") return json(response, 200, await gcashSms(request, url));
    const body = await readJson(request);
    if (url.pathname === "/api/places") return await placesEndpoint(response, body);
    if (url.pathname === "/api/reverse") return await reverseEndpoint(response, body);
    if (url.pathname === "/api/autocomplete") return await autocompleteEndpoint(response, body);
    if (url.pathname === "/api/feedback") return await feedbackEndpoint(request, response, body);
    if (url.pathname === "/api/place-details") return await placeDetailsEndpoint(response, body);
    if (url.pathname === "/api/commute-plan") return await commutePlanEndpoint(request, response, body);
    // Accounts and payments (switched off until the Supabase keys are set; see backend/billing.mjs)
    if (url.pathname === "/api/account") return json(response, 200, await billing.account(request));
    if (url.pathname === "/api/auth/signup") return json(response, 200, await billing.signUp(body));
    if (url.pathname === "/api/auth/login") return json(response, 200, await billing.signIn(body));
    if (url.pathname === "/api/auth/google") return json(response, 200, await billing.signInWithGoogle(body));
    if (url.pathname === "/api/auth/refresh") return json(response, 200, await billing.refresh(body));
    if (url.pathname === "/api/pay") return json(response, 200, await billing.startPayment(request, body));
    if (url.pathname === "/api/pay/request") return json(response, 200, await billing.payRequest(request, body));
    if (url.pathname === "/api/pay/manual") return json(response, 200, await billing.submitManual(request, body));
    if (url.pathname === "/api/admin/payments") return json(response, 200, await billing.adminAct(body));
    if (url.pathname === "/api/pay/confirm") return json(response, 200, await billing.confirmPayment(request, body));
    if (url.pathname === "/api/paymongo-webhook") return json(response, 200, await billing.webhook(body));
    if (url.pathname === "/api/routes") {
      return json(response, 410, { error: "Use /api/commute-plan for the AI commute plan." });
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    if (error.code && (error.statusCode || 500) < 500) console.warn(`${request.method} ${request.url}: ${error.message}`);
    else console.error(error);
    return json(response, error.statusCode || 500, { error: error.publicMessage || error.message || "Unexpected server error", code: error.code });
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
    console.log(`Route data: ${NET ? `${NET.routes.length} jeepney, bus, Carousel, Q City Bus, UV Express and train routes` : "NOT LOADED (check web/js/data/routes.js)"}`);
    loadQcBoundary();
    const bs = billing.billingStatus();
    console.log(`Accounts: ${bs.accounts} | Payments: ${bs.payments}`);
    console.log(`Test the AI any time: open http://localhost:${PORT}/api/ai-status\n`);
  });
}

// ---------- Places ----------
async function placesEndpoint(response, body) {
  const query = cleanText(body.query, 180);
  if (!query) return json(response, 400, { error: "Enter a place to search." });
  return json(response, 200, { suggestions: await findPlaces(query, body.near) });
}

function placeKey(value) {
  return String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").replace(/(?:^|\s)quezon city\s*$/, "").trim();
}

function bundledPlaces(data) {
  const landmarkAliases = {
    "Quezon City Hall": ["QC Hall", "QC City Hall"],
    "Quezon Memorial Circle": ["QMC", "QC Circle"],
    "Araneta City (Cubao)": ["Cubao", "Araneta City"],
    "SM North EDSA": ["SM North", "SM City North EDSA"]
  };
  const entries = [
    ...(data.landmarks || []).map((place) => ({
      ...place, aliases: landmarkAliases[place.name], label: place.name + ", Quezon City", kind: "landmark"
    })),
    ...(data.schools || []).map((place) => ({ ...place, label: place.address, kind: "place" })),
    ...(data.transit?.stations || []).map(({ name, line, lat, lng }) =>
      ({ name: name + " " + line, label: name + " " + line + ", Quezon City", aliases: [line + " " + name], lat, lng, kind: "place" })),
    ...Object.values(NET?.points || {}).map((place) => ({ ...place, label: place.name + ", Quezon City", kind: "place" }))
  ];
  return entries.filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng))
    .map(({ name, label, lat, lng, kind, aliases = [], approx }) => ({
      keys: [name, ...aliases, label].map(placeKey).filter(Boolean),
      suggestion: { name, label, sub: label, kind, location: { latitude: lat, longitude: lng }, approx: approx || kind === "place" }
    }));
}

function bundledMatches(query, exactOnly = false) {
  const key = placeKey(query);
  if (key.length < 2) return [];
  return LOCAL_PLACES.filter(({ suggestion }) => insideServiceArea(suggestion.location))
    .map(({ keys, suggestion }) => ({ suggestion,
      rank: keys.includes(key) ? 2 : keys.some((name) => name.startsWith(key + " ")) ? 1 : 0 }))
    .filter(({ rank }) => rank >= (exactOnly ? 2 : 1))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 6).map(({ suggestion }) => suggestion);
}

async function findPlaces(query, near, exactOnly = false) {
  const local = bundledMatches(query, true);
  if (local.length) return local;
  if (!exactOnly) {
    const partial = bundledMatches(query);
    if (partial.length) return partial;
  }
  const remote = await searchNominatim(query, near).catch(() => []);
  if (remote.length) return remote;
  return photonAutocomplete(query, near).catch(() => []);
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
  const data = await throttledNominatimFetch(url).catch(() => null);
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

// ---------- Real transit data from OpenStreetMap (Overpass API, free) ----------
// Used for: one-ride routes between A and B, stops/terminals near A and B (given to the AI),
// and the map layer with every mapped terminal, bus stop, jeepney/UV/tricycle terminal and station.
const OVERPASS_URLS = splitList(process.env.OVERPASS_URLS || "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter");
const ROUTE_TYPES = '"^(bus|share_taxi|minibus|trolleybus)$"';
const tripCache = new Map();
let pointsCache = null; // { at, data }
let pointsRefresh = null;
let pointsRefreshAt = 0;
const POINTS_FILE = path.join(HERE, "transit-cache.json");

async function overpass(query, timeoutMs) {
  let lastErr = null;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST", body: "data=" + encodeURIComponent(query),
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) { lastErr = new Error(`Overpass HTTP ${res.status}`); continue; }
      return await res.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Overpass not reachable");
}

function modeOf(tags) {
  const t = `${tags.name || ""} ${tags.network || ""} ${tags.ref || ""}`;
  if (/uv express|\bUV\b|PUV-?UV/i.test(t)) return "uv_express";
  if (/jeep|PUJ|share.?taxi/i.test(t) || tags.route === "share_taxi") return "jeepney";
  if (/carousel|busway/i.test(t)) return "carousel";
  if (/q ?city ?bus|libreng sakay/i.test(t)) return "qcity_bus";
  return "bus";
}

function osmKind(tags) {
  const n = tags.name || "";
  if (tags.highway && !/^(bus_stop|platform)$/.test(tags.highway)) return ""; // roads named "Terminal Road" are not terminals
  if (tags.railway === "station" || /^(subway|light_rail|train)$/.test(tags.station || "") || (tags.public_transport === "station" && (tags.train || tags.subway || tags.light_rail))) return "train";
  if (/uv express|uv terminal|\bvan terminal/i.test(n)) return "uv";
  if (/\btoda\b|tricycle|trike/i.test(n) || tags.taxi === "tricycle" || tags["taxi:type"] === "tricycle") return "tricycle";
  if (/jeep|\bpuj\b/i.test(n) || tags.share_taxi === "yes") return /terminal/i.test(n) || tags.amenity === "bus_station" ? "jeepney" : "jeepstop";
  if (tags.amenity === "bus_station" || /terminal/i.test(n)) return "terminal";
  if (tags.highway === "bus_stop" || tags.public_transport === "platform" || tags.public_transport === "stop_position") return "stop";
  if (tags.amenity === "taxi") return "tricycle"; // in Quezon City most taxi stands in OSM are tricycle (TODA) stands
  return "";
}

function pointOf(el) {
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  return Number.isFinite(lat) && Number.isFinite(lon) ? { latitude: lat, longitude: lon } : null;
}

// One-ride routes near both points + named stops/terminals near each point.
async function tripTransit(a, b) {
  if (!validCoordinate(a) || !validCoordinate(b)) return null;
  const key = [a.latitude, a.longitude, b.latitude, b.longitude].map((n) => Number(n).toFixed(3)).join(",");
  const hit = tripCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.value;
  const near = (p, r) => `(
  nwr(around:${r * 2},${p.latitude},${p.longitude})["amenity"~"^(bus_station|taxi)$"];
  nwr(around:${r * 2},${p.latitude},${p.longitude})["public_transport"="station"];
  node(around:${r},${p.latitude},${p.longitude})["highway"="bus_stop"];
  node(around:${r},${p.latitude},${p.longitude})["public_transport"~"^(platform|stop_position)$"];
  nwr(around:${r * 2},${p.latitude},${p.longitude})["name"~"terminal|TODA|tricycle",i];
);
out center tags 30;`;
  const q = `[out:json][timeout:20];
rel(around:450,${a.latitude},${a.longitude})["type"="route"]["route"~${ROUTE_TYPES}]->.a;
rel(around:450,${b.latitude},${b.longitude})["type"="route"]["route"~${ROUTE_TYPES}]->.b;
rel.a.b;
out tags;
${near(a, 350)}
${near(b, 350)}`;
  const data = await overpass(q, 15000);
  const direct = new Map(), nearA = new Map(), nearB = new Map();
  for (const el of data.elements || []) {
    const t = el.tags || {};
    if (el.type === "relation") {
      const mode = modeOf(t);
      const ends = [t.from, t.to].filter(Boolean).join(" → ") || cleanText(String(t.name || "").split(":").slice(1).join(":"), 120);
      const k = `${mode}|${t.ref || t.name}`;
      if (!direct.has(k)) direct.set(k, { mode, ref: cleanText(t.ref, 20), name: cleanText(t.name, 140), ends: cleanText(ends, 140), operator: cleanText(t.operator, 80) });
      continue;
    }
    const kind = osmKind(t), p = pointOf(el);
    if (!kind || !p || !t.name) continue;
    const item = { kind, name: cleanText(t.name, 100), routes: cleanText(t.route_ref, 80) };
    const da = haversineKm(p, a), db = haversineKm(p, b);
    const target = da <= db ? nearA : nearB, d = Math.min(da, db);
    if (d < 0.8 && !target.has(item.name)) target.set(item.name, { ...item, m: Math.round(d * 1000) });
  }
  const sortM = (m) => [...m.values()].sort((x, y) => x.m - y.m).slice(0, 8);
  const value = { direct: [...direct.values()].slice(0, 10), nearA: sortM(nearA), nearB: sortM(nearB), source: "OpenStreetMap" };
  tripCache.set(key, { at: Date.now(), value });
  if (tripCache.size > 500) tripCache.delete(tripCache.keys().next().value);
  return value;
}

function transitForPrompt(t, hints) {
  const lines = [];
  if (t) {
    const label = (r) => `${r.mode === "jeepney" ? "Jeepney" : r.mode === "uv_express" ? "UV Express" : "Bus"}${r.ref ? " " + r.ref : ""}: ${r.ends || r.name}${r.operator ? ` (${r.operator})` : ""}`;
    lines.push(t.direct.length
      ? `ONE-RIDE routes that pass near BOTH Point A and Point B (OpenStreetMap): ${t.direct.map(label).join("; ")}.`
      : "OpenStreetMap has no mapped route passing near both points (the map data may be incomplete).");
    const near = (arr) => arr.map((s) => `${s.name} (${s.kind}, about ${s.m} m${s.routes ? ", routes " + s.routes : ""})`).join("; ");
    if (t.nearA.length) lines.push(`Stops and terminals near Point A: ${near(t.nearA)}.`);
    if (t.nearB.length) lines.push(`Stops and terminals near Point B: ${near(t.nearB)}.`);
  }
  if (hints && hints.length) lines.push(`Komute city-bus guide (main roads near both points): ${hints.join("; ")}.`);
  return lines.length ? "REAL TRANSIT DATA (may be incomplete; prefer it over guesses):\n" + lines.join("\n") : "";
}

// All mapped transit points in and around Quezon City, for the map layer (cached 24 h).
function transitPointsEndpoint(response) {
  if (!pointsCache) {
    try { pointsCache = JSON.parse(fs.readFileSync(POINTS_FILE, "utf8")); } catch { pointsCache = null; }
  }
  const now = Date.now();
  if (!pointsRefresh && now - pointsRefreshAt > 5 * 60 * 1000 && (!pointsCache || now - pointsCache.at >= 24 * 3600 * 1000)) {
    pointsRefreshAt = now;
    pointsRefresh = refreshTransitPoints().finally(() => { pointsRefresh = null; });
  }
  if (pointsCache) return json(response, 200, pointsCache.data);
  const features = Object.values(NET?.points || {}).filter((p) => !p.out && insideQC(p.lat, p.lng)).map((p) => ({
    type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    properties: { k: "stop", n: p.name, r: "" }
  }));
  return json(response, 200, { type: "FeatureCollection", features, source: "Komute route data" });
}

async function refreshTransitPoints() {
  const bb = `${SERVICE_AREA.south - 0.01},${SERVICE_AREA.west - 0.01},${SERVICE_AREA.north + 0.01},${SERVICE_AREA.east + 0.01}`;
  const q = `[out:json][timeout:90];
(
  nwr["amenity"="bus_station"](${bb});
  nwr["public_transport"="station"](${bb});
  nwr["railway"="station"](${bb});
  node["highway"="bus_stop"](${bb});
  node["public_transport"="stop_position"]["share_taxi"="yes"](${bb});
  nwr["amenity"="taxi"](${bb});
  nwr["name"~"terminal|TODA|tricycle|jeepney|UV Express",i]["highway"!~"."](${bb});
);
out center tags;`;
  try {
    const data = await overpass(q, 60000);
    const seen = new Set();
    const features = [];
    for (const el of data.elements || []) {
      const t = el.tags || {}, k = osmKind(t), p = pointOf(el);
      if (!k || !p) continue;
      const id = `${k}|${p.latitude.toFixed(4)}|${p.longitude.toFixed(4)}|${t.name || ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: [+p.longitude.toFixed(6), +p.latitude.toFixed(6)] },
        properties: { k, n: cleanText(t.name, 90), r: cleanText(t.route_ref, 60) } });
    }
    const out = { type: "FeatureCollection", features, source: "© OpenStreetMap contributors", at: new Date().toISOString() };
    pointsCache = { at: Date.now(), data: out };
    try { fs.writeFileSync(POINTS_FILE, JSON.stringify(pointsCache)); } catch { /* read-only disk is fine */ }
  } catch (e) {
    console.warn("Transit points failed:", e.message);
  }
}

// ---------- Feedback ----------
// Saved to backend/feedback.jsonl and printed in the server log. On Render's free plan files are wiped on restart,
// so set FEEDBACK_WEBHOOK_URL (a Discord or Slack webhook) to also receive every message there permanently.
// Read them at /feedback?key=YOUR_FEEDBACK_ADMIN_KEY
const FEEDBACK_FILE = path.join(HERE, "feedback.jsonl");
const FEEDBACK_ADMIN_KEY = (process.env.FEEDBACK_ADMIN_KEY || "").trim();
const FEEDBACK_WEBHOOK_URL = (process.env.FEEDBACK_WEBHOOK_URL || "").trim();
const feedbackRecent = [];
const feedbackRate = new Map();

async function feedbackEndpoint(request, response, body) {
  const ip = String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now(), hits = (feedbackRate.get(ip) || []).filter((t) => now - t < 3600000);
  if (hits.length >= 20) return json(response, 429, { error: "Too many messages. Please try again later." });
  hits.push(now); feedbackRate.set(ip, hits);
  const categories = ["plan", "map", "fares", "bug", "idea"];
  const entry = {
    at: new Date().toISOString(),
    rating: ["up", "down"].includes(body.rating) ? body.rating : "",
    category: categories.includes(body.category) ? body.category : "idea",
    message: cleanText(body.message, 1000), contact: cleanText(body.contact, 120),
    from: cleanText(body.trip?.from, 160), to: cleanText(body.trip?.to, 160),
    lang: body.lang === "tl" ? "tl" : "en", page: cleanText(body.page, 20), model: cleanText(body.model, 60)
  };
  if (!entry.message && !entry.rating) return json(response, 400, { error: "Please choose Helpful / Not helpful or write a message." });
  feedbackRecent.unshift(entry);
  if (feedbackRecent.length > 500) feedbackRecent.pop();
  try { fs.appendFileSync(FEEDBACK_FILE, JSON.stringify(entry) + "\n"); } catch (e) { console.warn("Could not save feedback file:", e.message); }
  console.log("FEEDBACK", JSON.stringify(entry));
  try { // email (and phone push) to the owner, like payment alerts
    const em = entry.rating === "up" ? "👍" : entry.rating === "down" ? "👎" : "💬";
    billing.notifyFeedback(`Komute feedback ${em} (${entry.category})`, [
      `Rating: ${entry.rating === "up" ? "Helpful" : entry.rating === "down" ? "Not helpful" : "none"}`, `About: ${entry.category}`,
      entry.message ? `Message: ${entry.message}` : "", entry.contact ? `From: ${entry.contact}` : "",
      entry.from ? `Trip: ${entry.from} -> ${entry.to}` : "", `Language: ${entry.lang} | Time: ${entry.at}`].filter(Boolean));
  } catch (e) { console.warn("Feedback notice failed:", e.message); }
  if (FEEDBACK_WEBHOOK_URL) {
    const icon = entry.rating === "up" ? "👍" : entry.rating === "down" ? "👎" : "💬";
    const text = `${icon} Komute feedback (${entry.category})${entry.from ? `\nTrip: ${entry.from} → ${entry.to}` : ""}${entry.message ? `\n${entry.message}` : ""}${entry.contact ? `\nFrom: ${entry.contact}` : ""}`.slice(0, 1900);
    fetch(FEEDBACK_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text, text }), signal: AbortSignal.timeout(6000) })
      .catch((e) => console.warn("Feedback webhook failed:", e.message));
  }
  return json(response, 200, { ok: true });
}

function feedbackAdminPage(response, url) {
  const send = (status, html) => { response.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); response.end(html); };
  if (!FEEDBACK_ADMIN_KEY) return send(404, "<p>Feedback page is off. Set FEEDBACK_ADMIN_KEY on the server to turn it on.</p>");
  if (url.searchParams.get("key") !== FEEDBACK_ADMIN_KEY) return send(403, "<p>Wrong or missing key.</p>");
  let rows = [];
  try { rows = fs.readFileSync(FEEDBACK_FILE, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).reverse(); } catch { rows = feedbackRecent; }
  const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const up = rows.filter((r) => r.rating === "up").length, down = rows.filter((r) => r.rating === "down").length;
  send(200, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Komute feedback</title>
  <style>body{font-family:system-ui;margin:1rem;color:#17211e}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:.5rem;text-align:left;vertical-align:top;font-size:.9rem}th{background:#d8f1e9}</style>
  <h1>Komute feedback</h1><p>${rows.length} messages · 👍 ${up} · 👎 ${down}. Newest first. (Messages since the last server restart; use a webhook to keep all.)</p>
  <table><tr><th>When</th><th>Rating</th><th>About</th><th>Trip</th><th>Message</th><th>Contact</th></tr>
  ${rows.map((r) => `<tr><td>${esc(r.at.replace("T", " ").slice(0, 16))}</td><td>${r.rating === "up" ? "👍" : r.rating === "down" ? "👎" : ""}</td><td>${esc(r.category)}</td><td>${esc(r.from)}${r.to ? " → " + esc(r.to) : ""}</td><td>${esc(r.message)}</td><td>${esc(r.contact)}</td></tr>`).join("")}</table>`);
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
  const local = bundledMatches(query);
  if (!debug && bundledMatches(query, true).length) return json(response, 200, { suggestions: local, provider: "komute" });
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
      const dup = (x, y) => x.name.toLowerCase() === y.name.toLowerCase() &&
        haversineKm(x.location, y.location) < 0.12; // same name AND same spot; different campuses stay
      (await photonAutocomplete(query, near)).forEach((x) => { if (!list.some((y) => dup(x, y))) list.push(x); });
    } catch { /* fine */ }
  }
  list = withHouseNumber(query, list).slice(0, 10);
  if (!list.length && local.length) { list = local; used = "komute"; }
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
  return insideQC(lat, lon);
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
// Plan categories shown as tabs in the app. Taxi and ride-hailing are built by the app from fares.
const CATEGORY_IDS = ["commute", "jeepney", "bus", "uv_express"];

async function commutePlanEndpoint(request, response, body) {
  const origin = parseEndpoint(body.origin, "starting point");
  const destination = parseEndpoint(body.destination, "destination");
  const pass = await billing.gate(request); // null when accounts are switched off
  const beginnerMode = body.beginnerMode !== false;
  const language = body.language === "tl" ? "tl" : "en";
  // Resolve typed places before planning so a missing location gets an actionable error.
  await Promise.all([origin, destination].map(async (p) => {
    if (p.location) return;
    const hit = (await findPlaces(p.text, null, true)).find((place) =>
      validCoordinate(place.location) && insideServiceArea(place.location));
    if (hit) p.location = hit.location;
  }));
  if (!origin.location || !destination.location) {
    const missingStart = !origin.location;
    throw publicError(400, language === "tl"
      ? `Pumili ng mungkahi o maglagay ng pin sa mapa para sa ${missingStart ? "pinanggagalingan" : "destinasyon"} sa Quezon City.`
      : `Select a suggestion or pin the ${missingStart ? "starting point" : "destination"} on the map in Quezon City.`);
  }

  const found = NET ? findOptions(NET, origin.location, destination.location) : null;
  const guideOptions = { found, language, origin, destination };
  let guide = assembleGuide(guideOptions);
  const hasPlan = () => guide.categories.some((c) => c.options.length);
  let generated = null, transit = null;
  if (!hasPlan() && PROVIDERS.length) {
    const busHints = (Array.isArray(body.busHints) ? body.busHints : []).map((h) => cleanText(h, 120)).filter(Boolean).slice(0, 6);
    const withLimit = (p, ms) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(null), ms))]);
    let communityTips;
    [communityTips, transit] = await Promise.all([
      searchRedditTips(`${origin.text} ${destination.text}`).catch((e) => { console.warn("Optional Reddit search unavailable:", e.message); return []; }),
      withLimit(tripTransit(origin.location, destination.location).catch((e) => { console.warn("Transit lookup failed:", e.message); return null; }), 16000)
    ]);
    const prompt = buildPrompt({ origin, destination, beginnerMode, language, communityTips, found, transitText: transitForPrompt(transit, busHints) });
    try {
      const result = await generatePlan(prompt, origin.location);
      const aiGuide = parseGuide(result.text);
      if (aiGuide) {
        const fallback = assembleGuide({ ...guideOptions, aiGuide });
        if (fallback.categories.some((c) => c.options.length)) {
          guide = fallback;
          generated = result;
        }
      }
    } catch (e) {
      console.warn("Optional AI plan failed:", e.publicMessage || e.message);
    }
  }

  if (!hasPlan()) {
    if (!NET) throw publicError(503, language === "tl"
      ? "Hindi ma-load ang route data ng Komute. Subukan ulit mamaya."
      : "Komute's route data is unavailable. Please try again later.");
    // No public transport found: the app shows taxi and ride-hailing instead
    guide.noPublic = true;
  }
  const sources = generated ? extractMapsSources(generated.data) : [];
  const account = await billing.count(pass).catch((e) => { console.warn("Could not count the free plan:", e.message); return null; });
  return json(response, 200, {
    account,
    plan: guideToText(guide),
    guide: { ...guide, endpoints: [origin.location, destination.location] },
    language,
    model: generated ? generated.model : "komute-route-data",
    usedMapsGrounding: sources.length > 0,
    sources,
    transit
  });
}

function buildPrompt({ origin, destination, beginnerMode, language, communityTips, found, transitText }) {
  const km = validCoordinate(origin.location) && validCoordinate(destination.location)
    ? haversineKm(origin.location, destination.location).toFixed(1) : null;
  const data = found && NET ? describeForPrompt(NET, found) : "";
  return [
    "You are the planning engine of Komute, a public-transport helper for commuters in Quezon City, Philippines.",
    `Service area: ${SERVICE_AREA.name} only. Keep every transfer point and landmark inside ${SERVICE_AREA.name}. If the usual way leaves the city, say so in "outsideArea".`,
    `Make SEPARATE plans for each kind of transport, in "categories" (one entry for each id, in this order):
- "commute": the best overall way (1 to 3 options). Any mix of jeepney, bus, EDSA Carousel, Q City Bus, UV Express, MRT-3, LRT-1, and LRT-2 (up to 3 rides), with a tricycle only for a short connecting gap.
- "jeepney": a jeepney or modern jeepney is the main ride.
- "bus": a city bus, the EDSA Carousel, or the FREE Q City Bus is the main ride.
- "uv_express": a UV Express van is the main ride.
FEWEST RIDES: use as few rides as possible. Best is ONE ride (plus a short tricycle only if needed). Use 2 rides only when no single ride goes there. Never more than 3 rides in one plan, counting the tricycle. Never ride the same route twice. When you transfer, say clearly where to get off and which signboard to look for next.
CONNECTING RIDES (to reach the main ride, or from the main ride to the destination) can be any public transport. Choose the SAFEST one: MRT/LRT first, then the EDSA Carousel, then a city bus or Q City Bus, then a jeepney. Use a tricycle only for a short gap (about 1.5 km or less) that no route covers. Never make a whole plan out of a tricycle, and never tell the user to walk more than about 300 m. Do not suggest padyak.
Do NOT plan taxi, Grab, or motorcycle taxi. The app adds those (ride-hailing is suggested when no public transport works).
If a category has no real way for this trip, set "available": false, "options": [], and a short "note" why. Never invent a route.`,
    data ? `KOMUTE ROUTE DATA. These are real routes found for this trip, with the correct signboard for the direction of travel and the exact place to wait. USE THEM FIRST:
${data}
When you use a route from this list: copy its routeId (all ids if several), copy "fromStop" and "toStop" exactly, copy the "sign" text, and use the "wait" text for "where". You may add a well-known route that is not in the list only if you are sure it exists; then leave routeId empty.` : "No Komute route data matched this trip. Use only routes you are sure about.",
    `SIGNBOARD RULES: "sign" is the text painted on the vehicle: the two END TERMINALS of the route, written in the direction of travel, for example "NOVALICHES – BALINTAWAK / BLUMENTRITT" when going toward Balintawak, and "BALINTAWAK / BLUMENTRITT – NOVALICHES" when going toward Novaliches. Never use a road name as an end (wrong: "QUIRINO HIGHWAY – NOVALICHES"). Put the road in "via" (for example "Quirino Hwy. / A. Bonifacio"). For trains write the direction, for example "MRT-3: Southbound (to Taft Avenue)". For the EDSA Carousel write "EDSA CAROUSEL – PITX" or "EDSA CAROUSEL – MONUMENTO".`,
    `KIND OF VEHICLE: always say it in "text". Jeepney: "traditional jeepney" (open-air, no aircon) or "modern jeepney" (aircon). City bus: "aircon bus", "ordinary bus", or "aircon or ordinary bus" when both run on the route (most city bus routes). The route data above gives the kind for each signboard.`,
    `WHERE TO WAIT ("where"): name the exact stop or terminal and the side of the road (the side where traffic goes toward the destination). Never write something vague like "highway jeepney stop". EDSA Carousel: the median station in the middle of EDSA, reached by footbridge, and the Southbound or Northbound side. Trains: the station and the platform direction. UV Express: the terminal (vans leave when full). Q City Bus: the Q City Bus stop.`,
    "Every option must go ALL the way to Point B: start with a \"start\" step, give every ride a \"getOff\" place, and end with an \"arrive\" step. At most 8 steps per option. Short, simple sentences a first-time commuter can follow.",
    "If a ride does not stop at the exact destination (or does not pass the starting point), do not tell the user to walk: add the connecting ride, safest first (train, EDSA Carousel, bus, jeepney), with where to transfer and its signboard. A tricycle only for a short last gap. Walking is only for crossing the street or about 300 m or less.",
    "ONE RIDE FIRST: if a single bus, jeepney, UV Express, or train goes from near Point A to near Point B (see the route data below), the first \"commute\" option MUST be that one-ride option with tag \"fewest transfers\". Do not add transfers that are not needed.",
    "FOR BEGINNERS: Komute users are new to commuting or new to the city. Choose the SHORTEST and SIMPLEST plan, not a clever one: the most direct route with no detours (never go far past the destination and come back), the fewest transfers, boarding and getting off at big, easy-to-find places (malls, terminals, stations, schools, hospitals, major corners), and routes from the route data with clear signboards. Avoid long tricycle rides, side streets, and transfers at places with no landmark. Put the easiest plan first.",
    "BE SPECIFIC: never write vague places like 'nearest main road' or 'nearby terminal'. Name the street, terminal, stop, or landmark.",
    "Be honest about certainty. Use words like 'usually', 'about'. Never invent exact schedules.",
    "KEEP IT SHORT: each text value at most 20 words; 'where' and 'getOff' at most 18 words.",
    "Fares: approximate fare for each ride with the fare table and distance, like 'about PHP 14' or 'about PHP 14-18'. Q City Bus is free.",
    FARE_REFERENCE,
    beginnerMode
      ? "New Commuter Mode is ON: explain how to spot the right vehicle, how to pay, and where to ask for help. Add 4 to 6 short tips."
      : "The user wants a short plan: keep steps brief and give at most 3 tips.",
    language === "tl"
      ? "LANGUAGE: Write every text value in Filipino (Tagalog), the way people in Metro Manila talk. Keep place names, street names, vehicle names, and signboard words as they are (for example 'jeep', 'MRT-3', 'Para po')."
      : "LANGUAGE: Write every text value in clear, simple English. Keep Filipino phrases a commuter needs, like 'Para po'.",
    `Reply ONLY with one JSON object, no markdown, in this shape:
{"summary": string,
 "outsideArea": string (empty if not needed),
 "categories": [{"id": "commute" | "jeepney" | "bus" | "uv_express",
   "available": boolean, "note": string,
   "options": [{"title": string, "tag": "cheapest" | "fastest" | "easiest" | "fewest transfers" | "",
     "modes": [one or more of "jeepney","modern_jeepney","bus","carousel","qcity_bus","uv_express","tricycle","mrt3","lrt1","lrt2"],
     "duration": string, "fare": string,
     "steps": [{"kind": "start" | "walk" | "ride" | "transfer" | "arrive",
                "mode": one of the modes above or "",
                "text": string, "routeId": string, "fromStop": string, "toStop": string,
                "where": string, "sign": string, "via": string, "getOff": string, "fare": string, "tip": string}],
     "why": string, "check": string}]}],
 "tips": [string], "checks": [string]}`,
    transitText || "",
    `Point A: ${origin.text}${coordinateSuffix(origin.location)}`,
    `Point B: ${destination.text}${coordinateSuffix(destination.location)}`,
    km ? `Straight-line distance: about ${km} km (road distance is usually 20-40% more).` : "",
    communityTips.length ? `Unverified recent community posts (use only as hints): ${JSON.stringify(communityTips)}` : ""
  ].filter(Boolean).join("\n\n");
}

const STEP_SCHEMA = {
  type: "OBJECT",
  properties: {
    kind: { type: "STRING" }, mode: { type: "STRING" }, text: { type: "STRING" }, routeId: { type: "STRING" },
    fromStop: { type: "STRING" }, toStop: { type: "STRING" }, where: { type: "STRING" }, sign: { type: "STRING" },
    via: { type: "STRING" }, getOff: { type: "STRING" }, fare: { type: "STRING" }, tip: { type: "STRING" }
  },
  required: ["kind", "text"]
};
const PLAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    outsideArea: { type: "STRING" },
    categories: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" }, available: { type: "BOOLEAN" }, note: { type: "STRING" },
          options: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" }, tag: { type: "STRING" },
                modes: { type: "ARRAY", items: { type: "STRING" } },
                duration: { type: "STRING" }, fare: { type: "STRING" },
                steps: { type: "ARRAY", items: STEP_SCHEMA },
                why: { type: "STRING" }, check: { type: "STRING" }
              },
              required: ["title", "steps"]
            }
          }
        },
        required: ["id", "options"]
      }
    },
    tips: { type: "ARRAY", items: { type: "STRING" } },
    checks: { type: "ARRAY", items: { type: "STRING" } }
  },
  required: ["summary", "categories"]
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
  const generationConfig = { maxOutputTokens: 16384 }; // room for one plan per kind of ride
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
        model, temperature: 0.3, max_tokens: 12000,
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
    const r = await generatePlan('Reply with this JSON only: {"summary":"Komute AI is working","categories":[]}', null, { maxMs: 90000 });
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
  if (!text) return null;
  const g = repairJson(text); // also closes an answer that was cut off, so the plan is never half-finished
  if (!g || typeof g !== "object") return null;
  const str = (v, n = 400) => cleanText(v, n);
  const option = (o) => ({
    title: str(o.title, 140), tag: str(o.tag, 40),
    modes: (Array.isArray(o.modes) ? o.modes : []).map((m) => str(m, 30).toLowerCase()).filter(Boolean).slice(0, 6),
    duration: str(o.duration, 60), fare: str(o.fare, 80),
    steps: (Array.isArray(o.steps) ? o.steps : []).slice(0, 14).map((st) => ({
      kind: str(st.kind, 20).toLowerCase(), mode: str(st.mode, 30).toLowerCase(), text: str(st.text, 400),
      routeId: str(st.routeId, 80), fromStop: str(st.fromStop, 160), toStop: str(st.toStop, 160),
      where: str(st.where, 300), sign: str(st.sign, 120), via: str(st.via, 120), getOff: str(st.getOff, 260),
      fare: str(st.fare, 60), tip: str(st.tip, 300)
    })).filter((st) => st.text),
    why: str(o.why, 300), check: str(o.check, 300)
  });
  let categories = [];
  if (Array.isArray(g.categories)) {
    categories = g.categories.filter((c) => c && CATEGORY_IDS.includes(str(c.id, 30).toLowerCase())).map((c) => ({
      id: str(c.id, 30).toLowerCase(), available: c.available !== false, note: str(c.note, 300),
      options: (Array.isArray(c.options) ? c.options : []).slice(0, 3).map(option).filter((o) => o.steps.length)
    }));
  } else if (Array.isArray(g.options)) {
    // Older answer shape: one list of options. Put it under "commute".
    categories = [{ id: "commute", available: true, note: "", options: g.options.slice(0, 4).map(option).filter((o) => o.steps.length) }];
  }
  return {
    summary: str(g.summary, 600), outsideArea: str(g.outsideArea, 400), categories,
    tips: (Array.isArray(g.tips) ? g.tips : []).map((t) => str(t, 300)).filter(Boolean).slice(0, 8),
    checks: (Array.isArray(g.checks) ? g.checks : []).map((t) => str(t, 300)).filter(Boolean).slice(0, 8)
  };
}

// Joins the AI plan and Komute's route data into the final plan:
// - every ride step is checked against the route data (signboard direction, exact place to wait, where to get off),
// - every option starts at A and ends at B,
// - a category the AI skipped or left unfinished is filled from route data.
function assembleGuide({ aiGuide, found, language, origin, destination }) {
  const lang = language;
  const destName = shortPlace(destination.text);
  const km = validCoordinate(origin.location) && validCoordinate(destination.location) ? haversineKm(origin.location, destination.location) : null;
  const categories = CATEGORY_IDS.map((id) => {
    const ai = aiGuide && aiGuide.categories.find((c) => c.id === id);
    const cands = (found && found.categories[id]) || [];
    const legs = cands.flatMap((c) => c.legs);
    let options = (ai ? ai.options : []).map((o) => finishOption(o, { id, lang, legs, origin, destination, destName })).filter(Boolean);
    // Keep each tab honest: the Jeep tab has only jeepneys, the Bus tab only buses, and so on.
    options = options.filter((o) => fitsCategory(id, o.steps.filter((s) => s.kind === "ride" && !s.connect).map((s) => s.mode)));
    const fromData = cands.map((c) => optionFromCandidate(NET, c, { lang, originText: origin.text, destText: destination.text, category: id })).map((o) => finishOption(o, { id, lang, legs, origin, destination, destName, fromData: true })).filter(Boolean);
    // Fill a missing time or fare from the route-data option that uses the same routes
    for (const o of options) {
      if (o.duration && o.fare) continue;
      const ids = new Set(o.steps.flatMap((s) => s.routeIds || []));
      const twin = fromData.find((d) => d.steps.some((s) => (s.routeIds || []).some((x) => ids.has(x))));
      if (twin) { o.duration = o.duration || twin.duration; o.fare = o.fare || twin.fare; }
    }
    if (!options.length) options = fromData;
    else if (fromData.length && options.every((o) => o.steps.some((s) => s.kind === "ride" && s.verified === false))) {
      // The AI used routes Komute cannot confirm. Show the confirmed route first.
      options = [fromData[0], ...options];
    }
    options = fewestRides(options, fromData, id);
    let note = ai ? ai.note : "";
    if (!options.length && !note) note = defaultNote(id, lang, km);
    return { id, available: options.length > 0, note, options: options.slice(0, id === "commute" ? 3 : 2) };
  });
  // A tab whose plans need 2 or more extra rides than the best way is not worth it: point to the best way instead
  const best = categories[0].options.length ? Math.min(...categories[0].options.map(rideCount)) : 0;
  for (const c of categories.slice(1)) {
    if (!best || !c.options.length) continue;
    // A plan with 3 rides (counting a tricycle) is shown only when even the best way needs 3
    let keep = c.options.filter((o) => rideCount(o) <= Math.max(2, best));
    // Do not mix two kinds of PUV: if this tab only has plans that switch to another kind (jeep then Carousel)
    // while the best way uses one kind and no more rides, point to the best way instead
    const bestPure = categories[0].options.find((o) => !isMixed(o));
    let mixedOnly = false;
    if (keep.length && keep.every(isMixed) && bestPure && rideCount(bestPure) <= Math.min(...keep.map(rideCount))) { keep = []; mixedOnly = true; }
    if (keep.length) { c.options = keep; continue; }
    c.options = []; c.available = false;
    c.note = mixedOnly ? mixedNote(c.id, lang) : tooManyNote(c.id, lang, best);
  }
  const flat = [];
  for (const c of categories) for (const o of c.options) if (!flat.some((x) => x.title === o.title)) flat.push(o);
  return {
    summary: aiGuide ? aiGuide.summary : "",
    outsideArea: aiGuide ? aiGuide.outsideArea : "",
    categories,
    options: flat.slice(0, 6), // older apps read this list
    tips: aiGuide ? aiGuide.tips : [],
    checks: aiGuide ? aiGuide.checks : [],
    routeDataChecked: NET ? NET.checked : null
  };
}

// As few rides as possible. A ride is any vehicle in the plan, a tricycle included.
// - at most MAX_RIDES rides, and never the same route twice (for example Bus 33 -> UV -> Bus 33)
// - a route-data option with fewer rides is added when the AI's plans need more transfers
// - only the fewest rides (a 2-ride plan may join a 1-ride plan); fewer rides come first
const rideCount = (o) => o.steps.filter((s) => s.kind === "ride").length;
const routeKey = (o) => o.steps.filter((s) => s.kind === "ride" && !s.connect).map((s) => (s.routeIds && s.routeIds[0]) || s.sign || s.mode).join(">");
function reusesRoute(o) {
  const seen = new Set();
  for (const s of o.steps) {
    if (s.kind !== "ride" || s.connect) continue;
    const ids = s.routeIds || [];
    if (ids.some((x) => seen.has(x))) return true; // the earlier vehicle already goes there
    if (ids[0]) seen.add(ids[0]);
  }
  return false;
}
const mins = (o) => { const m = String(o.duration || "").match(/\d+/); return m ? Number(m[0]) : null; };
// Kind of PUV of a ride step (a tricycle connection and trains do not count)
const PUV_KIND = (m) => (/jeep/.test(m) ? "jeep" : /bus|carousel/.test(m) ? "bus" : /uv/.test(m) ? "uv" : "");
const kindsOf = (o) => new Set(o.steps.filter((s) => s.kind === "ride" && !/tricycle|padyak/.test(String(s.mode || ""))).map((s) => PUV_KIND(String(s.mode || ""))).filter(Boolean));
const isMixed = (o) => kindsOf(o).size > 1;
function fewestRides(options, fromData, id = "commute") {
  let pool = [...options];
  for (const d of fromData) if (!pool.some((o) => routeKey(o) === routeKey(d))) pool.push(d);
  const ok = pool.filter((o) => rideCount(o) <= MAX_RIDES && !reusesRoute(o));
  if (ok.length) pool = ok;
  const limit = rideLimit(pool.map(rideCount));
  pool = pool.filter((o) => rideCount(o) <= limit);
  // One more ride (a transfer or a tricycle) only when that plan is clearly faster (10 minutes or more)

  const fewest = Math.min(...pool.map(rideCount));
  const fewestMins = pool.filter((o) => rideCount(o) === fewest).map(mins).filter((x) => x != null);
  if (fewestMins.length) {
    const bestMins = Math.min(...fewestMins);
    pool = pool.filter((o) => rideCount(o) === fewest || (mins(o) != null && mins(o) <= bestMins - 10));
  }
  // One route is easiest: when one jeep / bus / UV route goes there (a tricycle at the ends is fine), use it.
  // Jeep, Bus and UV tabs drop plans that change between routes; "Best way" shows the one-route plan first.
  const mainRides = (o) => o.steps.filter((s) => s.kind === "ride" && !s.connect).length;
  if (pool.some((o) => mainRides(o) === 1)) {
    if (id !== "commute") pool = pool.filter((o) => mainRides(o) === 1);
  }
  // the AI's own options keep their order among plans with the same number of rides
  // Do not mix two kinds of PUV (jeep then bus) when one kind does it: in the Jeep / Bus / UV tabs keep only
  // single-kind plans if there are any; in "Best way" drop a mixed plan when a single-kind plan with no more rides
  // exists and is not much slower (15 minutes)
  if (id !== "commute" && pool.some((o) => !isMixed(o))) pool = pool.filter((o) => !isMixed(o));
  else pool = pool.filter((o) => !isMixed(o) || !pool.some((p) => !isMixed(p) && rideCount(p) <= rideCount(o) && (mins(p) == null || mins(o) == null || mins(p) <= mins(o) + 15)));
  return pool.map((o, n) => ({ o, n }))
    .sort((a, b) => (mainRides(a.o) > 1) - (mainRides(b.o) > 1) || rideCount(a.o) - rideCount(b.o) || isMixed(a.o) - isMixed(b.o) || a.n - b.n).map((x) => x.o);
}

const CAT_FAMILY = {
  jeepney: (m) => /jeep/.test(m),
  bus: (m) => /bus|carousel/.test(m),
  uv_express: (m) => /uv/.test(m)
};
// The tab's own kind of ride must be the main ride (at least half of the rides); connecting rides can be anything public.
function fitsCategory(id, modes) {
  if (!modes.length) return false;
  if (id === "commute") return true;
  const own = modes.filter(CAT_FAMILY[id]).length;
  return own > 0 && own * 2 >= modes.length;
}

// Connecting rides allowed in each tab when the main ride stops short of the place
// Connecting rides may be any public transport, safest first (train, EDSA Carousel, bus, jeep); tricycle only as a last resort
const CONNECT_FAMILIES = { commute: ["train", "bus", "jeep"], jeepney: ["train", "bus", "jeep"], bus: ["train", "bus", "jeep"], uv_express: ["train", "bus", "jeep"] };

function finishOption(o, { id, lang, legs, origin, destination, destName, fromData }) {
  const tl = lang === "tl";
  let rideIndex = 0;
  let steps = o.steps.map((st) => {
    // Tricycles and padyaks are short connecting rides, never the main ride
    if (st.kind === "ride" && /tricycle|trike|padyak|pedicab|trisikad/.test(st.mode + " " + st.text.toLowerCase()) && !/jeep|bus|uv|mrt|lrt/.test(st.mode)) {
      return { ...st, mode: "tricycle", connect: true };
    }
    if (fromData || st.kind !== "ride" || !NET) return st;
    const fixed = fixRideStep(NET, st, { lang, legs, rideIndex: rideIndex++ });
    if (fixed.badSign) {
      fixed.sign = ""; fixed.signs = [];
      fixed.tip = [fixed.tip, tl ? "Hindi makumpirma ang karatula. Itanong sa driver kung dadaan sila sa bababaan mo bago sumakay." : "The signboard could not be confirmed. Ask the driver if they pass your stop before you board."].filter(Boolean).join(" ");
    }
    return fixed;
  });
  // A ride that stops short of the place gets a connecting jeep/bus, or a tricycle / motorcycle taxi.
  const ridesBefore = steps.filter((s) => s.kind === "ride").length;
  if (NET) {
    steps = closeGaps(NET, steps, { origin: origin.location, destination: destination && destination.location, lang,
      originText: origin.text, destText: destination ? destination.text : destName, families: CONNECT_FAMILIES[id] || ["jeep", "bus"] });
  }
  // A plan that boards or drops you kilometers away from your places is wrong (for example a mixed-up AI answer)
  if (NET && origin.location && destination && destination.location) {
    const P = (key, p) => (key && NET.points[key]) || (p && p.lat != null ? p : null);
    const km = (a, b) => (a && b ? haversineKm({ latitude: a.lat, longitude: a.lng }, b) : 0);
    const main = steps.filter((s) => s.kind === "ride" && !s.connect);
    const first = main[0], last = main[main.length - 1];
    if (first && km(P(first.from, first.fromPt), origin.location) > 3.5) return null;
    if (last && km(P(last.to, last.toPt), destination.location) > 3.5) return null;
  }
  // Every ride needs a place to get off; the last ride ends near the destination.
  const rides = steps.filter((s) => s.kind === "ride");
  rides.forEach((s, n) => {
    if (!s.getOff) s.getOff = n === rides.length - 1 ? (tl ? `Pinakamalapit na hintuan sa ${destName}. Sabihin ang “Para po”.` : `The stop nearest ${destName}. Say “Para po”.`) : (tl ? "Itanong sa driver kung saan bababa para lumipat." : "Ask the driver where to get off for your transfer.");
  });
  if (!steps.length || steps[0].kind !== "start") steps.unshift({ kind: "start", mode: "", text: tl ? `Magsimula sa ${shortPlace(origin.text)}.` : `Start at ${shortPlace(origin.text)}.` });
  if (steps[steps.length - 1].kind !== "arrive") steps.push({ kind: "arrive", mode: "walk", text: tl ? `Maglakad papunta sa ${destName}. Nandoon ka na.` : `Walk to ${destName}. You have arrived.` });
  // Main rides only: padyak / tricycle connections are shown in the steps, not as a mode of the plan
  const modes = [...new Set([...(o.modes || []), ...steps.filter((s) => s.kind === "ride" && !s.connect).map((s) => s.mode)]
    .filter((m) => m && !/walk|tricycle|padyak/.test(m)))];
  // A connecting ride was added: say so in the title and add its time
  const added = steps.filter((s) => s.kind === "ride").length - ridesBefore;
  const addedMain = steps.filter((s) => s.kind === "ride" && !s.connect).length - o.steps.filter((s) => s.kind === "ride" && !s.connect).length;
  let { title, duration } = o;
  if (added > 0) {
    const extra = steps.filter((s) => s.kind === "ride").slice(-added).map(rideLabel).filter(Boolean);
    if (o.source === "data" && extra.length && addedMain > 0) title = `${title} → ${extra.join(" → ")}`;
    if (duration) duration = duration.replace(/(\d+)(\D+)(\d+)/, (m, a, sep, b) => `${+a + 10 * added}${sep}${+b + 15 * added}`);
  }
  // When a ride can be an ordinary or an aircon bus, give both totals ("Ordinary about ₱15 · Aircon about ₱18")
  let fare = o.fare;
  const confirmed = steps.filter((s) => s.kind === "ride" && !s.connect);
  if (confirmed.some((s) => s.vehicle === "bus_both") && confirmed.every((s) => Array.isArray(s.fareRange))) fare = planFare(steps, lang) || fare;
  return { ...o, title, duration, fare, category: id, modes, steps };
}

function rideLabel(s) {
  const code = String(s.routeCode || "").split(",")[0].trim(); // the main route only
  if (s.connect) return ""; // short padyak / tricycle connections are steps, not part of the title
  if (s.mode === "qcity_bus") return `Q City Bus ${code.replace(/^Route /, "")}`;
  if (s.mode === "carousel") return "EDSA Carousel";
  if (s.mode === "bus") return `Bus ${code.replace(/^Routes? /, "")}`;
  if (/jeep/.test(s.mode)) return "Jeep";
  return "";
}

function mixedNote(id, lang) {
  const tl = lang === "tl";
  const kind = { jeepney: tl ? "jeep" : "jeepney", bus: "bus", uv_express: "UV Express" }[id] || "";
  return tl ? `Walang iisang ${kind} na diretso rito; kailangang lumipat sa ibang uri ng sasakyan. Mas madali ang nasa "Pinakamainam" na tab.`
    : `No ${kind} goes there without switching to another kind of ride. The "Best way" tab is simpler.`;
}

function tooManyNote(id, lang, best) {
  const tl = lang === "tl";
  const kind = { jeepney: tl ? "jeep" : "jeepney", bus: "bus", uv_express: "UV Express" }[id] || "";
  const rides = tl ? (best === 1 ? "isang sakay lang" : `${best} sakay lang`) : (best === 1 ? "just 1 ride" : `just ${best} rides`);
  return tl ? `Masyadong maraming lipat kung ${kind} ang gagamitin. Tingnan ang "Pinakamainam" na tab: ${rides}.`
    : `Going by ${kind} here needs too many transfers. See the "Best way" tab: ${rides}.`;
}

function defaultNote(id, lang, km) {
  const tl = lang === "tl";
  const notes = {
    commute: tl ? "Walang nakitang biyahe para sa rutang ito." : "No public transport route was found for this trip.",
    jeepney: tl ? "Walang jeep na nakita para sa biyaheng ito sa data ng Komute. Tingnan ang ibang tab." : "No jeepney route was found for this trip in Komute's data. See the other tabs.",
    bus: tl ? "Walang city bus, EDSA Carousel, o Q City Bus na dumadaan malapit sa dalawang lugar." : "No city bus, EDSA Carousel, or Q City Bus runs near both places.",
    uv_express: tl ? "Walang UV Express terminal na malapit para sa biyaheng ito." : "No UV Express terminal is near enough for this trip."
  };
  return notes[id] || "";
}

function shortPlace(text) {
  const parts = String(text || "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.slice(0, 2).join(", ") || String(text || "");
}

// Plain-text version (the Android app shows "plan" as text).
function guideToText(g) {
  const NAMES = { commute: "BEST WAY", jeepney: "JEEPNEY", bus: "BUS", uv_express: "UV EXPRESS" };
  const out = [g.summary].filter(Boolean);
  if (g.outsideArea) out.push(g.outsideArea);
  if (g.notice) out.push(g.notice);
  let n = 0;
  for (const c of g.categories) {
    out.push("", `== ${NAMES[c.id] || c.id.toUpperCase()} ==`);
    if (!c.options.length) { out.push(c.note || "Not available for this trip."); continue; }
    c.options.forEach((o) => {
      n++;
      out.push(`Option ${n}: ${o.title}${o.duration ? ` (${o.duration})` : ""}`);
      o.steps.forEach((s, j) => {
        const end = (t) => t.replace(/[.\s]+$/, "") + ".";
        let line = `${j + 1}. ${s.text}`;
        if (s.where) line += ` Board at: ${end(s.where)}`;
        if (s.sign) line += ` Sign: ${end(s.sign)}`;
        if (s.via) line += ` Via: ${end(s.via)}`;
        if (s.getOff) line += ` Get off: ${end(s.getOff)}`;
        if (s.fare) line += ` Fare: ${end(s.fare)}`;
        out.push(line);
      });
      if (o.fare) out.push(`Fare: ${o.fare}`);
      if (o.why) out.push(`Advantages: ${o.why}`);
      if (o.check) out.push(`Verify: ${o.check}`);
    });
  }
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
  if (location && !insideServiceArea(location)) {
    throw publicError(400, `Komute covers ${SERVICE_AREA.name} only. Choose a ${name} inside ${SERVICE_AREA.name}.`);
  }
  return { text, location };
}

function insideServiceArea(p) {
  return insideQC(p.latitude, p.longitude);
}

// ---------- The real Quezon City border (from OpenStreetMap), used to keep everything inside the city ----------
const NOMINATIM_BASE = (process.env.NOMINATIM_BASE || "https://nominatim.openstreetmap.org").replace(/\/$/, "");
const QC_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "qc-boundary.json");
let qcGeometry = null;        // GeoJSON Polygon / MultiPolygon, or null until it was loaded
let qcLoading = null;
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInGeometry(lon, lat, g) {
  const polys = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
  return polys.some((rings) => pointInRing(lon, lat, rings[0]) && !rings.slice(1).some((h) => pointInRing(lon, lat, h)));
}
// Inside the real border when we have it; otherwise inside the rough box
function insideQC(lat, lon) {
  const box = lat >= SERVICE_AREA.south && lat <= SERVICE_AREA.north && lon >= SERVICE_AREA.west && lon <= SERVICE_AREA.east;
  if (!box) return false;
  return qcGeometry ? pointInGeometry(lon, lat, qcGeometry) : true;
}
async function loadQcBoundary() {
  if (qcGeometry) return qcGeometry;
  if (qcLoading) return qcLoading;
  qcLoading = (async () => {
    try {
      const saved = JSON.parse(fs.readFileSync(QC_FILE, "utf8"));
      if (saved && saved.type) { qcGeometry = saved; return qcGeometry; }
    } catch { /* not saved yet */ }
    const url = new URL(NOMINATIM_BASE + "/search");
    url.searchParams.set("q", "Quezon City, Metro Manila, Philippines");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("polygon_geojson", "1");
    url.searchParams.set("polygon_threshold", "0.0003");
    url.searchParams.set("countrycodes", "ph");
    url.searchParams.set("limit", "5");
    let list = null, lastErr = null;
    for (let attempt = 1; attempt <= 3 && !list; attempt++) { // the free service is sometimes busy: try again a little later
      try {
        const res = await fetch(url, { headers: { "User-Agent": NOMINATIM_USER_AGENT, Accept: "application/json", Referer: "https://komute.onrender.com/" }, signal: AbortSignal.timeout(25000) });
        if (!res.ok) throw new Error("Nominatim HTTP " + res.status);
        list = await res.json();
      } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, attempt * 2500)); }
    }
    if (!list) throw lastErr || new Error("Nominatim did not answer");
    const hit = (list || []).find((r) => r.geojson && /^(Multi)?Polygon$/.test(r.geojson.type) && /quezon city/i.test(r.display_name || r.name || ""));
    if (!hit) throw new Error("No border found for Quezon City");
    qcGeometry = hit.geojson;
    try { fs.writeFileSync(QC_FILE, JSON.stringify(qcGeometry)); } catch { /* read-only disk is fine */ }
    console.log("Quezon City border loaded.");
    return qcGeometry;
  })().catch((e) => { console.warn("Could not load the Quezon City border (using the rough box):", e.message); return null; })
    .finally(() => { qcLoading = null; });
  return qcLoading;
}
function qcBoundaryEndpoint(response) {
  if (!qcGeometry) return json(response, 200, { geometry: null });
  response.setHeader("Cache-Control", "public, max-age=86400");
  return json(response, 200, { geometry: qcGeometry });
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
  const callback = urlPath === "/auth/callback";
  const file = path.resolve(WEB_DIR, "." + (urlPath === "/" || callback ? "/index.html" : urlPath));
  const inside = file === WEB_DIR || file.startsWith(WEB_DIR + path.sep);
  if (!inside || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(response, 404, { error: "Not found" });
  if (callback) response.setHeader("Referrer-Policy", "no-referrer");
  const apk = path.extname(file).toLowerCase() === ".apk";
  response.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Cache-Control": callback ? "no-store" : "no-cache", ...(apk ? { "Content-Disposition": 'attachment; filename="Komute.apk"' } : {}) });
  if (request.method === "HEAD") return response.end();
  fs.createReadStream(file).pipe(response);
}

function json(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

// The phone app that forwards GCash messages may send JSON, a form or plain text, so accept any of them.
async function gcashSms(request, url) {
  const chunks = []; let size = 0;
  for await (const c of request) { size += c.length; if (size > 64 * 1024) throw publicError(413, "Request is too large."); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString("utf8");
  let text = url.searchParams.get("text") || "", key = url.searchParams.get("key") || "";
  if (!text) {
    try { const j = JSON.parse(raw); text = String(j.text ?? j.message ?? j.body ?? j.msg ?? ""); key = key || String(j.key || ""); }
    catch { const f = new URLSearchParams(raw); text = f.get("text") || f.get("message") || f.get("body") || raw; key = key || f.get("key") || ""; }
  }
  if (!text && request.method === "GET") return billing.smsCheck(key);
  return billing.smsIn(key, text);
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
