// Shows the commute guide as tabs, one per way to travel: Best way, Jeep, Bus, UV Express, Tricycle, Taxi, Ride-hailing.
// Each option is a step list: where to wait, which signboard to look for (in the right direction), and where to get off.
// Taxi and ride-hailing are built here from the fare table and the road distance.
(function (K) {
  // state.js loads after this file, so read K.state when needed
  const st = () => K.state;
  const MODE = {
    walk: ["bi-person-walking", "#56635f"], jeepney: ["bi-truck-front", "#b45309"], modern_jeepney: ["bi-truck-front-fill", "#0e7490"],
    bus: ["bi-bus-front", "#1d4ed8"], carousel: ["bi-bus-front-fill", "#7c3aed"], qcity_bus: ["bi-gift", "#15803d"],
    uv_express: ["bi-car-front", "#9d174d"], tricycle: ["bi-bicycle", "#a16207"], padyak: ["bi-bicycle", "#65a30d"], mrt3: ["bi-train-front", "#2563eb"],
    lrt1: ["bi-train-lightrail-front", "#16a34a"], lrt2: ["bi-train-lightrail-front", "#7e22ce"], taxi: ["bi-taxi-front", "#ca8a04"],
    tnvs: ["bi-phone", "#047857"], mc_taxi: ["bi-scooter", "#be123c"]
  };
  const CATS = [
    { id: "commute", icon: "bi-stars" }, { id: "jeepney", icon: "bi-truck-front" }, { id: "bus", icon: "bi-bus-front" },
    { id: "uv_express", icon: "bi-car-front" }, { id: "taxi", icon: "bi-taxi-front" }
  ];
  let tab = "commute";

  // AI text sometimes uses other words for a mode; map them to our list.
  function normMode(m) {
    m = String(m || "").toLowerCase().replace(/[\s-]+/g, "_");
    if (MODE[m]) return m;
    if (/q_?city|libreng/.test(m)) return "qcity_bus";
    if (/modern|e_?jeep/.test(m)) return "modern_jeepney";
    if (/jeep|puj/.test(m)) return "jeepney";
    if (/carousel|busway/.test(m)) return "carousel";
    if (/bus/.test(m)) return "bus";
    if (/mrt/.test(m)) return "mrt3";
    if (/lrt_?1/.test(m)) return "lrt1";
    if (/lrt/.test(m)) return "lrt2";
    if (/uv/.test(m)) return "uv_express";
    if (/trike|tricycle|padyak|pedicab/.test(m)) return "tricycle";
    if (/angkas|joyride|move_?it|motor|mc/.test(m)) return "mc_taxi";
    if (/grab|tnvs/.test(m)) return "tnvs";
    if (/taxi/.test(m)) return "taxi";
    if (/walk|lakad/.test(m)) return "walk";
    return "";
  }
  const KIND_ICON = { start: "bi-geo-alt-fill", walk: "bi-person-walking", ride: "bi-arrow-up-right-circle-fill", transfer: "bi-arrow-left-right", getoff: "bi-box-arrow-down", arrive: "bi-flag-fill" };
  const modeName = (m) => K.t("mode." + m);
  const chip = (m) => { const x = MODE[m]; return x ? `<span class="k-mode" style="--mc:${x[1]}"><i class="bi ${x[0]}"></i> ${K.esc(modeName(m))}</span>` : ""; };

  // Kind of vehicle (traditional / modern jeepney, aircon / ordinary bus) for a group of signboards
  const vehTag = (type, label) => { const x = MODE[normMode(type)] || MODE.bus; return label ? `<span class="k-veh" style="--mc:${x[1]}"><i class="bi ${x[0]}"></i> ${K.esc(label)}</span>` : ""; };
  const codeLine = (c) => c ? `<span class="k-route-code">${K.esc(/^routes?\b/i.test(c) ? c : K.t("step.routeNo", { n: c }))}</span>` : "";

  function signs(s) {
    const list = Array.isArray(s.signs) && s.signs.length ? s.signs : s.sign ? String(s.sign).split(/\s*\|\s*/) : [];
    if (!list.length) return "";
    const groups = Array.isArray(s.signGroups) ? s.signGroups.filter((g) => g && Array.isArray(g.signs) && g.signs.length) : [];
    if (groups.length) {
      const total = groups.reduce((n, g) => n + g.signs.length, 0);
      return `<div class="k-signwrap"><span class="k-signcap">${K.esc(K.t(total > 1 ? "step.lookSigns" : "step.lookSign"))}</span>
        ${groups.map((g) => `<div class="k-veh-group">
          <div class="k-veh-head">${Array.isArray(g.split) && g.split.length
            ? g.split.map((x) => `<span class="k-veh-pair">${vehTag(g.type, x.label)}${x.fare ? ` <span class="k-fare-chip">${K.esc(x.fare)}</span>` : ""}</span>`).join("")
            : `${vehTag(g.type, g.label)}${groups.length > 1 && g.fare ? ` <span class="k-fare-chip">${K.esc(g.fare)}</span>` : ""}`}</div>
          <div class="k-signs">${g.signs.map((x) => `<span class="k-sign">${K.esc(x)}</span>`).join("")}</div>
          ${groups.length > 1 ? codeLine((g.codes || []).join(", ")) : ""}</div>`).join("")}
        ${s.via ? `<span class="k-via">via ${K.esc(s.via)}</span>` : ""}
        ${groups.length > 1 ? "" : codeLine(s.routeCode)}</div>`;
    }
    return `<div class="k-signwrap"><span class="k-signcap">${K.esc(K.t(list.length > 1 ? "step.lookSigns" : "step.lookSign"))}</span>
      <div class="k-signs">${list.map((x) => `<span class="k-sign">${K.esc(x)}</span>`).join("")}</div>
      ${s.via ? `<span class="k-via">via ${K.esc(s.via)}</span>` : ""}
      ${s.routeCode ? `<span class="k-route-code">${K.esc(/^routes?\b/i.test(s.routeCode) ? s.routeCode : K.t("step.routeNo", { n: s.routeCode }))}</span>` : ""}</div>`;
  }

  function step(s) {
    const mode = normMode(s.mode);
    const kind = KIND_ICON[s.kind] ? s.kind : (mode && mode !== "walk" ? "ride" : mode === "walk" ? "walk" : "start");
    const m = MODE[mode];
    const icon = kind === "ride" && m ? m[0] : KIND_ICON[kind];
    const color = kind === "ride" && m ? m[1] : "";
    const badge = kind !== "ride" || s.connect || s.door ? "" : s.verified
      ? `<span class="k-verified" title="${K.esc(K.t("step.verifiedTip"))}"><i class="bi bi-patch-check-fill"></i> ${K.esc(K.t("step.verified"))}</span>`
      : `<span class="k-unverified"><i class="bi bi-question-circle"></i> ${K.esc(K.t("step.unverified"))}</span>`;
    return `<li class="k-step-${kind}${s.connect && kind === "ride" ? " k-step-connect" : ""}">
      <span class="k-tl-ic"${color ? ` style="background:${color}"` : ""}><i class="bi ${icon}"></i></span>
      <div class="k-tl-body">
        <div class="k-tl-lab">${K.esc(K.t(s.connect && kind === "ride" ? "step.connect" : "step." + kind))}${kind === "ride" && mode ? ` · ${K.esc(s.vehicleLabel || modeName(mode))}` : ""}${s.fare ? ` <span class="k-fare-chip">${K.esc(s.fare)}</span>` : ""} ${badge}</div>
        <div class="k-tl-text">${K.esc(s.text)}</div>
        ${s.where ? `<div class="k-board"><i class="bi bi-geo-alt-fill"></i><div><b>${K.esc(K.t(kind === "ride" ? "step.rideHere" : "step.where"))}</b> ${K.esc(s.where)}</div></div>` : ""}
        ${kind === "ride" ? signs(s) : ""}
        ${s.getOff ? `<div class="k-alight"><i class="bi bi-sign-stop-fill"></i><div><b>${K.esc(K.t("step.getOffAt"))}</b> ${K.esc(s.getOff)}</div></div>` : ""}
        ${s.tip ? `<div class="k-tl-tip"><i class="bi bi-lightbulb"></i> ${K.esc(s.tip)}</div>` : ""}
      </div></li>`;
  }

  function option(o, i) {
    const main = o.steps.filter((s) => !s.connect).map((s) => s.mode);
    const modes = [...new Set([...(o.modes || []), ...main].map(normMode).filter((m) => m && !["walk", "tricycle"].includes(m)))];
    // Chips name the kind of vehicle when Komute knows it: "Traditional jeepney · no aircon", "Aircon or ordinary bus"
    const kinds = [];
    for (const s of o.steps) {
      if (s.kind !== "ride" || s.connect) continue;
      const gs = Array.isArray(s.signGroups) && s.signGroups.length ? s.signGroups : null;
      if (gs) gs.forEach((g) => (Array.isArray(g.split) && g.split.length ? g.split : [g]).forEach((x) => kinds.push([normMode(g.type), x.label])));
      else if (normMode(s.mode) && !["walk", "tricycle"].includes(normMode(s.mode))) kinds.push([normMode(s.mode), s.vehicleLabel || ""]);
    }
    const seenK = new Set();
    const chips = kinds.filter(([m, l]) => { const k = m + "|" + l; if (seenK.has(k) || !MODE[m]) return false; seenK.add(k); return true; })
      .map(([m, l]) => (l ? vehTag(m, l).replace("k-veh", "k-mode") : chip(m)));
    const tagKey = { cheapest: "tag.cheapest", fastest: "tag.fastest", easiest: "tag.easiest", "fewest transfers": "tag.fewest" }[String(o.tag || "").toLowerCase()];
    return `<details class="k-opt"${i === 0 ? " open" : ""}>
      <summary>
        <span class="k-opt-no">${i + 1}</span>
        <span class="k-opt-head">
          <span class="k-opt-title">${K.esc(o.title)}${tagKey ? ` <span class="k-tag">${K.esc(K.t(tagKey))}</span>` : ""}</span>
          <span class="k-modes">${(chips.length ? chips : modes.map(chip)).join("")}</span>
          <span class="k-opt-meta">${o.duration ? `<span><i class="bi bi-clock"></i> ${K.esc(o.duration)}</span>` : ""}${o.fare ? `<span><i class="bi bi-cash"></i> ${K.esc(o.fare)}</span>` : ""}</span>
        </span>
        <i class="bi bi-chevron-down k-opt-chev"></i>
      </summary>
      <ol class="k-tl">${o.steps.map(step).join("")}</ol>
      ${o.why ? `<div class="k-call k-call-good"><strong><i class="bi bi-hand-thumbs-up-fill"></i> ${K.esc(K.t("plan.why"))}</strong><div>${K.esc(o.why)}</div></div>` : ""}
      ${o.check ? `<div class="k-call k-call-warn"><strong><i class="bi bi-exclamation-triangle-fill"></i> ${K.esc(K.t("plan.check"))}</strong><div>${K.esc(o.check)}</div></div>` : ""}
    </details>`;
  }

  // Same repair the server does, in case an older server sent the raw answer.
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

  // ---------- Taxi and ride-hailing (from fares and road distance) ----------
  function trip() {
    const f = K.data().fares.estimate;
    const pts = K.routeView && K.routeView.points ? K.routeView.points() : null;
    const S = st();
    let km = S.road && S.road.km, min = S.road && S.road.min;
    if (!km && pts) km = (K.geo.dist(pts[0], pts[1]) / 1000) * f.roadDetourFactor;
    if (!km) return null;
    if (!min) min = (km / f.trafficKmh) * 60;
    return { km, min, f };
  }
  const dest = () => K.fmt.first(st().destination);
  const from = () => K.fmt.first(st().origin);
  const mins = (m) => K.t("door.mins", { a: Math.max(5, Math.round(m / 5) * 5), b: Math.max(10, Math.round((m * 1.6) / 5) * 5) });

  function doorOptions(id) {
    const t = trip();
    if (!t) return [];
    const { km, min, f } = t;
    const meter = (x, m) => x.flag + km * x.perKm + m * x.perMin;
    const start = { kind: "start", text: K.t("door.start", { o: from() }) };
    const arrive = { kind: "arrive", text: K.t("door.arrive", { d: dest() }) };
    if (id === "taxi") {
      return [{
        title: K.t("door.taxiTitle"), modes: ["taxi"], duration: mins(min), fare: K.fmt.range(meter(f.taxi, min), meter(f.taxi, min * 1.6)),
        steps: [start,
          { kind: "ride", mode: "taxi", text: K.t("door.taxiRide", { d: dest() }), where: K.t("door.taxiWhere"), getOff: dest(),
            fare: K.fmt.range(meter(f.taxi, min), meter(f.taxi, min * 1.6)), tip: K.t("door.taxiTip"), door: true },
          arrive],
        why: K.t("door.taxiWhy"), check: K.t("door.taxiCheck")
      }];
    }
    const mc = f.mcTaxi;
    const mcPrice = mc.base + Math.max(0, Math.min(km, mc.afterKm) - mc.coverKm) * mc.perKm + Math.max(0, km - mc.afterKm) * mc.perKmAfter;
    return [
      { title: K.t("door.grabTitle"), modes: ["tnvs"], duration: mins(min), fare: K.fmt.range(meter(f.tnvs, min), meter(f.tnvs, min * 1.6) + 30),
        steps: [start,
          { kind: "ride", mode: "tnvs", text: K.t("door.grabRide", { d: dest() }), where: K.t("door.grabWhere"), getOff: dest(),
            fare: K.fmt.range(meter(f.tnvs, min), meter(f.tnvs, min * 1.6) + 30), tip: K.t("door.grabTip"), door: true },
          arrive], why: K.t("door.grabWhy"), check: K.t("door.surge") },
      { title: K.t("door.mcTitle"), modes: ["mc_taxi"], duration: mins(min * 0.7), fare: K.fmt.range(mcPrice * 0.95, mcPrice * 1.15),
        steps: [start,
          { kind: "ride", mode: "mc_taxi", text: K.t("door.mcRide", { d: dest() }), where: K.t("door.grabWhere"), getOff: dest(),
            fare: K.fmt.range(mcPrice * 0.95, mcPrice * 1.15), tip: K.t("door.mcTip"), door: true },
          arrive], why: K.t("door.mcWhy"), check: K.t("door.surge") }
    ];
  }

  // ---------- Categories ----------
  function categories(ai) {
    const g = ai.guide || {};
    const list = Array.isArray(g.categories) && g.categories.length ? g.categories
      : [{ id: "commute", available: true, options: g.options || [] }];
    const byId = Object.fromEntries(list.map((c) => [c.id, c]));
    return CATS.map((c) => {
      if (c.id === "taxi") {
        const options = doorOptions(c.id);
        return { ...c, options, available: options.length > 0, note: options.length ? "" : K.t("door.needPoints") };
      }
      const x = byId[c.id] || { options: [], note: K.t("cat.notPlanned") };
      return { ...c, options: x.options || [], available: (x.options || []).length > 0, note: x.note || "" };
    });
  }

  function tabs(cats) {
    return `<div class="k-cats" role="tablist" aria-label="${K.esc(K.t("cat.label"))}">${cats.map((c) => {
      const o = c.options[0];
      const meta = c.available ? (o && o.duration ? o.duration.replace(/^(about|mga)\s+/i, "") : "") : "–";
      return `<button type="button" role="tab" class="k-cat${c.available ? "" : " is-off"}" data-cat="${c.id}" aria-selected="${c.id === tab}">
        <i class="bi ${c.icon}"></i><span class="k-cat-name">${K.esc(K.t("cat." + c.id))}</span><small>${K.esc(meta)}</small></button>`;
    }).join("")}</div>`;
  }

  function catBody(c) {
    if (!c.available) {
      // No public transport of this kind: suggest ride-hailing (Grab, motorcycle taxi) instead
      const rh = c.id === "taxi" ? [] : doorOptions("ridehailing");
      return `<div class="k-unavail"><i class="bi bi-slash-circle"></i><div><strong>${K.esc(K.t("cat.none", { m: K.t("cat." + c.id) }))}</strong>
        <div>${K.esc(c.note || K.t("cat.notPlanned"))}</div></div></div>` +
        (rh.length ? `<h3 class="h6 mt-2"><i class="bi bi-phone"></i> ${K.esc(K.t("cat.rideInstead"))}</h3>
          <p class="small text-muted">${K.esc(K.t("door.note"))}</p>${rh.map(option).join("")}` : "");
    }
    const head = c.id === "taxi" ? `<p class="small text-muted">${K.esc(K.t("door.note"))}</p>` : "";
    return head + c.options.map(option).join("");
  }

  function render(ai) {
    let g = ai.guide;
    // An older server (or a failed parse) sent the raw AI answer: repair it here
    if ((!g || !(g.categories || g.options)) && /^\s*(```|\{)/.test(ai.plan || "")) {
      const fixed = repairJson(ai.plan);
      if (fixed && (Array.isArray(fixed.categories) || Array.isArray(fixed.options))) {
        const clean = (list) => (list || []).map((o) => ({ ...o, steps: (o.steps || []).filter((st) => st && st.text) })).filter((o) => o.title && o.steps.length);
        g = { summary: fixed.summary || "", outsideArea: fixed.outsideArea || "", tips: fixed.tips || [], checks: fixed.checks || [],
          categories: Array.isArray(fixed.categories) ? fixed.categories.map((c) => ({ ...c, options: clean(c.options) })) : undefined,
          options: clean(fixed.options) };
        ai.guide = g;
      } else {
        return `<div class="alert k-warn"><i class="bi bi-exclamation-circle"></i> ${K.esc(K.t("plan.unreadable"))}</div>
          <button type="button" class="btn btn-primary" onclick="Komute.app.requestPlan()"><i class="bi bi-arrow-clockwise"></i> ${K.esc(K.t("res.retry"))}</button>`;
      }
    }
    if (!g || !((g.categories && g.categories.length) || (g.options && g.options.length))) {
      return K.planCards(ai.plan) || `<div class="k-plan">${K.planToHtml(ai.plan)}</div>`;
    }
    const cats = categories(ai);
    if (!cats.some((c) => c.id === tab && c.available)) tab = (cats.find((c) => c.available && c.id !== "taxi") || cats[0]).id;
    return `${g.noPublic ? `<div class="alert k-warn small"><i class="bi bi-exclamation-circle"></i> ${K.esc(K.t("cat.noPublic"))}</div>` : ""}
      ${g.notice ? `<div class="alert k-info small"><i class="bi bi-info-circle"></i> ${K.esc(g.notice)}</div>` : ""}
      ${g.summary ? `<p class="k-intro">${K.esc(g.summary)}</p>` : ""}
      ${g.outsideArea ? `<div class="alert k-warn small"><i class="bi bi-exclamation-circle"></i> ${K.esc(g.outsideArea)}</div>` : ""}
      ${tabs(cats)}
      <div class="k-catbody" role="tabpanel">${catBody(cats.find((c) => c.id === tab))}</div>
      ${g.tips && g.tips.length ? `<section class="k-guidebox mb-3"><h3 class="h6"><i class="bi bi-lightbulb-fill"></i> ${K.esc(K.t("plan.tips"))}</h3>
        <ul>${g.tips.map((x) => `<li>${K.esc(x)}</li>`).join("")}</ul></section>` : ""}
      ${g.checks && g.checks.length ? `<section class="k-checkbox"><h3 class="h6"><i class="bi bi-patch-check-fill"></i> ${K.esc(K.t("plan.checks"))}</h3>
        <ul>${g.checks.map((x) => `<li>${K.esc(x)}</li>`).join("")}</ul></section>` : ""}`;
  }

  // Tab clicks (call after putting render() into the page)
  function bind(root, ai) {
    root.querySelectorAll("[data-cat]").forEach((b) => {
      b.onclick = () => {
        tab = b.dataset.cat;
        const cats = categories(ai);
        root.querySelectorAll("[data-cat]").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.cat === tab)));
        root.querySelector(".k-catbody").innerHTML = catBody(cats.find((c) => c.id === tab));
      };
    });
  }

  // Text version for sharing (SMS, Messenger, etc.)
  function shareText(ai) {
    const head = `Komute: ${K.fmt.first(st().origin)} → ${K.fmt.first(st().destination)}`;
    if (!ai.guide) return head + "\n\n" + ai.plan;
    const lines = [head];
    const cats = categories(ai).filter((c) => c.available);
    cats.forEach((c) => {
      lines.push("", `[${K.t("cat." + c.id)}]`);
      c.options.forEach((o, i) => {
        lines.push(`${i + 1}. ${o.title}${o.duration ? " (" + o.duration + ")" : ""}${o.fare ? " " + o.fare : ""}`);
        o.steps.forEach((s) => {
          const sg = Array.isArray(s.signGroups) && s.signGroups.length > 1
            ? s.signGroups.map((g) => `${g.label}: ${g.signs.join(" OR ")}`).join(" OR ")
            : Array.isArray(s.signs) && s.signs.length ? s.signs.join(" OR ") : s.sign;
          lines.push(`- ${s.text}${sg ? ` [${sg}${s.via ? " via " + s.via : ""}]` : ""}${s.getOff && s.kind === "ride" ? ` → ${s.getOff}` : ""}`);
        });
      });
    });
    return lines.join("\n");
  }

  K.planView = { render, bind, shareText, normMode, MODE, setTab: (t) => { tab = t; }, tab: () => tab };
})(window.Komute);
