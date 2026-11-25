// Plan screen: choose the starting point (A) and destination (B).
// Each can be typed and searched, set to "my location", picked from saved places / landmarks / recent trips,
// or pinned on the map (drag the map under the center pin, like Grab).
(function (K) {
  const S = K.state;
  const $ = (id) => document.getElementById(id);
  let km = null, taOrigin = null, taDest = null, pinTarget = null, pinLookup = null, pickTarget = "destination", pickModal, saveModal, saveTarget;

  function init() {
    km = K.maps.create("planMap", { draggable: true });
    if (km) {
      km.bindCompass($("planCompass"));
      km.labelStyle($("planStyleBtn"));
      $("planStyleBtn").onclick = () => km.nextStyle($("planStyleBtn"));
      km.onTap(onMapTap);
      km.onStation(onStationTap);
      km.setTransit(km.transitOn(), $("planTransitBtn"));
      $("planTransitBtn").onclick = () => km.setTransit(!km.transitOn(), $("planTransitBtn"));
      km.map.on("moveend", K.debounce(previewPin, 700));
      km.onPinDrag(onPinDrag);
      km.ready(syncMarkers);
      $("planExpandBtn").onclick = () => setExpanded(!document.body.classList.contains("k-mapfull"));
    } else {
      ["btnPin", "btnPinStart", "planStyleBtn", "planCompass", "planExpandBtn", "planTransitBtn"].forEach((id) => $(id) && $(id).classList.add("d-none"));
    }
    // Search as you type
    taOrigin = K.typeahead.attach($("origin"), $("originSuggestions"), { onPick: (it) => pickSuggestion("origin", it) });
    taDest = K.typeahead.attach($("destination"), $("suggestions"), { onPick: (it) => pickSuggestion("destination", it), near: () => S.originPoint });
    pickModal = new bootstrap.Modal($("pickModal"));
    saveModal = new bootstrap.Modal($("saveModal"));

    $("origin").value = S.origin;
    $("origin").addEventListener("input", (e) => {
      S.origin = e.target.value;
      if (S.originPoint && S.originPoint.label !== S.origin) S.originPoint = null;
      syncMarkers(false); updateFind();
    });
    $("destination").addEventListener("input", (e) => {
      S.destination = e.target.value;
      if (S.destinationPoint && S.destinationPoint.label !== S.destination) S.destinationPoint = null;
      syncMarkers(false); updateFind();
    });

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
  // The Search button opens the suggestion list right away (suggestions also appear while typing).
  function search(target) {
    const q = (target === "origin" ? S.origin : S.destination).trim();
    if (!q) { status(K.t(target === "origin" ? "home.typeStart" : "home.typeDest")); $(inputId(target)).focus(); return; }
    status("");
    $(inputId(target)).focus();
    (target === "origin" ? taOrigin : taDest).search();
  }

  function pickSuggestion(target, it) {
    if (it.location) {
      const base = it.display || it.name;
      const name = /quezon city/i.test(base) ? base : `${base}, Quezon City`;
      setPoint(target, { latitude: it.location.latitude, longitude: it.location.longitude, label: it.label || name }, name);
      status(K.t(target === "origin" ? "home.startSet" : "home.destSet") + (it.approx ? " " + K.t("ta.dragHint") : ""));
    } else {
      setText(target, it.display || it.label || it.name);
      status(K.t("ta.noSpot"), true);
    }
    if (target === "origin" && !S.destination.trim()) setTimeout(() => $("destination").focus(), 50);
  }

  // ---------- tap the map: "Start here" / "Go here" ----------
  async function onMapTap(e) {
    if (pinTarget) { km.map.easeTo({ center: e.lngLat, duration: 400 }); return; }
    const p = { latitude: e.lngLat.lat, longitude: e.lngLat.lng };
    if (!K.maps.inQC(p)) { km.popup(e.lngLat, `<div class="k-pop">${K.esc(K.t("pin.outside"))}</div>`); return; }
    const el = km.popup(e.lngLat, `<div class="k-pop"><div class="k-pop-addr"><span class="spinner-border spinner-border-sm"></span> ${K.esc(K.t("pin.finding"))}</div>
      <div class="k-pop-btns"><button type="button" class="btn btn-sm btn-outline-primary" data-t="origin"><span class="k-dotmini a"></span> ${K.esc(K.t("pop.start"))}</button>
      <button type="button" class="btn btn-sm btn-primary" data-t="destination"><span class="k-dotmini b"></span> ${K.esc(K.t("pop.go"))}</button></div>
      <button type="button" class="btn btn-link btn-sm p-0 mt-2 k-pop-report"><i class="bi bi-plus-circle"></i> ${K.esc(K.t("pop.reportMissing"))}</button></div>`);
    el.querySelector(".k-pop-report").onclick = () => { km.closePopup(); K.feedback.open("", "map", K.t("pop.reportMissingMsg", { c: `${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}` })); };
    let found = null;
    const use = async (target) => {
      km.closePopup();
      const r = found || await K.api.reverseGeocode(p.latitude, p.longitude);
      if (r.inArea === false) { status(K.t("pin.outside"), true); return; }
      setPoint(target, { ...p, label: r.label });
      status(K.t(target === "origin" ? "pin.startSet" : "pin.destSet"));
    };
    el.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => use(b.dataset.t));
    found = await K.api.reverseGeocode(p.latitude, p.longitude);
    const addr = el.querySelector(".k-pop-addr");
    if (addr) addr.textContent = found.inArea === false ? K.t("pin.outside") : K.fmt.shortLabel(found.label);
  }

  // Tapping a station on the map: name + Start here / Go here
  function onStationTap(st) {
    if (pinTarget) { km.map.easeTo({ center: st.lngLat, duration: 400 }); return; }
    const bus = st.kind === "carousel";
    const ours = st.kind === "carousel" || (st.kind === "train" && /^(MRT|LRT)/.test(st.line));
    const text = ours ? `${st.name} ${bus ? "EDSA Carousel stop" : st.line + " station"}` : st.name;
    const el = km.popup(st.lngLat, `<div class="k-pop"><div class="k-pop-addr"><span class="k-legend-dot" style="background:${K.esc(st.color)}"></span> ${K.esc(text)}</div>
      ${ours ? "" : `<div class="small text-muted">${K.esc(st.line)}${st.routes ? " · " + K.esc(K.t("pt.routes", { r: st.routes })) : ""}</div>`}
      ${bus ? `<div class="small text-muted mb-2">${K.esc(K.t("ta.carouselTip"))}</div>` : ""}
      <div class="k-pop-btns"><button type="button" class="btn btn-sm btn-outline-primary" data-t="origin"><span class="k-dotmini a"></span> ${K.esc(K.t("pop.start"))}</button>
      <button type="button" class="btn btn-sm btn-primary" data-t="destination"><span class="k-dotmini b"></span> ${K.esc(K.t("pop.go"))}</button></div>
      <button type="button" class="btn btn-link btn-sm p-0 mt-2 k-pop-report">${K.esc(K.t("pop.reportWrong"))}</button></div>`);
    el.querySelectorAll("[data-t]").forEach((b) => b.onclick = () => {
      km.closePopup();
      setPoint(b.dataset.t, { latitude: st.lngLat.lat, longitude: st.lngLat.lng, label: text + ", Quezon City" }, text + ", Quezon City");
    });
    el.querySelector(".k-pop-report").onclick = () => { km.closePopup(); K.feedback.open("", "map", K.t("pop.reportWrongMsg", { n: text, c: `${st.lngLat.lat.toFixed(5)}, ${st.lngLat.lng.toFixed(5)}` })); };
  }

  // Dragging the A or B pin moves that point to the exact spot.
  async function onPinDrag(kind, lngLat) {
    const target = kind === "a" ? "origin" : "destination";
    const p = { latitude: lngLat.lat, longitude: lngLat.lng };
    if (!K.maps.inQC(p)) { status(K.t("pin.outside"), true); syncMarkers(false); return; }
    status(K.t("pin.finding"));
    const r = await K.api.reverseGeocode(p.latitude, p.longitude);
    if (r.inArea === false) { status(K.t("pin.outside"), true); syncMarkers(false); return; }
    setPoint(target, { ...p, label: r.label });
    status(K.t(target === "origin" ? "pin.startSet" : "pin.destSet"));
  }

  function setExpanded(on) {
    document.body.classList.toggle("k-mapfull", on);
    $("planExpandBtn").innerHTML = `<i class="bi ${on ? "bi-fullscreen-exit" : "bi-arrows-fullscreen"}"></i>`;
    $("planExpandBtn").setAttribute("aria-label", K.t(on ? "map.shrink" : "map.expand"));
    setTimeout(() => km && km.resize(), 80);
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
    if (window.innerWidth < 992) setExpanded(true); else $("planMapWrap").scrollIntoView({ behavior: "smooth", block: "center" });
    previewPin();
  }

  function stopPin() {
    pinTarget = null;
    $("pinOverlay").className = "k-centerpin d-none";
    $("pinBar").classList.add("d-none");
    $("btnPinStart").setAttribute("aria-pressed", "false");
    $("btnPin").setAttribute("aria-pressed", "false");
    if (document.body.classList.contains("k-mapfull")) setExpanded(false);
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
