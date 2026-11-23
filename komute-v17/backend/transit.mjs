// Komute route engine: finds real jeepney / bus / Carousel / Q City Bus / UV Express / train rides between two points
// from web/js/data/routes.js, writes the signboard in the right direction, and says exactly where to wait.
// It also checks and fixes the AI plan (wrong signboards like "QUIRINO HIGHWAY - NOVALICHES", vague "Ride here" text).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

// ---------- Load data ----------
export function loadNetwork(webDir) {
  const file = path.join(webDir || "", "js", "data", "routes.js");
  if (!webDir || !fs.existsSync(file)) return null;
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, "utf8"), sandbox, { filename: file, timeout: 2000 });
  return buildNetwork(sandbox.window.KOMUTE_DATA.network);
}

// Tricycle areas (registered TODAs) and areas with no tricycles, from routes.js. A gap with no tricycle is walked.
let NO_TRIKE = [], TODAS = [];
// The TODA whose area covers point p (closest one), or null
export function todaAt(p) {
  if (!p || p.lat == null) return null;
  let best = null;
  for (const [name, lat, lng, r] of TODAS) {
    const d = dist(p, { lat, lng });
    if (d <= r && (!best || d < best.d)) best = { name, d };
  }
  return best;
}
export function trikeOk(a, b) {
  const inside = (p) => p && p.lat != null && NO_TRIKE.some(([, lat, lng, r]) => dist(p, { lat, lng }) <= r);
  if (inside(a) || inside(b)) return false;
  if (!TODAS.length) return true; // no TODA list loaded: assume tricycles are around
  return Boolean(todaAt(a) || todaAt(b)); // a registered TODA serves the pickup or the drop-off area
}

export function buildNetwork(raw) {
  NO_TRIKE = Array.isArray(raw.noTricycle) ? raw.noTricycle : [];
  TODAS = Array.isArray(raw.todas) ? raw.todas : [];
  const points = {};
  for (const [key, v] of Object.entries(raw.points)) {
    points[key] = { key, name: v[0], lat: v[1], lng: v[2], road: v[3] || "", out: v[1] === null || v[1] === undefined };
  }
  const routes = raw.routes.map((r) => {
    const stops = r.stops.map((s) => {
      const m = String(s).match(/^(.+?)([<>])?$/);
      const p = points[m[1]];
      if (!p) throw new Error(`routes.js: route ${r.id} uses unknown point "${m[1]}"`);
      return { p, only: m[2] === ">" ? 0 : m[2] === "<" ? 1 : null };
    });
    return { ...r, stops, family: FAMILY[r.type] || "other" };
  });
  const net = { points, routes, byId: Object.fromEntries(routes.map((r) => [r.id, r])), checked: raw.checked };
  net.xfers = buildTransfers(net);
  return net;
}

// ---------- Constants ----------
export const FAMILY = { jeepney: "jeep", modern_jeepney: "jeep", bus: "bus", carousel: "bus", qcity_bus: "bus",
  uv_express: "uv", mrt3: "train", lrt1: "train", lrt2: "train" };
const SPEED = { jeepney: 14, modern_jeepney: 14, bus: 16, carousel: 24, qcity_bus: 15, uv_express: 22, mrt3: 32, lrt1: 32, lrt2: 32 }; // km/h with traffic
const WAIT = { jeepney: 6, modern_jeepney: 8, bus: 8, carousel: 5, qcity_bus: 15, uv_express: 12, mrt3: 6, lrt1: 6, lrt2: 6 }; // minutes
const ACCESS = { carousel: 4, mrt3: 5, lrt1: 5, lrt2: 5 }; // stairs, footbridge, bag check
const TRANSFER_M = 350; // transfers only where the next ride stops nearby (or across a footbridge)
const ROAD = 1.25; // road distance is longer than a straight line

// Plan categories. "commute" = best mix (trains allowed). Taxi and ride-hailing are built in the app from fares.
// Each tab: the main ride must be that kind (most of the distance). The rides that connect to it may be any
// public transport, safest first (train, EDSA Carousel, bus, then jeep); a tricycle only for short gaps.
export const CATEGORIES = {
  commute: { families: ["jeep", "bus", "uv", "train"] },
  jeepney: { families: ["jeep", "bus", "train"], must: "jeep", share: 0.5 },
  bus: { families: ["bus", "jeep", "train"], must: "bus", share: 0.5 },
  uv_express: { families: ["uv", "jeep", "bus", "train"], must: "uv", share: 0.4 },
  train: { families: ["train", "jeep", "bus"], must: "train", share: 0.4 }
};
// Extra minutes added when choosing a connecting ride, so safer rides win: trains and the Carousel have
// stations and their own lane, buses have marked stops, jeeps stop anywhere, tricycles share the road.
const SAFETY = { mrt3: 0, lrt1: 0, lrt2: 0, carousel: 1, bus: 2, qcity_bus: 2, uv_express: 3, modern_jeepney: 3, jeepney: 4 };

