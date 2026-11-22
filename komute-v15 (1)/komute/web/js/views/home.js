// Plan screen: choose the starting point (A) and destination (B).
// Each can be typed and searched, set to "my location", picked from saved places / landmarks / recent trips,
// or pinned on the map (drag the map under the center pin, like Grab).
(function (K) {
  const S = K.state;
  const $ = (id) => document.getElementById(id);
  let km = null, pinTarget = null, pinLookup = null, pickTarget = "destination", pickModal, saveModal, saveTarget;

  function init() {
    km = K.maps.create("planMap");
    if (km) {
      km.bindCompass($("planCompass"));
      km.labelStyle($("planStyleBtn"));
      $("planStyleBtn").onclick = () => km.nextStyle($("planStyleBtn"));
      km.map.on("click", (e) => { if (pinTarget) km.map.easeTo({ center: e.lngLat, duration: 400 }); });
      km.map.on("moveend", K.debounce(previewPin, 700));
      km.ready(syncMarkers);
    } else {
      ["btnPin", "btnPinStart", "planStyleBtn", "planCompass"].forEach((id) => $(id) && $(id).classList.add("d-none"));
    }
    pickModal = new bootstrap.Modal($("pickModal"));
    saveModal = new bootstrap.Modal($("saveModal"));

    $("origin").value = S.origin;
    $("origin").addEventListener("input", (e) => {
      S.origin = e.target.value;
      if (S.originPoint && S.originPoint.label !== S.origin) S.originPoint = null;
      $("originSuggestions").innerHTML = "";
      syncMarkers(false); updateFind();
    });
    $("origin").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); search("origin"); } });
    $("destination").addEventListener("input", (e) => {
      S.destination = e.target.value;
      if (S.destinationPoint && S.destinationPoint.label !== S.destination) S.destinationPoint = null;
      $("suggestions").innerHTML = "";
      syncMarkers(false); updateFind();
    });
    $("destination").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); search("destination"); } });

    $("btnClearOrigin").onclick = () => { setText("origin", ""); $("origin").focus(); };
    $("btnClearDest").onclick = () => { setText("destination", ""); $("destination").focus(); };
    $("btnSwapHome").onclick = swap;
    $("btnSearchStart").onclick = () => search("origin");
    $("btnSearch").onclick = () => search("destination");
    $("btnLocate").onclick = locate;
    $("btnPinStart").onclick = () => startPin("origin");
    $("btnPin").onclick = () => startPin("destination");
    $("btnPickStart").onclick = () => openPicker("origin");
    $("btnPickDest").onclick = () => openPicker("destination");
    $("btnStarOrigin").onclick = () => openSave("origin");
    $("btnStarDest").onclick = () => openSave("destination");
    $("btnPinUse").onclick = usePin;
    $("btnPinCancel").onclick = stopPin;
    $("btnSaveConfirm").onclick = confirmSave;
    $("newCommuter").checked = S.newCommuterMode;
    $("newCommuter").onchange = (e) => { S.newCommuterMode = e.target.checked; K.store.set("newCommuter", S.newCommuterMode); };
    $("btnFind").onclick = () => K.app.findRoutes();
    $("btnClearRecent").onclick = () => { K.recent.clear(); renderRecent(); };
    renderQuick();
    renderRecent();
    updateFind();
  }

  // ---------- helpers ----------
  const inputId = (t) => (t === "origin" ? "origin" : "destination");
  const listId = (t) => (t === "origin" ? "originSuggestions" : "suggestions");

  function status(text, isError) {
    const el = $("placeStatus");
    el.textContent = text || "";
    el.classList.toggle("text-danger", !!isError);
  }

  function updateFind() {
    const ready = !!S.destination.trim() && !!S.origin.trim();
    $("btnFind").disabled = !ready;
    $("findHint").textContent = K.t(!S.origin.trim() ? "home.hintNeedStart" : !S.destination.trim() ? "home.hintNeedDest" : "home.hintReady");
    $("btnClearOrigin").classList.toggle("invisible", !S.origin);
    $("btnClearDest").classList.toggle("invisible", !S.destination);
  }

  function syncMarkers(fit = true) { if (km) km.setEndpoints(S.originPoint, S.destinationPoint, { fit }); }
  function refreshFare() { K.fareEstimate.update($("farePreview")); }

  function setText(target, text) {
    if (target === "origin") { S.origin = text; S.originPoint = null; } else { S.destination = text; S.destinationPoint = null; }
    $(inputId(target)).value = text;
    $(listId(target)).innerHTML = "";
    syncMarkers(false); updateFind(); refreshFare();
  }

  // point = { latitude, longitude, label(full address) }
  function setPoint(target, point, label) {
    const text = label || K.fmt.shortLabel(point.label);
    const p = { latitude: point.latitude, longitude: point.longitude, label: text };
    if (target === "origin") { S.origin = text; S.originPoint = p; } else { S.destination = text; S.destinationPoint = p; }
    S.road = null;
    $(inputId(target)).value = text;
    $(listId(target)).innerHTML = "";
    syncMarkers(); updateFind(); refreshFare();
  }

  function swap() {
    [S.origin, S.destination] = [S.destination, S.origin];
    [S.originPoint, S.destinationPoint] = [S.destinationPoint, S.originPoint];
    $("origin").value = S.origin; $("destination").value = S.destination;
    S.road = null;
    syncMarkers(); updateFind(); refreshFare();
  }

  // ---------- search ----------
  async function search(target) {
    const q = (target === "origin" ? S.origin : S.destination).trim();
    if (!q) { status(K.t(target === "origin" ? "home.typeStart" : "home.typeDest")); $(inputId(target)).focus(); return; }
    status(K.t("home.searching"));
    const list = $(listId(target));
    list.innerHTML = `<div class="list-group-item text-muted"><span class="spinner-border spinner-border-sm"></span> ${K.esc(K.t("home.searching"))}</div>`;
    try {
      const results = await K.api.searchPlaces(q, target === "destination" ? S.originPoint : null);
      if (!results.length) { list.innerHTML = ""; status(K.t("home.noMatch"), true); return; }
      status(K.t("home.selectOne"));
      list.innerHTML = results.map((p, i) => `<button type="button" class="list-group-item list-group-item-action k-sugg" data-i="${i}">
        <i class="bi bi-geo-alt"></i><span><b>${K.esc(K.fmt.first(p.label))}</b><small>${K.esc(p.label.split(",").slice(1, 4).join(","))}</small></span></button>`).join("");
      list.querySelectorAll("button").forEach((b) => {
        b.onclick = () => {
          const p = results[Number(b.dataset.i)];
          setPoint(target, { latitude: p.location.latitude, longitude: p.location.longitude, label: p.label });
          status(K.t(target === "origin" ? "home.startSet" : "home.destSet"));
        };
      });
    } catch (e) { list.innerHTML = ""; status(e.message, true); }
  }

  // ---------- my location ----------
  async function locate() {
    if (!K.gps.available()) { status(K.t("home.noGeo"), true); return; }
    status(K.t("home.locating"));
    $("btnLocate").disabled = true;
    try {
      const pos = await K.gps.once();
      const { label, inArea } = await K.api.reverseGeocode(pos.latitude, pos.longitude);
      if (inArea === false) { status(K.t("home.youOutside"), true); return; }
      setPoint("origin", { ...pos, label }, K.t("place.myLocation") + " · " + K.fmt.shortLabel(label));
      status(K.t("home.startIsYou"));
    } catch {
      status(K.t("home.geoDenied"), true);
    } finally { $("btnLocate").disabled = false; }
  }

  // ---------- pin on map (center pin) ----------
  function startPin(target) {
    if (!km) return;
    pinTarget = target;
    pinLookup = null;
    const p = target === "origin" ? S.originPoint : S.destinationPoint;
    if (p) km.map.easeTo({ center: K.geo.ll(p), zoom: Math.max(km.map.getZoom(), 16), duration: 500 });
    else if (km.map.getZoom() < 14) km.map.easeTo({ zoom: 15, duration: 500 });
    $("pinOverlay").className = "k-centerpin " + (target === "origin" ? "is-a" : "is-b");
    $("pinBar").classList.remove("d-none");
    $("pinBarTitle").textContent = K.t(target === "origin" ? "pin.titleStart" : "pin.titleDest");
    $("pinBarText").textContent = K.t("pin.drag");
    $("btnPinStart").setAttribute("aria-pressed", String(target === "origin"));
    $("btnPin").setAttribute("aria-pressed", String(target === "destination"));
    $("planMapWrap").scrollIntoView({ behavior: "smooth", block: "center" });
    previewPin();
  }

  function stopPin() {
    pinTarget = null;
    $("pinOverlay").className = "k-centerpin d-none";
    $("pinBar").classList.add("d-none");
    $("btnPinStart").setAttribute("aria-pressed", "false");
    $("btnPin").setAttribute("aria-pressed", "false");
  }

  async function previewPin() {
    if (!pinTarget || !km) return;
    const c = km.map.getCenter();
    const key = c.lat.toFixed(5) + "," + c.lng.toFixed(5);
    if (!K.maps.inQC({ latitude: c.lat, longitude: c.lng })) { $("pinBarText").textContent = K.t("pin.outside"); pinLookup = { key, inArea: false }; return; }
    $("pinBarText").textContent = K.t("pin.finding");
    const r = await K.api.reverseGeocode(c.lat, c.lng);
    if (!pinTarget) return;
    pinLookup = { key, ...r, lat: c.lat, lng: c.lng };
    $("pinBarText").textContent = r.inArea === false ? K.t("pin.outside") : K.fmt.shortLabel(r.label);
  }

  async function usePin() {
    if (!pinTarget || !km) return;
    const target = pinTarget;
    const c = km.map.getCenter(), key = c.lat.toFixed(5) + "," + c.lng.toFixed(5);
    let r = pinLookup && pinLookup.key === key ? pinLookup : null;
    if (!r) { $("pinBarText").textContent = K.t("pin.finding"); r = await K.api.reverseGeocode(c.lat, c.lng); }
    if (r.inArea === false || !K.maps.inQC({ latitude: c.lat, longitude: c.lng })) { $("pinBarText").textContent = K.t("pin.outside"); return; }
    stopPin();
    setPoint(target, { latitude: c.lat, longitude: c.lng, label: r.label });
    status(K.t(target === "origin" ? "pin.startSet" : "pin.destSet"));
  }

  // ---------- picker (saved places, landmarks, recent) ----------
  function openPicker(target) {
    pickTarget = target;
    $("pickTitle").textContent = K.t(target === "origin" ? "pick.titleStart" : "pick.titleDest");
    const icons = { HOME: "bi-house-fill", SCHOOL: "bi-mortarboard-fill", WORK: "bi-briefcase-fill", OTHER: "bi-star-fill" };
    const row = (attrs, icon, title, sub) => `<button type="button" class="list-group-item list-group-item-action k-pick-row" ${attrs}>
      <span class="k-icon"><i class="bi ${icon}"></i></span><span class="flex-grow-1 text-start"><b class="d-block">${K.esc(title)}</b><small class="text-muted">${K.esc(sub)}</small></span><i class="bi bi-chevron-right text-muted"></i></button>`;
    const places = K.places.all();
    const recentPlaces = [];
    K.recent.trips().forEach((t) => [[t.origin, t.originPoint], [t.destination, t.destinationPoint]].forEach(([n, p]) => {
      if (n && !recentPlaces.some((x) => x.n === n)) recentPlaces.push({ n, p });
    }));
    $("pickBody").innerHTML = `
      <div class="list-group mb-3">
        ${target === "origin" ? row('data-act="me"', "bi-crosshair", K.t("pick.myLocation"), K.t("pick.myLocationSub")) : ""}
        ${km ? row('data-act="pin"', "bi-pin-map-fill", K.t("pick.pin"), K.t("pick.pinSub")) : ""}
      </div>
      <h3 class="k-pick-h">${K.esc(K.t("pick.saved"))}</h3>
      <div class="list-group mb-3">${places.length ? places.map((p, i) => row(`data-saved="${i}"`, icons[p.type] || "bi-star-fill", K.places.label(p), p.address)).join("") : `<p class="text-muted small">${K.esc(K.t("pick.noSaved"))}</p>`}</div>
      ${recentPlaces.length ? `<h3 class="k-pick-h">${K.esc(K.t("pick.recent"))}</h3><div class="list-group mb-3">${recentPlaces.slice(0, 6).map((x, i) => row(`data-recent="${i}"`, "bi-clock-history", K.fmt.first(x.n), x.n)).join("")}</div>` : ""}
      <h3 class="k-pick-h">${K.esc(K.t("pick.landmarks"))}</h3>
      <div class="list-group">${K.data().landmarks.map((l, i) => row(`data-lm="${i}"`, l.icon, l.name, l.area + ", Quezon City")).join("")}</div>`;
    $("pickBody").querySelectorAll("button").forEach((b) => b.onclick = () => {
      pickModal.hide();
      const d = b.dataset;
      if (d.act === "me") return locate();
      if (d.act === "pin") return setTimeout(() => startPin(target), 300);
      if (d.saved !== undefined) return usePlace(target, places[Number(d.saved)]);
      if (d.recent !== undefined) {
        const x = recentPlaces[Number(d.recent)];
        return x.p ? setPoint(target, x.p, x.n) : setText(target, x.n);
      }
      const l = K.data().landmarks[Number(d.lm)];
      setPoint(target, { latitude: l.lat, longitude: l.lng, label: l.name + ", " + l.area + ", Quezon City" }, l.name + ", Quezon City");
      status(K.t(target === "origin" ? "home.startSet" : "home.destSet"));
    });
    pickModal.show();
  }

  function usePlace(target, place) {
    const p = K.places.toPoint(place);
    if (p) setPoint(target, p, place.address); else setText(target, place.address);
    status(K.t(target === "origin" ? "home.startSetTo" : "home.destSetTo", { n: K.places.label(place) }));
  }

  // ---------- save a place ----------
  function openSave(target) {
    const text = target === "origin" ? S.origin : S.destination;
    if (!text.trim()) { status(K.t("save.nothing"), true); return; }
    saveTarget = target;
    $("saveAddr").textContent = text;
    $("saveName").value = K.fmt.first(text).replace(K.t("place.myLocation") + " · ", "");
    $("saveType").innerHTML = K.places.TYPES.map((t) => `<option value="${t}">${K.esc(K.t("type." + t))}</option>`).join("");
    saveModal.show();
    setTimeout(() => $("saveName").focus(), 300);
  }

  function confirmSave() {
    const name = $("saveName").value.trim();
    if (!name) { $("saveName").focus(); return; }
    const p = saveTarget === "origin" ? S.originPoint : S.destinationPoint;
    const address = saveTarget === "origin" ? S.origin : S.destination;
    K.places.add({ name, address: /quezon city/i.test(address) ? address : address + ", Quezon City", type: $("saveType").value, lat: p ? p.latitude : null, lng: p ? p.longitude : null });
    saveModal.hide();
    status(K.t("save.done", { n: name }));
    renderQuick();
    K.saved.init();
  }

  // ---------- quick picks and recent trips ----------
  function renderQuick() {
    const chips = (target) => K.places.all().slice(0, 4).map((p, i) =>
      `<button type="button" class="k-chip" data-i="${i}" data-t="${target}"><i class="bi bi-star"></i> ${K.esc(K.places.label(p))}</button>`).join("");
    $("quickStart").innerHTML = chips("origin");
    $("quick").innerHTML = chips("destination");
    document.querySelectorAll("#quickStart button, #quick button").forEach((b) => {
      b.onclick = () => usePlace(b.dataset.t, K.places.all()[Number(b.dataset.i)]);
    });
  }

  function renderRecent() {
    const trips = K.recent.trips();
    $("recentWrap").classList.toggle("d-none", !trips.length);
    $("recentTrips").innerHTML = trips.map((t, i) => `<button type="button" class="k-recent" data-i="${i}">
      <i class="bi bi-clock-history"></i><span>${K.esc(K.fmt.first(t.origin))} <i class="bi bi-arrow-right"></i> ${K.esc(K.fmt.first(t.destination))}</span></button>`).join("");
    $("recentTrips").querySelectorAll("button").forEach((b) => b.onclick = () => {
      const t = trips[Number(b.dataset.i)];
      Object.assign(S, { origin: t.origin, originPoint: t.originPoint, destination: t.destination, destinationPoint: t.destinationPoint, road: null });
      $("origin").value = S.origin; $("destination").value = S.destination;
      syncMarkers(); updateFind(); refreshFare();
      K.app.findRoutes();
    });
  }

  // Used by the Saved screen
  function useSavedPlace(place) { usePlace("destination", place); }
  function useSavedStart(place) { usePlace("origin", place); }

  function show() {
    setTimeout(() => km && km.resize(), 60);
    $("origin").value = S.origin; $("destination").value = S.destination;
    renderRecent(); renderQuick(); updateFind(); syncMarkers(false);
  }

  function relabel() { updateFind(); renderRecent(); renderQuick(); if (km) km.labelStyle($("planStyleBtn")); if (S.destination) refreshFare(); }

  K.home = { init, show, useSavedPlace, useSavedStart, relabel };
})(window.Komute);
