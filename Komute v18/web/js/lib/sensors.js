// Phone sensors: GPS position (K.gps) and compass heading (K.compass).
(function (K) {
  // ---------- GPS ----------
  const gpsListeners = new Set();
  let watchId = null;
  const gps = {
    last: null, // { p: {latitude, longitude}, acc, course, speed, at }
    error: null,
    available: () => "geolocation" in navigator,
    watch(fn) {
      gpsListeners.add(fn);
      if (gps.last) fn(gps.last);
      if (watchId === null && gps.available()) {
        watchId = navigator.geolocation.watchPosition((pos) => {
          const c = pos.coords;
          gps.error = null;
          gps.last = { p: { latitude: c.latitude, longitude: c.longitude }, acc: c.accuracy,
            course: Number.isFinite(c.heading) ? c.heading : null, speed: c.speed || 0, at: Date.now() };
          gpsListeners.forEach((f) => f(gps.last));
        }, (err) => {
          gps.error = err;
          gpsListeners.forEach((f) => f(null, err));
        }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
      }
      return () => gps.unwatch(fn);
    },
    unwatch(fn) {
      gpsListeners.delete(fn);
      if (!gpsListeners.size && watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    },
    once() {
      return new Promise((ok, no) => {
        if (!gps.available()) return no(new Error("unsupported"));
        navigator.geolocation.getCurrentPosition((pos) => ok({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, acc: pos.coords.accuracy }),
          no, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
      });
    }
  };

  // ---------- Compass ----------
  const headListeners = new Set();
  let running = false, current = null, raf = 0;
  const compass = {
    heading: null,
    supported: () => "DeviceOrientationEvent" in window,
    // Must be called from a tap (iPhone asks for permission).
    async start() {
      if (running) return true;
      if (!compass.supported()) return false;
      try {
        if (typeof DeviceOrientationEvent.requestPermission === "function") {
          const r = await DeviceOrientationEvent.requestPermission();
          if (r !== "granted") return false;
        }
      } catch { return false; }
      const evt = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
      window.addEventListener(evt, onOrientation, true);
      compass._evt = evt;
      running = true;
      return true;
    },
    stop() {
      if (!running) return;
      window.removeEventListener(compass._evt, onOrientation, true);
      running = false; current = null; compass.heading = null;
    },
    running: () => running,
    on(fn) { headListeners.add(fn); return () => headListeners.delete(fn); }
  };

  function onOrientation(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === "number") h = e.webkitCompassHeading; // iPhone
    else if ((e.absolute || compass._evt === "deviceorientationabsolute") && e.alpha !== null) h = 360 - e.alpha; // Android
    if (h === null || Number.isNaN(h)) return;
    const screenAngle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    h = (h + screenAngle + 360) % 360;
    // smooth the needle so it does not shake
    if (current === null) current = h;
    else { const diff = ((h - current + 540) % 360) - 180; current = (current + diff * 0.25 + 360) % 360; }
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0;
      compass.heading = current;
      headListeners.forEach((f) => f(current));
    });
  }

  K.gps = gps;
  K.compass = compass;
})(window.Komute);
