// Search-as-you-type for the Start and Destination boxes (like Google Maps / Move It).
// Shows instant matches from this phone (barangays, landmarks, saved, recent) from the first letter,
// then live suggestions from the server (streets, buildings, house numbers) a moment later.
(function (K) {
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
    barangays().forEach((b) => {
      const s = Math.max(score(b.name, q), score("barangay " + b.name, q), score("brgy " + b.name, q));
      if (s) out.push({ s, kind: "barangay", name: "Barangay " + b.name, sub: K.t("ta.district", { d: b.district }), label: `Barangay ${b.name}, Quezon City`, location: null, lookup: `${b.name}, Quezon City` });
    });
    return out.sort((a, b) => b.s - a.s || a.name.length - b.name.length).slice(0, 5);
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
      if (!items.length && !loading) { close(); return; }
      list.innerHTML = items.map((it, i) => `<button type="button" role="option" id="${list.id}-o${i}" class="list-group-item list-group-item-action k-sugg${i === active ? " active" : ""}" data-i="${i}" aria-selected="${i === active}">
          <i class="bi ${ICON[it.kind] || ICON.place}"></i>
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
      const merge = (remote) => {
        const names = new Set(items.map((x) => norm(x.name)));
        remote.forEach((r) => { if (!names.has(norm(r.name))) { names.add(norm(r.name)); items.push(r); } });
        items = items.slice(0, 9);
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