// ---------- Geometry ----------
const RAD = Math.PI / 180;
export function dist(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return Infinity;
  const dl = (b.lat - a.lat) * RAD, dn = (b.lng - a.lng) * RAD;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dn / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const walkMin = (m) => (m * 1.25) / 75; // 75 m per minute, streets are not straight
// Farther than this, a ride does not reach your place: Komute adds a connecting ride (tricycle or motorcycle taxi).
export const WALK_OK = 300; // farther than this: take a connecting ride, do not walk
const FEEDER_MAX = 1500; // a tricycle connects you to a route at most this far (longer gaps use real routes and transfers)
// Minutes to get between your place and a stop: walk if close, else a connecting tricycle (wait + about 15 km/h)
// ...plus a safety cost that grows with distance, so a transfer to a bus or the Carousel beats a long tricycle ride
const accessMin = (m) => (m <= WALK_OK ? walkMin(m) : 8 + ((m * 1.3) / 1000 / 12) * 60 + (m / 1000) * 6);

function buildTransfers(net) {
  const x = {};
  for (const r1 of net.routes) {
    x[r1.id] = {};
    for (const r2 of net.routes) {
      if (r1 === r2) continue;
      const list = [];
      r1.stops.forEach((s1, k) => {
        if (s1.p.out) return;
        r2.stops.forEach((s2, m) => {
          if (s2.p.out) return;
          const d = s1.p.key === s2.p.key ? 0 : dist(s1.p, s2.p);
          if (d <= TRANSFER_M) list.push({ k, m, d });
        });
      });
      if (list.length) x[r1.id][r2.id] = list;
    }
  }
  return x;
}

// ---------- Legs ----------
function served(stop, dir) { return stop.only === null || stop.only === dir; }

// A ride on route r from stop index i to stop index j, or null if not allowed.
function makeLeg(r, i, j) {
  if (i === j || i < 0 || j < 0) return null;
  const dir = i < j ? 0 : 1;
  const a = r.stops[i], b = r.stops[j];
  if (!served(a, dir) || !served(b, dir) || a.p.out || b.p.out) return null;
  // UV Express: you board at the terminal (first stop in the direction of travel)
  if (r.type === "uv_express") {
    const first = dir === 0 ? 0 : r.stops.length - 1;
    if (i !== first) return null;
  }
  let m = 0, prev = null;
  const step = dir === 0 ? 1 : -1;
  for (let k = i; k !== j + step; k += step) {
    const s = r.stops[k];
    if (!served(s, dir) || s.p.out) continue;
    if (prev) m += dist(prev, s.p);
    prev = s.p;
  }
  const km = (m / 1000) * ROAD;
  const minutes = WAIT[r.type] + (ACCESS[r.type] || 0) + (km / SPEED[r.type]) * 60;
  return { route: r, i, j, dir, from: a.p, to: b.p, km, minutes };
}

// Jeepneys and city buses can be flagged down (and you can get off) anywhere along their road,
// not only at the listed stops. Q City Bus, the Carousel, trains, and UV Express (boarding) use their stops.
const FLAG_DOWN = new Set(["jeepney", "modern_jeepney", "bus"]);
const ROADSIDE_M = 300; // you are "on the route" when its road is this close

// role: "board" (near the start) or "alight" (near the destination)
function nearStops(r, p, max = 3, radius = FEEDER_MAX, role = "board") {
  const out = [];
  r.stops.forEach((s, idx) => {
    if (s.p.out) return;
    const d = dist(p, s.p);
    if (d <= radius) out.push({ idx, d });
  });
  const roadside = FLAG_DOWN.has(r.type) || (role === "alight" && r.type === "uv_express");
  if (roadside) {
    for (let k = 0; k + 1 < r.stops.length; k++) {
      const A = r.stops[k].p, B = r.stops[k + 1].p;
      if (A.out || B.out) continue;
      const pr = project(p, A, B);
      if (!pr || pr.d > ROADSIDE_M || pr.t <= 0.02 || pr.t >= 0.98) continue;
      const road = A.road || B.road || "";
      const virt = { key: `v:${r.id}:${k}:${role}`, virtual: true, role, seg: [A.key, B.key], lat: pr.lat, lng: pr.lng, road,
        name: road ? `${road} (${role === "board" ? "near your starting point" : "near your destination"})` : (role === "board" ? "The road near your starting point" : "The road near your destination") };
      // boarding between stop k and k+1: going up you ride from k onward, going down from k+1
      if (role === "board") { out.push({ idx: k, d: pr.d, virt, dir: 0 }); out.push({ idx: k + 1, d: pr.d, virt, dir: 1 }); }
      else { out.push({ idx: k + 1, d: pr.d, virt, dir: 0 }); out.push({ idx: k, d: pr.d, virt, dir: 1 }); }
    }
  }
  return out.sort((a, b) => a.d - b.d).slice(0, max + (roadside ? 2 : 0));
}

// Closest point to p on segment A-B (meters, flat-earth approximation is fine at city scale)
function project(p, A, B) {
  const kx = 111320 * Math.cos(p.lat * RAD), ky = 110540;
  const ax = (A.lng - p.lng) * kx, ay = (A.lat - p.lat) * ky, bx = (B.lng - p.lng) * kx, by = (B.lat - p.lat) * ky;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  if (!len2) return null;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const x = ax + t * dx, y = ay + t * dy;
  return { t, d: Math.hypot(x, y), lat: p.lat + y / ky, lng: p.lng + x / kx };
}

// A leg that may start or end at a roadside point instead of a listed stop
function legWith(r, a, b) {
  const leg = makeLeg(r, a.idx, b.idx);
  if (!leg) return null;
  if (a.virt) { if (leg.dir !== a.dir) return null; leg.from = a.virt; }
  if (b.virt) { if (leg.dir !== b.dir) return null; leg.to = b.virt; }
  return leg;
}

// ---------- Search ----------
// Returns options per category, each { legs, walks, minutes, km, fare }
export function findOptions(net, origin, destination, feederMax = FEEDER_MAX) {
  const result = searchOptions(net, origin, destination, feederMax);
  // A place far from every route: allow a longer tricycle ride, but only for the tabs that would be empty
  if (feederMax < 3500 && Object.values(result.categories).some((l) => !l.length)) {
    const wide = searchOptions(net, origin, destination, 3500);
    for (const [cat, list] of Object.entries(wide.categories)) if (!result.categories[cat].length) result.categories[cat] = list;
  }
  return result;
}

function searchOptions(net, origin, destination, feederMax) {
  const O = { lat: origin.latitude, lng: origin.longitude }, D = { lat: destination.latitude, lng: destination.longitude };
  const straight = dist(O, D);
  const nearO = {}, nearD = {};
  for (const r of net.routes) {
    const a = nearStops(r, O, 3, feederMax, "board"), b = nearStops(r, D, 3, feederMax, "alight");
    if (a.length) nearO[r.id] = a;
    if (b.length) nearD[r.id] = b;
  }
  const found = [];
  const push = (legs, walks) => {
    // No going backwards: every transfer point must be about as close to the destination as the start, or closer
    if (legs.slice(1).some((l) => dist(l.from, D) > straight + 800)) return;
    // No tiny rides (walking is better), and every ride must bring you clearly closer to the destination
    if (legs.some((l) => l.km < 0.8)) return;
    if (legs.some((l) => dist(l.to, D) > dist(l.from, D) - 300)) return;
    // No pointless transfers: skip if one vehicle already goes from this boarding point to that drop-off point
    for (let n = 0; n + 1 < legs.length; n++) if (directExists(net, legs[n].from, legs[n + 1].to, [legs[n].route.family, legs[n + 1].route.family])) return;
    const ends = [walks[0], walks[walks.length - 1]];
    // Where tricycles do not operate, the gap is walked
    const endOk = [trikeOk(O, legs[0].from), trikeOk(legs[legs.length - 1].to, D)];
    // No tricycle there and too far to walk: not a real option
    if (ends.some((w, n) => !endOk[n] && w > 800)) return;
    const minutes = legs.reduce((s, l) => s + l.minutes, 0) + walks.slice(1, -1).reduce((s, w) => s + walkMin(w), 0)
      + ends.reduce((s, w, n) => s + (endOk[n] ? accessMin(w) : walkMin(w) * (w > WALK_OK ? 1.8 : 1)), 0) + (legs.length - 1) * 4 + ends.filter((w) => w > WALK_OK).length * 4;
    found.push({ legs, walks, minutes, km: legs.reduce((s, l) => s + l.km, 0), O, D });
  };

  // Direct rides
  for (const id of Object.keys(nearO)) {
    if (!nearD[id]) continue;
    const r = net.byId[id];
    for (const a of nearO[id]) for (const b of nearD[id]) {
      const leg = legWith(r, a, b);
      if (leg) push([leg], [a.d, b.d]);
    }
  }
  // One transfer
  for (const id1 of Object.keys(nearO)) {
    const r1 = net.byId[id1];
    for (const id2 of Object.keys(nearD)) {
      if (id1 === id2) continue;
      const xs = net.xfers[id1][id2];
      if (!xs) continue;
      const r2 = net.byId[id2];
      let best = null;
      for (const a of nearO[id1].slice(0, 2)) for (const b of nearD[id2].slice(0, 2)) for (const x of xs) {
        const l1 = legWith(r1, a, { idx: x.k }), l2 = legWith(r2, { idx: x.m }, b);
        if (!l1 || !l2) continue;
        const cost = l1.minutes + l2.minutes + walkMin(x.d) + accessMin(a.d) + accessMin(b.d);
        if (!best || cost < best.cost) best = { cost, legs: [l1, l2], walks: [a.d, x.d, b.d] };
      }
      if (best) push(best.legs, best.walks);
    }
  }
  // Two transfers: combine up to 3 rides (only the best boarding stop at each end, to keep it fast)
  const twoTransfer = () => {
    const out = [];
    for (const id1 of Object.keys(nearO)) {
      for (const id2 of Object.keys(net.xfers[id1])) {
        if (nearD[id2]) continue;
        for (const id3 of Object.keys(nearD)) {
          if (id3 === id1 || id3 === id2) continue;
          const x2s = net.xfers[id2][id3];
          if (!x2s) continue;
          const r1 = net.byId[id1], r2 = net.byId[id2], r3 = net.byId[id3];
          let best = null;
          const a = nearO[id1][0], b = nearD[id3][0];
          for (const x1 of net.xfers[id1][id2]) for (const x2 of x2s) {
            const l1 = legWith(r1, a, { idx: x1.k }), l2 = makeLeg(r2, x1.m, x2.k), l3 = legWith(r3, { idx: x2.m }, b);
            if (!l1 || !l2 || !l3) continue;
            const cost = l1.minutes + l2.minutes + l3.minutes + walkMin(x1.d + x2.d) + accessMin(a.d) + accessMin(b.d);
            if (!best || cost < best.cost) best = { cost, legs: [l1, l2, l3], walks: [a.d, x1.d, x2.d, b.d] };
          }
          if (best && best.legs.slice(1).every((l) => dist(l.from, D) <= straight + 800)) out.push(best);
        }
      }
    }
    return out;
  };

  for (const b of twoTransfer()) push(b.legs, b.walks);
  const result = { straightKm: straight / 1000, categories: {} };
  for (const [cat, rule] of Object.entries(CATEGORIES)) {
    const ok = (c) => c.legs.every((l) => rule.families.includes(l.route.family)) && (!rule.must || c.legs.some((l) => l.route.family === rule.must));
    // In "UV Express" (or "train") the main ride must be most of the trip, not a short add-on
    const mainShare = (c) => !rule.must || c.legs.filter((l) => l.route.family === rule.must).reduce((a, l) => a + l.km, 0) >= (rule.share || 0.4) * c.km;
    let list = found.filter((c) => ok(c) && mainShare(c));
    // A ride must actually help: skip options that walk almost as far as the trip itself
    list = list.filter((c) => c.walks[0] + c.walks[c.walks.length - 1] < Math.max(600, straight * 0.85));
    list.sort((a, b) => score(a) - score(b));
    result.categories[cat] = dedupe(net, list);
  }
  // Drop options that are far slower than the best way (for example three UV vans in a row)
  const all = Object.values(result.categories).flat();
  const best = all.length ? Math.min(...all.map((c) => c.minutes)) : 0;
  for (const cat of Object.keys(result.categories)) {
    // keep each tab's own best option (it is that kind of ride the user asked for), drop only much slower extras
    const own = result.categories[cat];
    result.categories[cat] = own.filter((c, n) => (n === 0 ? c.minutes <= best * 2.5 + 20 : c.minutes <= Math.min(best * 2 + 10, own[0].minutes * 1.3 + 10)));
  }
  // The "commute" list mixes everything; make sure a good train option is in it
  const train = result.categories.train[0];
  const commute = result.categories.commute.slice(0, 2);
  if (train && !commute.includes(train) && train.minutes <= best * 1.4 + 10) commute.push(train);
  else if (result.categories.commute[2]) commute.push(result.categories.commute[2]);
  result.categories.commute = commute;
  delete result.categories.train;
  for (const cat of Object.keys(result.categories)) {
    result.categories[cat] = result.categories[cat].slice(0, cat === "commute" ? 3 : 2).map((c) => ({ ...c, fare: tripFare(c) }));
  }
  return result;
}

function directExists(net, a, b, families = null) {
  for (const r of net.routes) {
    if (families && !families.includes(r.family)) continue;
    const i = r.stops.findIndex((s) => s.p.key === a.key), j = r.stops.findIndex((s) => s.p.key === b.key);
    if (i >= 0 && j >= 0 && makeLeg(r, i, j)) return true;
  }
  return false;
}

function score(c) { return c.minutes + (c.walks[0] + c.walks[c.walks.length - 1]) / 400 + (c.legs.length - 1) * 6 + c.legs.filter((l) => l.route.type === "qcity_bus").length * -3; }

// Keep one option per set of boarding/alighting points (other routes on the same stretch become extra signboards).
function dedupe(net, list) {
  const seen = new Set(), out = [], covered = [];
  for (const c of list) {
    // Same rides as an option we already have (its signboards already list this route)
    if (covered.some((cv) => cv.length === c.legs.length && c.legs.every((l, n) => cv[n].has(l.route.id)))) continue;
    const kind = (l) => (l.route.family === "jeep" ? "jeep" : l.route.type); // free Q City Bus is not the same as a paid bus
    const key = c.legs.map((l) => `${kind(l)}:${l.from.key}>${l.to.key}`).join("|");
    const shape = c.legs.map((l) => kind(l) + ":" + (l.route.family === "jeep" || l.route.type === "bus" ? signKey(l) : l.route.id)).join("|");
    if (seen.has(key) || seen.has(shape)) continue;
    seen.add(key); seen.add(shape);
    covered.push(c.legs.map((l) => new Set(sameStretch(net, l).map((x) => x.route.id))));
    out.push(c);
  }
  return out;
}
const signKey = (l) => endsFor(l.route, l.dir).join(">");

// ---------- Fares ----------
const quarter = (n) => Math.round(n * 4) / 4;
const puv = (base, cover, per, km) => quarter(base + Math.max(0, Math.ceil(km) - cover) * per);
const MRT3_PAIRS = [[0, 1, 13], [0, 2, 13], [0, 3, 16], [0, 4, 16], [1, 2, 13], [1, 3, 13], [1, 4, 16], [2, 3, 13], [2, 4, 13], [3, 4, 13]];

export function legFare(l) {
  const km = Math.max(1, l.km), t = l.route.type;
  if (t === "jeepney") return [puv(14, 4, 2.0, km), puv(14, 4, 2.0, km)];
  if (t === "modern_jeepney") return [puv(17, 4, 2.4, km), puv(17, 4, 2.4, km)];
  if (t === "bus") return [puv(15, 5, 2.49, km), puv(18, 5, 2.98, km)];
  if (t === "carousel") return [puv(15, 5, 2.49, km), puv(18, 5, 2.98, km)];
  if (t === "qcity_bus") return [0, 0];
  if (t === "uv_express") return [Math.max(20, Math.round(km * 2.6)), Math.max(25, Math.round(km * 3.0))];
  if (t === "mrt3") {
    const a = Math.min(l.i, l.j), b = Math.max(l.i, l.j);
    const p = MRT3_PAIRS.find(([x, y]) => x === a && y === b);
    return p ? [p[2] / 2, p[2] / 2] : [6.5, 14];
  }
  if (t === "lrt2") { const n = Math.abs(l.i - l.j); const v = quarter((13 + n * 1.25) / 2); return [v, v]; }
  if (t === "lrt1") return [19, 20];
  return [0, 0];
}
function tripFare(c) {
  let lo = 0, hi = 0;
  c.legs.forEach((l) => { const [a, b] = legFare(l); lo += a; hi += b; });
  return [lo, hi];
}
export function pesoRange([lo, hi], lang = "en") {
  const p = (n) => "₱" + (Math.abs(n - Math.round(n)) < 0.01 ? Math.round(n) : n.toFixed(2));
  if (hi <= 0) return lang === "tl" ? "LIBRE" : "FREE";
  const about = lang === "tl" ? "mga" : "about";
  return Math.round(hi) > Math.round(lo) ? `${about} ${p(lo)}–${p(hi)}` : `${about} ${p(lo)}`;
}
function minutesRange(m, lang) {
  const lo = Math.max(5, Math.round(m / 5) * 5), hi = Math.round((m * 1.4) / 5) * 5;
  return lang === "tl" ? `mga ${lo}–${Math.max(hi, lo + 5)} min` : `about ${lo}–${Math.max(hi, lo + 5)} min`;
}

// ---------- Words (English / Tagalog) ----------
const W = {
  en: {
    start: "Start at {o}.",
    walkTo: "Go to {s}, about {d} away.",
    walkXfer: "Get off and cross over to {s} (about {d}).",
    arrive: "Your destination is about {d} from where you get off.",
    arriveHere: "You have arrived. Your destination is right there.",
    ride: {
      jeepney: "Ride a jeepney going to {to}.", modern_jeepney: "Ride a modern jeepney going to {to}.",
      bus: "Ride a city bus ({code}) going to {to}.", carousel: "Ride the EDSA Carousel bus, {dir}.",
      qcity_bus: "Ride the FREE Q City Bus {code} going to {to}.", uv_express: "Ride a UV Express van going to {to}.",
      train: "Ride the {code} train, {dir}."
    },
    wait: {
      terminal: "Board at the start of the route: {s}. Wait at the loading area there.",
      street: "{s}. Stand on the {road} side where traffic goes toward {to}.",
      streetNoRoad: "{s}. Stand on the side of the road where traffic goes toward {to}.",
      bus: "Bus stop at {s}, on the {road} side going toward {to}.",
      qcity: "Q City Bus stop at {s} (going toward {to}).",
      carousel: "{s}, in the middle of EDSA. Take the footbridge and go to the {dir} side.",
      train: "{s}. Go up to the {dir} platform.",
      uv: "UV Express terminal at {s}. Vans leave when full.",
      roadside: "Right on {road}, near your starting point. Stand on the side where traffic goes toward {to} and wave to stop the vehicle.",
      roadsideHere: "Right where you got off, on {road}. Stand on the side where traffic goes toward {to} and wave to stop the vehicle.",
      roadsideNoRoad: "On the main road near your starting point. Stand on the side where traffic goes toward {to} and wave to stop the vehicle."
    },
    getOffRoadside: "Near your destination on {road}. Say “Para po” when you reach it.",
    getOff: "{s}. Say “Para po” before your stop.",
    getOffBus: "{s}. Tell the conductor your stop and press the bell or say “Para po”.",
    getOffCarousel: "{s}. Exit using the footbridge.",
    getOffTrain: "{s}. Tap out at the exit gate.",
    signAsk: "Not 100% sure of the sign? Ask the driver “Dadaan po ba kayo sa {s}?” before boarding.",
    free: "FREE",
    connectFirst: "Ride a {v} to {s} (about {d}).",
    connectLast: "Get off, then ride a {v} to {d2} (about {d}).",
    connectMid: "Ride a {v} to {s} (about {d}) to catch the next ride.",
    connectWhereFirst: "Nearest {v} terminal or the corner of your street.",
    connectWhereLast: "{V} drivers usually wait near {s}. Tell the driver your exact address.",
    connectWhereMid: "{V} drivers usually wait near {s}.",
    connectTip: "No {v}? Book a motorcycle taxi (Angkas, JoyRide, Move It) for about {mc}.",
    connectFare: "{V}: ask first",
    tricycle: "tricycle",
    nearStart: "Go to {s}, about {d} from your starting point.",
    walkNoTrikeFirst: "Walk about {d} to {s} (about {min} min). No tricycles operate around here.",
    walkNoTrikeLast: "Get off and walk about {d} to {d2} (about {min} min). No tricycles operate around here.",
    walkNoTrikeMid: "Walk about {d} to {s} (about {min} min) for the next ride. No tricycles operate around here.",
    walkNoTrikeTip: "In a hurry? Book a motorcycle taxi (Angkas, JoyRide, Move It) for about {mc}.",
    todaWhereFirst: "{toda} TODA tricycle terminal near you, or the corner of your street. Tricycles stay off the main highway and drop you at the corner.",
    todaWhereLast: "{toda} TODA tricycles usually wait at the corner near {s}. Tell the driver your exact address.",
    todaWhereMid: "{toda} TODA tricycles usually wait at the corner near {s}.",
    connectRide: "Not going all the way? Transfer here to another ride.",
    arriveAt: "You have arrived at {d}."
  },
  tl: {
    start: "Magsimula sa {o}.",
    walkTo: "Pumunta sa {s}, mga {d} lang.",
    walkXfer: "Bumaba at tumawid papunta sa {s} (mga {d}).",
    arrive: "Mga {d} lang ang pupuntahan mo mula sa bababaan.",
    arriveHere: "Nandito ka na. Malapit lang ang pupuntahan mo.",
    ride: {
      jeepney: "Sumakay ng jeep papuntang {to}.", modern_jeepney: "Sumakay ng modern jeep papuntang {to}.",
      bus: "Sumakay ng city bus ({code}) papuntang {to}.", carousel: "Sumakay ng EDSA Carousel bus, {dir}.",
      qcity_bus: "Sumakay ng LIBRENG Q City Bus {code} papuntang {to}.", uv_express: "Sumakay ng UV Express papuntang {to}.",
      train: "Sumakay ng {code}, {dir}."
    },
    wait: {
      terminal: "Sumakay sa simula ng ruta: {s}. Maghintay sa sakayan doon.",
      street: "{s}. Pumuwesto sa gilid ng {road} kung saan papunta ang mga sasakyan sa {to}.",
      streetNoRoad: "{s}. Pumuwesto sa gilid ng kalsada kung saan papunta ang mga sasakyan sa {to}.",
      bus: "Bus stop sa {s}, sa gilid ng {road} papuntang {to}.",
      qcity: "Q City Bus stop sa {s} (papuntang {to}).",
      carousel: "{s}, sa gitna ng EDSA. Umakyat sa footbridge at pumunta sa {dir} na side.",
      train: "{s}. Umakyat sa {dir} na platform.",
      uv: "UV Express terminal sa {s}. Umaalis ang van kapag puno na.",
      roadsideHere: "Kung saan ka bumaba, sa {road}. Pumuwesto sa gilid kung saan papunta ang mga sasakyan sa {to} at pumara.",
      roadside: "Mismo sa {road}, malapit sa pinanggalingan mo. Pumuwesto sa gilid kung saan papunta ang mga sasakyan sa {to} at pumara.",
      roadsideNoRoad: "Sa main road malapit sa pinanggalingan mo. Pumuwesto sa gilid kung saan papunta ang mga sasakyan sa {to} at pumara."
    },
    getOffRoadside: "Malapit sa pupuntahan mo sa {road}. Sabihin ang “Para po” pagdating doon.",
    getOff: "{s}. Sabihin ang “Para po” bago ang bababaan mo.",
    getOffBus: "{s}. Sabihin sa konduktor ang bababaan mo at pindutin ang bell o sabihin ang “Para po”.",
    getOffCarousel: "{s}. Lumabas gamit ang footbridge.",
    getOffTrain: "{s}. I-tap ang card o ticket sa exit gate.",
    signAsk: "Hindi sigurado sa karatula? Itanong sa driver “Dadaan po ba kayo sa {s}?” bago sumakay.",
    free: "LIBRE",
    connectFirst: "Sumakay ng {v} papunta sa {s} (mga {d}).",
    connectLast: "Bumaba, tapos sumakay ng {v} papunta sa {d2} (mga {d}).",
    connectMid: "Sumakay ng {v} papunta sa {s} (mga {d}) para sa susunod na sakay.",
    connectWhereFirst: "Pinakamalapit na sakayan ng {v} o sa kanto ng kalye ninyo.",
    connectWhereLast: "Kadalasang may nakaabang na {v} malapit sa {s}. Sabihin sa driver ang eksaktong address.",
    connectWhereMid: "Kadalasang may nakaabang na {v} malapit sa {s}.",
    connectTip: "Walang {v}? Mag-book ng motorcycle taxi (Angkas, JoyRide, Move It), mga {mc}.",
    connectFare: "{V}: itanong muna",
    tricycle: "tricycle",
    nearStart: "Pumunta sa {s}, mga {d} mula sa pinanggalingan mo.",
    walkNoTrikeFirst: "Maglakad nang mga {d} papunta sa {s} (mga {min} min). Walang tricycle sa lugar na ito.",
    walkNoTrikeLast: "Bumaba at maglakad nang mga {d} papunta sa {d2} (mga {min} min). Walang tricycle sa lugar na ito.",
    walkNoTrikeMid: "Maglakad nang mga {d} papunta sa {s} (mga {min} min) para sa susunod na sakay. Walang tricycle sa lugar na ito.",
    walkNoTrikeTip: "Nagmamadali? Mag-book ng motorcycle taxi (Angkas, JoyRide, Move It), mga {mc}.",
    todaWhereFirst: "Terminal ng {toda} TODA na malapit sa iyo, o sa kanto ng kalye ninyo. Hindi dumadaan ang tricycle sa highway; sa kanto ka ibababa.",
    todaWhereLast: "Kadalasang nakaabang ang tricycle ng {toda} TODA sa kanto malapit sa {s}. Sabihin sa driver ang eksaktong address.",
    todaWhereMid: "Kadalasang nakaabang ang tricycle ng {toda} TODA sa kanto malapit sa {s}.",
    connectRide: "Hindi diretso? Lumipat dito sa ibang sasakyan.",
    arriveAt: "Nandito ka na sa {d}."
  }
};
const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? v[k] : m)).replace(/\.\./g, ".");
const fmtDist = (m) => (m >= 1000 ? (m / 1000).toFixed(1) + " km" : Math.max(50, Math.round(m / 50) * 50) + " m");
const titleCase = (s) => String(s).toLowerCase().replace(/(^|[\s/(-])([a-zñ])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bQc\b/g, "QC").replace(/\bUp\b/g, "UP").replace(/\bSm\b/g, "SM").replace(/\bTm\b/g, "TM").replace(/\bVgc\b/g, "VGC").replace(/\bFti\b/g, "FTI").replace(/\bBgc\b/g, "BGC").replace(/\bIbp\b/g, "IBP").replace(/\bMrt\b/g, "MRT").replace(/\bEdsa\b/g, "EDSA").replace(/\bPitx\b/g, "PITX");

function endsFor(r, dir) { return dir === 0 ? [r.ends[0], r.ends[1]] : [r.ends[1], r.ends[0]]; }
const isTrain = (r) => r.family === "train";
const L = (o, lang) => (o && typeof o === "object" ? o[lang] || o.en : o || "");

// All routes of the same kind that also go from leg.from to leg.to (more signboards to look for).
function sameStretch(net, leg) {
  const fam = leg.route.family;
  const out = [];
  for (const r of net.routes) {
    if (r.family !== fam || isTrain(r) || r.type === "carousel") continue;
    if (fam === "bus" && (r.type === "qcity_bus") !== (leg.route.type === "qcity_bus")) continue;
    if ((leg.from.virtual || leg.to.virtual) && !FLAG_DOWN.has(r.type)) continue;
    const idxOf = (pt, isFrom) => {
      if (!pt.virtual) return r.stops.findIndex((s) => s.p.key === pt.key);
      const a = r.stops.findIndex((s) => s.p.key === pt.seg[0]), b = r.stops.findIndex((s) => s.p.key === pt.seg[1]);
      if (a < 0 || b < 0 || Math.abs(a - b) !== 1) return -1;
      // going toward the higher index: board at the lower stop of the segment, get off at the higher one
      const up = leg.dir === 0 ? b > a : b < a;
      return isFrom ? (up ? Math.min(a, b) : Math.max(a, b)) : (up ? Math.max(a, b) : Math.min(a, b));
    };
    const i = idxOf(leg.from, true), j = idxOf(leg.to, false);
    if (i < 0 || j < 0) continue;
    const l = makeLeg(r, i, j);
    if (l && l.dir !== undefined) { l.from = leg.from; l.to = leg.to; out.push(l); }
  }
  // the main route first, so its signboard and destination lead
  return [leg, ...out.filter((l) => l.route !== leg.route)];
}

// Signboard text in the direction of travel. Routes that start at the same place are grouped:
// "NOVALICHES – BALINTAWAK / BLUMENTRITT", and going back: "BALINTAWAK / BLUMENTRITT – NOVALICHES".
export function signsFor(net, leg, lang = "en") {
  const r = leg.route;
  if (r.type === "carousel") return { signs: [`EDSA CAROUSEL – ${endsFor(r, leg.dir)[1]}`], via: "EDSA Busway", routes: [r] };
  if (isTrain(r)) return { signs: [`${r.code}: ${L(r.dirLabel[leg.dir], lang)}`], via: "", routes: [r] };
  const legs = sameStretch(net, leg);
  const pairs = legs.map((l) => endsFor(l.route, l.dir));
  const signs = groupSigns(pairs);
  const via = unique(legs.flatMap((l) => String(l.route.via || "").split("/").map((s) => s.trim()).filter(Boolean))).join(" / ");
  return { signs, via, routes: legs.map((l) => l.route), legs };
}

export function groupSigns(pairs) {
  // Group around the main route (the first pair): routes that start where it starts share one signboard
  // ("NOVALICHES – BALINTAWAK / BLUMENTRITT"); going the other way they share the end
  // ("BALINTAWAK / BLUMENTRITT – NOVALICHES").
  if (!pairs.length) return [];
  const [A, B] = pairs[0];
  const byFirst = pairs.filter((p) => p[0] === A).length, byLast = pairs.filter((p) => p[1] === B).length;
  const pos = byLast > byFirst ? 1 : 0;
  const groups = new Map();
  for (const p of pairs) {
    const k = p[pos], other = p[1 - pos];
    if (!groups.has(k)) groups.set(k, new Set());
    groups.get(k).add(other);
  }
  return [...groups].map(([k, set]) => {
    const others = [...set].sort().join(" / ");
    return pos === 0 ? `${k} – ${others}` : `${others} – ${k}`;
  });
}
function unique(list) { return [...new Set(list)]; }

// Exactly where to wait for this ride.
export function platform(net, leg, lang = "en", toName = "") {
  const w = W[lang].wait, r = leg.route, s = leg.from.name;
  const to = toName || titleCase(endsFor(r, leg.dir)[1]);
  if (leg.from.virtual && leg.from.here) return fill(w.roadsideHere, { road: leg.from.road || (lang === "tl" ? "kalsada" : "the road"), to });
  if (leg.from.virtual) return leg.from.road ? fill(w.roadside, { road: leg.from.road, to }) : fill(w.roadsideNoRoad, { to });
  if (r.type === "carousel") return fill(w.carousel, { s, dir: L(r.dirLabel[leg.dir], lang) });
  if (isTrain(r)) return fill(w.train, { s, dir: L(r.dirLabel[leg.dir], lang) });
  if (r.type === "uv_express") {
    const t = r.terminal && r.terminal[leg.from.key];
    return t ? L(t, lang) + (lang === "tl" ? ". Umaalis ang van kapag puno na." : ". Vans leave when full.") : fill(w.uv, { s });
  }
  if (r.type === "qcity_bus") return fill(w.qcity, { s, to });
  const firstIdx = leg.dir === 0 ? 0 : r.stops.length - 1;
  if (leg.i === firstIdx && r.family === "jeep") return fill(w.terminal, { s });
  const road = leg.from.road;
  if (r.type === "bus") return road ? fill(w.bus, { s, road, to }) : fill(w.streetNoRoad, { s, to });
  return road ? fill(w.street, { s, road, to }) : fill(w.streetNoRoad, { s, to });
}

function getOffText(leg, lang) {
  const t = W[lang], r = leg.route, s = leg.to.name;
  if (leg.to.virtual) return fill(t.getOffRoadside, { road: leg.to.road || (lang === "tl" ? "main road" : "the main road") });
  if (r.type === "carousel") return fill(t.getOffCarousel, { s });
  if (isTrain(r)) return fill(t.getOffTrain, { s });
  if (r.family === "bus") return fill(t.getOffBus, { s });
  return fill(t.getOff, { s });
}

// One ride step, fully filled from route data.
export function rideStep(net, leg, lang = "en") {
  const t = W[lang], r = leg.route;
  const { signs, via, routes } = signsFor(net, leg, lang);
  // "going to Balintawak / Blumentritt" when several routes share the stretch
  const to = isTrain(r) || r.type === "carousel" ? titleCase(endsFor(r, leg.dir)[1]) : titleCase(signs[0].split(" – ").pop());
  const mode = isTrain(r) ? r.type : r.type;
  const textKey = isTrain(r) ? "train" : r.type;
  const text = fill(t.ride[textKey], { to, code: r.code, dir: r.dirLabel ? L(r.dirLabel[leg.dir], lang) : "" });
  const fare = legFare(leg);
  const notes = routes.map((x) => L(x.note, lang)).filter(Boolean);
  const check = routes.some((x) => x.signCheck);
  return {
    kind: "ride", mode, text,
    where: platform(net, leg, lang, isTrain(r) || r.type === "carousel" ? "" : to),
    sign: signs.join(" | "), signs, via,
    routeCode: unique(routes.map((x) => x.code)).join(", "),
    getOff: getOffText(leg, lang),
    fare: pesoRange(fare, lang),
    tip: [check ? fill(t.signAsk, { s: leg.to.name.split("(")[0].trim() }) : "", ...notes].filter(Boolean).join(" "),
    routeIds: routes.map((x) => x.id), from: leg.from.key, to: leg.to.key,
    fromPt: { lat: leg.from.lat, lng: leg.from.lng }, toPt: { lat: leg.to.lat, lng: leg.to.lng },
    verified: true, signCheck: check
  };
}

// Motorcycle-taxi price for a short connecting trip (same formula as the Fares screen)
function mcPrice(m) {
  const km = Math.max(1, (m / 1000) * ROAD);
  const v = 50 + Math.max(0, Math.min(km, 7) - 2) * 10 + Math.max(0, km - 7) * 15;
  return `₱${Math.round(v * 0.95)}–₱${Math.round(v * 1.15)}`;
}

// A connecting tricycle / motorcycle-taxi step for the part no route covers.
export function connectStep({ first, mid, stopName, placeName, m, lang = "en", a, b }) {
  const t = W[lang];
  if (a && b && !trikeOk(a, b)) {
    // No tricycles in this area: walk
    const key = first ? "First" : mid ? "Mid" : "Last";
    return {
      kind: "walk", mode: "walk", connect: true,
      text: fill(t["walkNoTrike" + key], { s: stopName, d2: placeName, d: fmtDist(m), min: Math.max(2, Math.round(walkMin(m))) }),
      tip: m > 600 ? fill(t.walkNoTrikeTip, { mc: mcPrice(m) }) : ""
    };
  }
  const mode = "tricycle";
  const v = t[mode], V = v.charAt(0).toUpperCase() + v.slice(1);
  const key = first ? "First" : mid ? "Mid" : "Last";
  // Name the TODA that serves this area (the start for the first ride, the destination for the last)
  const toda = (first ? todaAt(a) || todaAt(b) : todaAt(b) || todaAt(a)) || null;
  return {
    kind: "ride", mode, connect: true, toda: toda ? toda.name : "",
    text: fill(t["connect" + key], { v, s: stopName, d2: placeName, d: fmtDist(m) }),
    where: toda ? fill(t["todaWhere" + key], { toda: toda.name, s: stopName }) : fill(t["connectWhere" + key], { v, V, s: stopName }),
    getOff: first || mid ? stopName : placeName,
    fare: fill(t.connectFare, { V }),
    tip: fill(t.connectTip, { v, mc: mcPrice(m) })
  };
}

// The safest public ride from point p (where a ride dropped you) to the destination D, if one exists:
// train, EDSA Carousel, bus, then jeep. A tricycle is used only when none of these goes there.
export function connectingRide(net, p, D, families = ["train", "bus", "jeep"]) {
  let best = null;
  for (const r of net.routes) {
    if (!families.includes(r.family)) continue;
    const a = nearStops(r, p, 3, 500, "board"), b = nearStops(r, D, 5, 800, "alight");
    for (const x of a) for (const y of b) {
      const leg = legWith(r, x, y);
      if (!leg || leg.km < 0.8 || dist(leg.to, D) > dist(p, D) - 300) continue;
      const cost = leg.minutes + walkMin(x.d + y.d) + (SAFETY[r.type] ?? 4);
      if (leg.from.virtual) leg.from = { ...leg.from, here: true };
      if (!best || cost < best.cost) best = { cost, leg, walkIn: x.d, walkOut: y.d };
    }
  }
  return best;
}

// A whole option written from route data (used when the AI is missing, busy, or skipped a category).
export function optionFromCandidate(net, c, { lang = "en", originText = "", destText = "", category = "commute" } = {}) {
  const t = W[lang];
  const steps = [{ kind: "start", mode: "", text: fill(t.start, { o: shortName(originText) }) }];
  c.legs.forEach((leg, n) => {
    const w = c.walks[n];
    if (n === 0 && w > WALK_OK) steps.push(connectStep({ first: true, stopName: leg.from.name, m: w, lang, a: c.O, b: leg.from }));
    else if (w > 60) steps.push({ kind: n === 0 ? "walk" : "transfer", mode: "walk", text: fill(n === 0 ? t.walkTo : t.walkXfer, { d: fmtDist(w), s: leg.from.name }) });
    else if (n > 0) steps.push({ kind: "transfer", mode: "", text: lang === "tl" ? `Lumipat sa ${leg.from.name}.` : `Transfer at ${leg.from.name}.` });
    steps.push(rideStep(net, leg, lang));
  });
  const last = c.walks[c.walks.length - 1];
  const destName = shortName(destText);
  if (last > WALK_OK) {
    // closeGaps() adds the connecting jeep/bus, or a tricycle when no route goes there
    steps.push({ kind: "arrive", mode: "walk", text: fill(t.arrive, { d: fmtDist(last) }) });
  } else steps.push({ kind: "arrive", mode: last > 60 ? "walk" : "", text: last > 60 ? fill(t.arrive, { d: fmtDist(last) }) : t.arriveHere });
  const modes = unique(c.legs.map((l) => l.route.type));
  return {
    category, title: titleFor(c, lang), tag: "", modes,
    duration: minutesRange(c.minutes, lang), fare: pesoRange(c.fare, lang),
    steps, why: "", check: "", source: "data"
  };
}

function titleFor(c, lang) {
  const names = c.legs.map((l) => {
    const r = l.route;
    if (r.type === "carousel") return "EDSA Carousel";
    if (isTrain(r)) return r.code;
    if (r.type === "qcity_bus") return `Q City Bus ${r.code.replace("Route ", "")}`;
    if (r.type === "bus") return `${lang === "tl" ? "Bus" : "Bus"} ${r.code.replace(/^Routes? /, "")}`;
    if (r.type === "uv_express") return "UV Express";
    return (r.type === "modern_jeepney" ? (lang === "tl" ? "Modern jeep" : "Modern jeep") : "Jeep") + " " + titleCase(endsFor(r, l.dir).join(" – "));
  });
  return names.join(" → ");
}
const shortName = (s) => String(s || "").split(",").slice(0, 2).join(",").trim() || "your destination";

// Short text the AI reads: the real routes Komute found for this trip.
export function describeForPrompt(net, found, lang = "en") {
  const lines = [];
  for (const [cat, list] of Object.entries(found.categories)) {
    if (!list.length) { lines.push(`${cat}: (no route in Komute data)`); continue; }
    list.forEach((c, n) => {
      const legs = c.legs.map((leg) => {
        const s = signsFor(net, leg, "en");
        return `[routeId ${s.routes.map((r) => r.id).join(",")} | ${leg.route.type} ${leg.route.code} | sign: ${s.signs.join(" OR ")} | via ${s.via || "-"} | fromStop: "${leg.from.name}" | toStop: "${leg.to.name}" | wait: ${platform(net, leg, "en")} | ~${leg.km.toFixed(1)} km, ${pesoRange(legFare(leg))}]`;
      });
      lines.push(`${cat} #${n + 1} (~${Math.round(c.minutes)} min, walk ${Math.round(c.walks[0])} m to board, ${Math.round(c.walks[c.walks.length - 1])} m at the end): ${legs.join(" THEN ")}`);
    });
  }
  return lines.join("\n");
}

// ---------- Checking and fixing AI steps ----------
const STOP = new Set(["ave", "avenue", "st", "street", "rd", "road", "cor", "corner", "the", "of", "near", "station", "stop", "terminal", "and", "sa", "ng", "at", "in", "qc", "quezon", "city", "hwy", "highway", "blvd", "boulevard", "side", "front", "loading", "area", "jeepney", "jeep", "bus", "go", "to", "papuntang"]);
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const tokens = (s) => norm(s).split(" ").filter((w) => w.length > 1 && !STOP.has(w));

function matchPoint(net, text, candidates) {
  const t = new Set(tokens(text));
  if (!t.size) return null;
  let best = null;
  for (const p of candidates || Object.values(net.points)) {
    if (p.out) continue;
    const pt = tokens(p.name);
    if (!pt.length) continue;
    const hit = pt.filter((w) => t.has(w)).length;
    // short names like "Litex" should match "Litex (Commonwealth Ave. cor. IBP Rd.)"
    const sc = Math.max(hit / pt.length, hit / Math.min(pt.length, t.size) * 0.8) + (hit >= 2 ? 0.2 : 0);
    if (hit && (!best || sc > best.sc || (sc === best.sc && pt.length < best.n))) best = { p, sc, n: pt.length };
  }
  return best && best.sc >= 0.5 ? best.p : null;
}

const ROAD_WORDS = /\b(HIGHWAY|HWY|AVENUE|AVE|ROAD|RD|BOULEVARD|BLVD|STREET|ST)\b\.?/i;
const KNOWN_ROAD_TERMINALS = /QUEZON AVE|MINDANAO AVE|NORTH AVE|QUIRINO HIGHWAY|RIZAL AVE|TANDANG SORA|PANAY AVE|VISAYAS AVE/i;

function routesBySign(net, sign) {
  const parts = String(sign || "").toUpperCase().split(/\s*(?:–|—|-|→|TO|\|)\s*/).map((s) => norm(s)).filter(Boolean);
  if (parts.length < 2) return [];
  const hit = [];
  for (const r of net.routes) {
    const e = r.ends.map((x) => norm(x));
    const has = (p) => e.some((x) => x === p || x.split(" ").some((w) => w.length > 3 && p.includes(w)) || p.split(" ").some((w) => w.length > 3 && x.includes(w)));
    if (has(parts[0]) && has(parts[parts.length - 1])) hit.push(r);
  }
  return hit;
}

// Fix one AI ride step. ctx = { lang, legs: engine legs for this category } (used to line up rides by order).
export function fixRideStep(net, step, ctx) {
  const mode = String(step.mode || "").toLowerCase();
  const fam = FAMILY[mode] || (/jeep/.test(mode) ? "jeep" : /bus|carousel/.test(mode) ? "bus" : /uv/.test(mode) ? "uv" : /mrt|lrt|train/.test(mode) ? "train" : "");
  if (!fam || fam === "other") return step;
  const ids = String(step.routeId || step.routeIds || "").split(/[,\s]+/).filter((x) => net.byId[x]);
  let routes = ids.map((x) => net.byId[x]);
  if (!routes.length) routes = routesBySign(net, step.sign).filter((r) => r.family === fam);
  if (!routes.length && fam === "train") routes = net.routes.filter((r) => r.type === mode);

  const fromText = [step.fromStop, step.where].filter(Boolean).join(" ");
  const toText = [step.toStop, step.getOff].filter(Boolean).join(" ");
  const tryRoutes = routes.length ? routes : net.routes.filter((r) => r.family === fam);
  let leg = null;
  for (const r of tryRoutes) {
    const pts = r.stops.map((s) => s.p);
    const a = matchPoint(net, fromText, pts), b = matchPoint(net, toText, pts);
    if (!a || !b || a === b) continue;
    const l = makeLeg(r, r.stops.findIndex((s) => s.p === a), r.stops.findIndex((s) => s.p === b));
    if (l) { leg = l; break; }
  }
  // Line up with the engine's leg of the same kind
  if (!leg && ctx && ctx.legs) {
    const same = ctx.legs.filter((l) => l.route.family === fam);
    leg = same.find((l) => routes.includes(l.route)) || (routes.length ? null : same[ctx.rideIndex] || same[0]) || null;
  }
  if (leg) {
    const fixed = rideStep(net, leg, ctx.lang);
    // If the AI's signboard was wrong, its sentence usually repeats the mistake ("heading towards Quirino Highway"): use ours.
    const aiSign = norm(step.sign).replace(/ /g, "");
    const signOk = !aiSign || fixed.signs.some((x) => norm(x).replace(/ /g, "").includes(aiSign) || aiSign.includes(norm(x).replace(/ /g, "")));
    return { ...step, text: signOk ? step.text : fixed.text, mode: step.mode || fixed.mode, sign: fixed.sign, signs: fixed.signs, via: fixed.via, routeCode: fixed.routeCode,
      where: fixed.where, getOff: fixed.getOff, fare: step.fare || fixed.fare,
      tip: [step.tip, fixed.signCheck ? fixed.tip : ""].filter(Boolean).join(" "),
      routeIds: fixed.routeIds, from: fixed.from, to: fixed.to, fromPt: fixed.fromPt, toPt: fixed.toPt, verified: true, signCheck: fixed.signCheck };
  }
  // Could not confirm. Flag signboards that name a road instead of a place (e.g. "QUIRINO HIGHWAY - NOVALICHES").
  const sign = String(step.sign || "");
  const endsAreRoads = sign.split(/\s*[–—-]\s*/).some((p) => ROAD_WORDS.test(p) && !KNOWN_ROAD_TERMINALS.test(p));
  return { ...step, signs: sign ? [sign] : [], verified: false, signCheck: true, badSign: endsAreRoads || undefined };
}

// The AI (or a fixed step) may drop you far from your place. Close the gap:
// 1) another jeep or bus from where you got off, else 2) a tricycle / motorcycle taxi. Same for reaching the first ride.
export function closeGaps(net, steps, { origin, destination, lang = "en", originText = "", destText = "", families = ["train", "bus", "jeep"] }) {
  if (!origin || !destination) return steps;
  const t = W[lang];
  const O = { lat: origin.latitude, lng: origin.longitude }, D = { lat: destination.latitude, lng: destination.longitude };
  const out = steps.slice();
  const rideIdx = out.map((s, i) => (s.kind === "ride" ? i : -1)).filter((i) => i >= 0);
  if (!rideIdx.length) return out;
  const destName = shortName(destText);

  // Last mile
  const pt = (key, p) => (key && net.points[key]) || (p && p.lat != null ? { ...p, name: "", key } : null);
  // If the first ride's route passes right by the start (or the last ride passes right by the destination),
  // board / get off there instead of at a stop farther away.
  const move = (step, end) => {
    for (const id of step.routeIds || []) {
      const r = net.byId[id];
      if (!r) continue;
      const fixedIdx = r.stops.findIndex((x) => x.p.key === (end === "board" ? step.to : step.from));
      if (fixedIdx < 0) continue;
      for (const e of nearStops(r, end === "board" ? O : D, 6, WALK_OK, end === "board" ? "board" : "alight")) {
        const leg = end === "board" ? legWith(r, e, { idx: fixedIdx }) : legWith(r, { idx: fixedIdx }, e);
        if (leg) {
          const f = rideStep(net, leg, lang);
          return { ...step, where: f.where, getOff: f.getOff, sign: f.sign, signs: f.signs, via: f.via, from: f.from, to: f.to, fromPt: f.fromPt, toPt: f.toPt };
        }
      }
    }
    return step;
  };
  // Jeepneys and buses stop anywhere along their road: if the route passes right where you are, wait there (no walk)
  const flagDown = (step) => (step.routeIds || []).some((id) => net.byId[id] && FLAG_DOWN.has(net.byId[id].type));
  {
    const i0 = out.findIndex((s) => s.kind === "ride" && !s.connect);
    if (i0 >= 0) {
      const p0 = pt(out[i0].from, out[i0].fromPt);
      if (!p0 || dist(O, p0) > WALK_OK || (flagDown(out[i0]) && dist(O, p0) > 40)) out[i0] = move(out[i0], "board");
    }
    const rev = out.map((s, i) => i).filter((i) => out[i].kind === "ride" && !out[i].connect);
    const i1 = rev[rev.length - 1];
    if (i1 >= 0) {
      const p1 = pt(out[i1].to, out[i1].toPt);
      if (!p1 || dist(p1, D) > WALK_OK || (flagDown(out[i1]) && dist(p1, D) > 40)) out[i1] = move(out[i1], "alight");
    }
  }
  // The plan has a tricycle (or long walk) to reach a ride that actually passes right by the start: remove it
  const firstMain = out.find((s) => s.kind === "ride" && !s.connect);
  const fp = firstMain && pt(firstMain.from, firstMain.fromPt);
  if (fp && dist(O, fp) <= WALK_OK) {
    const at = out.indexOf(firstMain);
    const roadside = flagDown(firstMain) && dist(O, fp) <= ROADSIDE_M;
    for (let i = at - 1; i > 0; i--) {
      const st = out[i], isWalk = st.kind === "walk" || (st.mode === "walk" && st.kind !== "ride");
      if (st.connect || (isWalk && (roadside || walkMeters(st.text) > WALK_OK))) out.splice(i, 1);
    }
  }
  // ...and the same at the end
  const lastMain = [...out].reverse().find((s) => s.kind === "ride" && !s.connect);
  const lp = lastMain && pt(lastMain.to, lastMain.toPt);
  if (lp && dist(lp, D) <= WALK_OK) {
    const at = out.indexOf(lastMain);
    const roadside = flagDown(lastMain) && dist(lp, D) <= ROADSIDE_M;
    for (let i = out.length - 1; i > at; i--) {
      const st = out[i], isWalk = st.kind === "walk" || (st.mode === "walk" && st.kind !== "ride" && st.kind !== "arrive");
      if (st.connect || (roadside && isWalk)) out.splice(i, 1);
      else if (roadside && st.kind === "arrive") out[i] = { ...st, mode: "", text: fill(t.arriveAt, { d: destName }) };
    }
  }
  const rides2 = out.map((s, i) => (s.kind === "ride" ? i : -1)).filter((i) => i >= 0);
  const li = rides2[rides2.length - 1], last = out[li];
  const drop = pt(last.to, last.toPt); // a listed stop, or the roadside point where you get off
  if (drop && !drop.name) drop.name = last.getOff ? String(last.getOff).split(".")[0] : (lang === "tl" ? "kung saan ka bumaba" : "where you get off");
  if (drop && !last.connect && dist(drop, D) > WALK_OK) {
    const add = [];
    // A short gap (under ~800 m) is one tricycle ride; a longer one gets the safest public ride that goes there
    const more = families.length && (dist(drop, D) > 800 || !trikeOk(drop, D)) ? connectingRide(net, drop, D, families) : null;
    if (more) {
      if (more.walkIn > 60) add.push({ kind: "transfer", mode: "walk", text: fill(t.walkXfer, { d: fmtDist(more.walkIn), s: more.leg.from.name }) });
      else add.push({ kind: "transfer", mode: "", text: t.connectRide });
      add.push(rideStep(net, more.leg, lang));
      if (more.walkOut > WALK_OK) add.push(connectStep({ first: false, stopName: more.leg.to.name, placeName: destName, m: more.walkOut, lang, a: more.leg.to, b: D }));
      add.push({ kind: "arrive", mode: "", text: more.walkOut > 60 && more.walkOut <= WALK_OK ? fill(t.arrive, { d: fmtDist(more.walkOut) }) : fill(t.arriveAt, { d: destName }) });
    } else {
      add.push(connectStep({ first: false, stopName: drop.name, placeName: destName, m: dist(drop, D), lang, a: drop, b: D }));
      add.push({ kind: "arrive", mode: "", text: fill(t.arriveAt, { d: destName }) });
    }
    // replace whatever the plan had after the last ride (usually "walk to your destination")
    out.splice(li + 1, out.length - li - 1, ...add);
  }

  // First mile
  const fi = out.findIndex((s) => s.kind === "ride"), firstRide = out[fi];
  const board = pt(firstRide.from, firstRide.fromPt);
  if (board && !board.name) board.name = lang === "tl" ? "sakayan sa main road" : "the main road";
  if (board && !firstRide.connect && dist(O, board) > WALK_OK) {
    let k = fi - 1;
    while (k > 0 && out[k].kind === "walk") k--; // drop the long walk the plan suggested
    out.splice(k + 1, fi - k - 1, connectStep({ first: true, stopName: board.name, m: dist(O, board), lang, a: O, b: board }));
  }
  // Any other long walk the plan still has (for example between two rides): a tricycle instead
  for (let i = 0; i < out.length; i++) {
    const st = out[i];
    if (st.kind === "ride" || st.kind === "start" || st.connect) continue;
    const m = walkMeters(st.text);
    if (!m || m <= WALK_OK || !/walk|lakad|maglakad/i.test(st.text)) continue;
    const next = out.slice(i + 1).find((x) => x.kind === "ride");
    const target = next && next.from && net.points[next.from] ? net.points[next.from].name : null;
    const isLast = !next || st.kind === "arrive";
    const prev = out.slice(0, i).reverse().find((x) => x.kind === "ride");
    const from = prev && prev.to && net.points[prev.to] ? net.points[prev.to] : O;
    const to = next && next.from && net.points[next.from] ? net.points[next.from] : D;
    const c = connectStep({ first: !prev, mid: !isLast, stopName: target || (lang === "tl" ? "susunod na sakayan" : "the next ride"), placeName: destName, m, lang, a: from, b: to });
    if (isLast) out.splice(i, 1, c, { kind: "arrive", mode: "", text: fill(t.arriveAt, { d: destName }) });
    else out.splice(i, 1, c);
  }
  return out;
}

// "Walk about 850 m ..." -> 850 ; "1.2 km" -> 1200
function walkMeters(text) {
  const m = String(text || "").match(/(\d+(?:[.,]\d+)?)\s*(km|kilometers?|m|meters?|metro)\b/i);
  if (!m) return 0;
  const v = parseFloat(m[1].replace(",", "."));
  return /^k/i.test(m[2]) ? v * 1000 : v;
}
