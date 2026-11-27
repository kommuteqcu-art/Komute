// Live navigation (like Google Maps / Apple Maps): follows your GPS, turns the map the way you face,
// shows the next turn with a big arrow, and a compass arrow that points where to go next.
(function (K) {
  const $ = (id) => document.getElementById(id);
  let km, route, profile, dest, coords, cum, steps, lastIdx = 0, follow = true, unGps, unHead, wake = null;
  let offCount = 0, lastReroute = 0, spoken = {}, voice = K.store.get("navVoice", false), active = false, lastFix = null;

  function prepare(r) {
    route = r;
    coords = r.geometry.coordinates;
    cum = K.geo.cumulative(coords);
    let from = 0;
    steps = r.legs.flatMap((l) => l.steps).map((s) => {
      const near = K.geo.nearest(coords, K.geo.pt(s.maneuver.location), from, Math.min(coords.length, from + 400));
      from = Math.max(from, near.i);
      return { s, idx: near.i };
    });
    lastIdx = 0; spoken = {};
  }

  async function start(r, prof, destination) {
    km = K.results.kmap();
    if (!km) return;
    profile = prof; dest = destination;
    prepare(r);
    km.setRoutes([r], 0, { labels: false }); // only the chosen path, no time labels
    active = true; follow = true;
    document.body.classList.add("k-navigating");
    $("navUI").classList.remove("d-none");
    $("btnNavVoice").setAttribute("aria-pressed", String(voice));
    setTimeout(() => km.resize(), 50);
    K.compass.start(); // asks for permission on iPhone (this runs from a tap)
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch { wake = null; }
    km.map.on("dragstart", onDrag);
    unHead = K.compass.on(() => { if (lastFix) update(lastFix, true); });
    unGps = K.gps.watch((fix, err) => {
      if (err) { $("navText").textContent = K.t("nav.noGps"); return; }
      lastFix = fix; update(fix);
    });
    if (!K.gps.last) { $("navText").textContent = K.t("nav.findingYou"); $("navDist").textContent = ""; }
  }

  function stop() {
    if (!active) return;
    active = false;
    document.body.classList.remove("k-navigating");
    $("navUI").classList.add("d-none");
    if (unGps) unGps(); if (unHead) unHead();
    if (km) { km.map.off("dragstart", onDrag); km.setMe(null); km.map.easeTo({ pitch: 0, bearing: 0, duration: 400 }); setTimeout(() => km.resize(), 50); }
    try { if (wake) wake.release(); } catch { /* ignore */ }
    wake = null;
    if (window.speechSynthesis) speechSynthesis.cancel();
    K.routeView.setMode(K.routeView.mode()); // show the normal route view again
  }

  function onDrag(e) { if (e.originalEvent) { follow = false; $("btnNavRecenter").classList.remove("d-none"); } }

  function speak(text) {
    if (!voice || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    const want = K.lang === "tl" ? /^(fil|tl)/i : /^en/i;
    const v = speechSynthesis.getVoices().find((x) => want.test(x.lang)) || speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
    if (v) { u.voice = v; u.lang = v.lang; }
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }

  async function reroute(p) {
    if (Date.now() - lastReroute < 15000) return;
    lastReroute = Date.now();
    $("navOff").classList.remove("d-none");
    try {
      const r = await K.api.roadRoutes(profile, p, dest, false);
      prepare(r[0]);
      km.setRoutes([r[0]], 0, { labels: false });
    } catch { /* keep the old route */ }
    $("navOff").classList.add("d-none");
  }

  function update(fix, headingOnly) {
    if (!active) return;
    const p = fix.p, heading = K.compass.heading ?? (fix.speed > 0.8 ? fix.course : null);
    km.setMe(p, fix.acc, heading ?? undefined);
    // where am I on the route?
    let near = K.geo.nearest(coords, p, lastIdx - 30, lastIdx + 300);
    if (near.d > 60) near = K.geo.nearest(coords, p);
    if (!headingOnly) {
      if (near.d > (profile === "walk" ? 45 : 70) && (fix.acc || 0) < 60) { if (++offCount >= 2) reroute(p); } else offCount = 0;
      lastIdx = Math.max(0, near.i);
    }
    const i = lastIdx;
    const total = cum[cum.length - 1], remain = Math.max(0, total - cum[i]);
    const nextIdx = steps.findIndex((x) => x.idx > i + 1);
    const next = steps[nextIdx >= 0 ? nextIdx : steps.length - 1];
    const toNext = Math.max(0, cum[next.idx] - cum[i]);
    const arrived = remain < 25 || K.geo.dist(p, dest) < 25;

    // Banner
    $("navArrow").className = "bi " + (arrived ? "bi-flag-fill" : K.routeView.turnIcon(next.s));
    $("navDist").textContent = arrived ? "" : K.fmt.dist(toNext);
    $("navText").textContent = arrived ? K.t("nav.arrived") : K.routeView.say(next.s);
    const then = steps[(nextIdx >= 0 ? nextIdx : steps.length - 1) + 1];
    $("navThen").textContent = then && !arrived ? K.t("nav.then", { x: K.routeView.say(then.s) }) : "";
    const left = route.duration * (remain / Math.max(1, total));
    $("navRemain").textContent = arrived ? K.t("nav.arrivedShort") : `${K.fmt.mins(left)} · ${K.fmt.dist(remain)}`;
    $("navEta").textContent = arrived ? "" : K.t("nav.eta", { t: K.fmt.clock(new Date(Date.now() + left * 1000)) });

    // Voice prompts at about 120 m and 30 m before each turn
    if (!headingOnly && !arrived) {
      for (const at of [120, 30]) {
        const key = next.idx + ":" + at;
        if (toNext < at && !spoken[key]) { spoken[key] = 1; speak((at > 50 ? K.t("nav.inDist", { d: K.fmt.dist(toNext) }) + " " : "") + K.routeView.say(next.s)); }
      }
    }
    if (arrived && !spoken.arrived) { spoken.arrived = 1; speak(K.t("nav.arrived")); }

    // A point a little ahead on the route: where the compass arrow points.
    let j = i; while (j < coords.length - 1 && cum[j] - cum[i] < 25) j++;
    const target = arrived ? dest : K.geo.pt(coords[Math.min(j, next.idx)]);
    const bearingToTarget = K.geo.bearing(p, target);

    // Camera: heading-up like Google Maps
    if (follow) {
      const bearing = heading ?? K.geo.bearing(K.geo.pt(coords[i]), K.geo.pt(coords[Math.min(coords.length - 1, i + 3)]));
      km.map.easeTo({ center: K.geo.ll(p), bearing, pitch: 55, zoom: profile === "walk" ? 18 : 17, duration: headingOnly ? 250 : 800,
        padding: { top: $("navTop").offsetHeight + 20, bottom: $("navBottom").offsetHeight + 120, left: 0, right: 0 } });
    }
    // The guide arrow shows the direction relative to the screen (the map turns with you).
    $("navGuide").style.transform = `rotate(${bearingToTarget - km.map.getBearing()}deg)`;
    $("navGuideText").textContent = heading === null || heading === undefined ? K.t("nav.compassOff") : K.t("nav.followArrow");
  }

  function init() {
    $("btnNavExit").onclick = stop;
    $("btnNavRecenter").onclick = () => { follow = true; $("btnNavRecenter").classList.add("d-none"); if (lastFix) update(lastFix); };
    $("btnNavVoice").onclick = () => {
      voice = !voice; K.store.set("navVoice", voice);
      $("btnNavVoice").setAttribute("aria-pressed", String(voice));
      if (voice) speak(K.t("nav.voiceOn"));
    };
    $("btnNavCompass").onclick = async () => {
      const ok = await K.compass.start();
      if (!ok) $("navGuideText").textContent = K.t("nav.compassDenied");
    };
  }

  K.navigate = { start, stop, init, active: () => active };
})(window.Komute);
