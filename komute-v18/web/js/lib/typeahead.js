// Search-as-you-type for the Start and Destination boxes (like Google Maps / Move It).
// Shows instant matches from this phone (barangays, landmarks, saved, recent) from the first letter,
// then live suggestions from the server (streets, buildings, house numbers) a moment later.
(function (K) {
  const LINE_COLOR = { "MRT-3": "#2563eb", "LRT-1": "#16a34a", "LRT-2": "#7e22ce", "EDSA Carousel": "#dc2626" };
  const ICON = { area: "bi-signpost-2", street: "bi-signpost", place: "bi-geo-alt-fill", saved: "bi-star-fill", recent: "bi-clock-history", landmark: "bi-building", barangay: "bi-houses" };
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const remoteCache = new Map();
  let barangayList = null;

  function barangays() {
    if (barangayList) return barangayList;
    const b = K.data().barangays || {};
    barangayList = Object.keys(b).flatMap((d) => b[d].map((name) => ({ name, district: d })));
    return barangayList;
  }

  // Score: starts-with beats word-start beats contains.
  function score(text, q) {
    const t = norm(text);
    if (!q) return 0;
    if (t.startsWith(q)) return 3;
    if ((" " + t).includes(" " + q)) return 2;
    return t.includes(q) ? 1 : 0;
  }

  function localMatches(raw) {
    const q = norm(raw), out = [];
    if (!q) return out;
    K.places.all().forEach((p) => {
      const s = Math.max(score(K.places.label(p), q), score(p.address, q));
      if (s) out.push({ s: s + 0.5, kind: "saved", name: K.places.label(p), sub: p.address, label: p.address, display: p.address, location: K.places.toPoint(p), lookup: p.address });
    });
    K.data().landmarks.forEach((l) => {
      const s = score(l.name, q);
      if (s) out.push({ s, kind: "landmark", name: l.name, sub: `${l.area}, Quezon City`, label: `${l.name}, Quezon City`, location: { latitude: l.lat, longitude: l.lng } });
    });
    // Schools with checked locations (all campuses)
    (K.data().schools || []).forEach((sc) => {
      const best = Math.max(score(sc.name, q), ...sc.aliases.map((a) => score(a, q)));
      if (best) out.push({ s: best + 0.6, kind: "place", icon: "bi-mortarboard-fill", color: "#1d4ed8", name: sc.name, sub: sc.address,
        label: `${sc.name}, Quezon City`, display: sc.name,
        location: sc.lookup ? null : { latitude: sc.lat, longitude: sc.lng }, lookup: sc.lookup, fallback: { latitude: sc.lat, longitude: sc.lng } });
    });
    // Train stations and EDSA Carousel stops ("carousel", "busway", "mrt", "lrt" list the whole line)
    K.data().transit.stations.forEach((st) => {
      const bus = st.line === "EDSA Carousel";
      const hay = `${st.line} ${bus ? "carousel busway bus edsa" : "train tren station"} ${st.name}`;
      const sc = Math.max(score(st.name, q), score(hay, q), score(`${st.line} ${st.name}`, q));
      if (sc) out.push({ s: sc + 0.2, kind: "station", icon: bus ? "bi-bus-front-fill" : "bi-train-front-fill", color: LINE_COLOR[st.line],
        name: `${st.line} · ${st.name}`, sub: K.t(bus ? "ta.carousel" : "ta.train"),
        label: `${st.name} ${bus ? "EDSA Carousel stop" : st.line + " station"}, Quezon City`,
        display: `${st.name} ${bus ? "EDSA Carousel stop" : st.line + " station"}`, location: { latitude: st.lat, longitude: st.lng } });
    });
    // Terminals from the map data (bus, jeepney, UV Express, tricycle/TODA)
    if (K.transitPoints && q.length >= 2) {
      const ptIcon = { terminal: "bi-bus-front", jeepney: "bi-truck-front", tricycle: "bi-bicycle", uv: "bi-car-front", train: "bi-train-front" };
      K.transitPoints.forEach((f) => {
        const p = f.properties;
        if (!p.n || !ptIcon[p.k]) return;
        const sc = Math.max(score(p.n, q), score(`${K.t("pt." + p.k)} ${p.n}`, q));
        if (sc) out.push({ s: sc, kind: "station", icon: ptIcon[p.k], name: p.n, sub: K.t("pt." + p.k) + (p.r ? ` · ${p.r}` : ""),
          label: `${p.n}, Quezon City`, display: p.n, location: { latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0] } });
      });
    }
    barangays().forEach((b) => {
      const s = Math.max(score(b.name, q), score("barangay " + b.name, q), score("brgy " + b.name, q));
      if (s) out.push({ s, kind: "barangay", name: "Barangay " + b.name, sub: K.t("ta.district", { d: b.district }), label: `Barangay ${b.name}, Quezon City`, location: null, lookup: `${b.name}, Quezon City` });
    });
    const wholeLine = /carousel|busway|mrt|lrt|station|istasyon|tren|terminal|toda|tricycle/.test(q);
    return out.sort((a, b) => b.s - a.s || a.name.length - b.name.length).slice(0, wholeLine ? 12 : 5);
  }

  function highlight(text, raw) {
    const t = String(text), q = raw.trim();
    if (!q) return K.esc(t);
    const i = t.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? K.esc(t) : K.esc(t.slice(0, i)) + "<mark>" + K.esc(t.slice(i, i + q.length)) + "</mark>" + K.esc(t.slice(i + q.length));
  }

  // input: the text box; list: the dropdown container; opts.onPick(item) is called with { name, label, location|null, placeId?, lookup? }
  function attach(input, list, opts) {
    let items = [], active = -1, seq = 0, timer = 0, session = Math.random().toString(36).slice(2);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", list.id);
    list.setAttribute("role", "listbox");

    function render(raw, loading) {
      if (!items.length && !loading && raw.trim().length < 2) { close(); return; }
      list.innerHTML = items.map((it, i) => `<button type="button" role="option" id="${list.id}-o${i}" class="list-group-item list-group-item-action k-sugg${i === active ? " active" : ""}" data-i="${i}" aria-selected="${i === active}">
          <i class="bi ${it.icon || ICON[it.kind] || ICON.place}"${it.color ? ` style="color:${it.color}"` : ""}></i>
          <span><b>${highlight(it.name, raw)}</b>${it.sub ? `<small>${highlight(it.sub, raw)}</small>` : ""}${it.approx ? `<small class="k-approx">${K.esc(K.t("ta.approx"))}</small>` : ""}</span></button>`).join("") +
        (loading ? `<div class="list-group-item k-sugg-loading"><span class="spinner-border spinner-border-sm"></span> ${K.esc(K.t("ta.loading"))}</div>` : "") +
        (!loading && raw.trim().length >= 2 ? `<div class="list-group-item k-sugg-foot"><i class="bi bi-pin-map"></i> ${K.esc(K.t("ta.notFound"))}</div>` : "");
      input.setAttribute("aria-expanded", "true");
      list.querySelectorAll("button[data-i]").forEach((b) => {
        // pointerdown runs before the box loses focus, so a tap always counts
        b.addEventListener("pointerdown", (e) => { e.preventDefault(); pick(Number(b.dataset.i)); });
        b.addEventListener("click", (e) => { e.preventDefault(); pick(Number(b.dataset.i)); });
      });
    }

    function close() { list.innerHTML = ""; items = []; active = -1; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); }

    async function pick(i) {
      const it = items[i];
      if (!it) return;
      close();
      input.blur();
      let item = it;
      try {
        if (!it.location && it.placeId) {
          const d = await K.api.placeDetails(it.placeId, session);
          item = { ...it, location: d.location, label: d.label || it.label };
          session = Math.random().toString(36).slice(2);
        } else if (!it.location && it.lookup) {
          const r = (await K.api.autocomplete(it.lookup, null)).concat(await K.api.searchPlaces(it.lookup, null).catch(() => []));
          const first = r.find((x) => x.location);
          if (first) item = { ...it, location: first.location };
          else if (it.fallback) item = { ...it, location: it.fallback, approx: true };
        }
      } catch { /* keep text only */ }
      opts.onPick(item);
    }

    async function update(force) {
      const raw = input.value, q = raw.trim(), my = ++seq;
      items = localMatches(raw).map((x) => ({ ...x }));
      active = -1;
      if (q.length < 2 && !force) { render(raw, false); return; }
      const key = q.toLowerCase();
      // Same name is fine (3 campuses of one school); skip only true duplicates: same name within ~120 m, or same name + same address.
      const words = (t) => new Set(norm(t).split(" ").filter((w) => w.length > 2));
      const shared = (a, b) => { const A = words(a); let n = 0; words(b).forEach((w) => { if (A.has(w)) n++; }); return n; };
      const near = (x, r) => x.location && r.location && K.geo.dist(x.location, r.location) < 150;
      const same = (x, r) => (norm(x.name) === norm(r.name) && (norm(x.sub) === norm(r.sub) || near(x, r))) ||
        (near(x, r) && shared(x.name, r.name) >= 2); // same place spelled differently ("QCU Main Campus" vs "Quezon City University")
      const merge = (remote) => {
        remote.forEach((r) => { if (!items.some((x) => same(x, r))) items.push(r); });
        items = items.slice(0, 10);
      };
      if (remoteCache.has(key)) { merge(remoteCache.get(key)); render(raw, false); return; }
      render(raw, true);
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const remote = await K.api.autocomplete(q, opts.near ? opts.near() : null, session);
          remoteCache.set(key, remote);
          if (my !== seq) return; // a newer letter was typed
          merge(remote);
        } catch { if (my !== seq) return; }
        render(input.value, false);
      }, force ? 0 : 220);
    }

    input.addEventListener("input", () => update(false));
    input.addEventListener("focus", () => {
      // On phones, move the box to the top so the list is not hidden by the keyboard or the big button
      document.body.classList.add("k-typing");
      if (window.innerWidth < 992) {
        setTimeout(() => {
          const header = document.querySelector(".k-header");
          const y = input.getBoundingClientRect().top + window.scrollY - (header ? header.offsetHeight : 0) - 44;
          window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
        }, 60);
      }
      if (input.value.trim()) update(false);
    });
    input.addEventListener("blur", () => setTimeout(() => {
      if (document.activeElement === input) return; // focus came back (e.g. the Search button) - keep the list
      close(); document.body.classList.remove("k-typing");
    }, 200));
    input.addEventListener("keydown", (e) => {
      const n = items.length;
      if (e.key === "ArrowDown" && n) { e.preventDefault(); active = (active + 1) % n; render(input.value, false); }
      else if (e.key === "ArrowUp" && n) { e.preventDefault(); active = (active - 1 + n) % n; render(input.value, false); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (n) pick(active >= 0 ? active : 0); else update(true);
      } else if (e.key === "Escape") close();
      if (active >= 0) input.setAttribute("aria-activedescendant", `${list.id}-o${active}`);
    });
    return { search: () => update(true), close };
  }

  K.typeahead = { attach };
})(window.Komute);
