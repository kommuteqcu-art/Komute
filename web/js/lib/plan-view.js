// Shows the AI commute guide as easy step cards: where to ride, which signboard to look for, where to get off.
(function (K) {
  const MODE = {
    walk: ["bi-person-walking", "#56635f"], jeepney: ["bi-truck-front", "#b45309"], modern_jeepney: ["bi-truck-front-fill", "#0e7490"],
    bus: ["bi-bus-front", "#1d4ed8"], carousel: ["bi-bus-front-fill", "#7c3aed"], qcity_bus: ["bi-gift", "#15803d"],
    uv_express: ["bi-car-front", "#9d174d"], tricycle: ["bi-bicycle", "#a16207"], mrt3: ["bi-train-front", "#2563eb"],
    lrt1: ["bi-train-lightrail-front", "#16a34a"], lrt2: ["bi-train-lightrail-front", "#7e22ce"], taxi: ["bi-taxi-front", "#ca8a04"],
    tnvs: ["bi-phone", "#047857"], mc_taxi: ["bi-scooter", "#be123c"]
  };
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
    if (/trike|tricycle/.test(m)) return "tricycle";
    if (/angkas|joyride|move_?it|motor|mc/.test(m)) return "mc_taxi";
    if (/grab|tnvs/.test(m)) return "tnvs";
    if (/taxi/.test(m)) return "taxi";
    if (/walk|lakad/.test(m)) return "walk";
    return "";
  }
  const KIND_ICON = { start: "bi-geo-alt-fill", walk: "bi-person-walking", ride: "bi-arrow-up-right-circle-fill", transfer: "bi-arrow-left-right", getoff: "bi-box-arrow-down", arrive: "bi-flag-fill" };
  const modeName = (m) => K.t("mode." + m);
  const chip = (m) => { const x = MODE[m]; return x ? `<span class="k-mode" style="--mc:${x[1]}"><i class="bi ${x[0]}"></i> ${K.esc(modeName(m))}</span>` : ""; };

  function step(s) {
    const mode = normMode(s.mode);
    const kind = KIND_ICON[s.kind] ? s.kind : (mode && mode !== "walk" ? "ride" : mode === "walk" ? "walk" : "start");
    const m = MODE[mode];
    const icon = kind === "ride" && m ? m[0] : KIND_ICON[kind];
    const color = kind === "ride" && m ? m[1] : "";
    return `<li class="k-step-${kind}">
      <span class="k-tl-ic"${color ? ` style="background:${color}"` : ""}><i class="bi ${icon}"></i></span>
      <div class="k-tl-body">
        <div class="k-tl-lab">${K.esc(K.t("step." + kind))}${kind === "ride" && mode ? ` · ${K.esc(modeName(mode))}` : ""}${s.fare ? ` <span class="k-fare-chip">${K.esc(s.fare)}</span>` : ""}</div>
        <div class="k-tl-text">${K.esc(s.text)}</div>
        ${s.where ? `<div class="k-board"><i class="bi bi-geo-alt-fill"></i><div><b>${K.esc(K.t(kind === "ride" ? "step.rideHere" : "step.where"))}</b> ${K.esc(s.where)}</div></div>` : ""}
        ${s.sign ? `<div class="k-signwrap"><span class="k-signcap">${K.esc(K.t("step.lookSign"))}</span><span class="k-sign">${K.esc(s.sign)}</span></div>` : ""}
        ${s.getOff ? `<div class="k-alight"><i class="bi bi-sign-stop-fill"></i><div><b>${K.esc(K.t("step.getOffAt"))}</b> ${K.esc(s.getOff)}</div></div>` : ""}
        ${s.tip ? `<div class="k-tl-tip"><i class="bi bi-lightbulb"></i> ${K.esc(s.tip)}</div>` : ""}
      </div></li>`;
  }

  function option(o, i) {
    const modes = [...new Set([...(o.modes || []), ...o.steps.map((s) => s.mode)].map(normMode).filter((m) => m && m !== "walk"))];
    const tagKey = { cheapest: "tag.cheapest", fastest: "tag.fastest", easiest: "tag.easiest", "fewest transfers": "tag.fewest" }[String(o.tag || "").toLowerCase()];
    return `<details class="k-opt"${i === 0 ? " open" : ""}>
      <summary>
        <span class="k-opt-no">${i + 1}</span>
        <span class="k-opt-head">
          <span class="k-opt-title">${K.esc(o.title)}${tagKey ? ` <span class="k-tag">${K.esc(K.t(tagKey))}</span>` : ""}</span>
          <span class="k-modes">${modes.map(chip).join("")}</span>
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

  function render(ai) {
    let g = ai.guide;
    if ((!g || !g.options) && /^\s*(```|\{)/.test(ai.plan || "")) {
      const fixed = repairJson(ai.plan);
      if (fixed && Array.isArray(fixed.options)) {
        g = { summary: fixed.summary || "", outsideArea: fixed.outsideArea || "", tips: fixed.tips || [], checks: fixed.checks || [],
          options: fixed.options.map((o) => ({ ...o, steps: (o.steps || []).filter((st) => st && st.text) })).filter((o) => o.title && o.steps.length) };
        ai.guide = g;
      } else {
        return `<div class="alert k-warn"><i class="bi bi-exclamation-circle"></i> ${K.esc(K.t("plan.unreadable"))}</div>
          <button type="button" class="btn btn-primary" onclick="Komute.app.requestPlan()"><i class="bi bi-arrow-clockwise"></i> ${K.esc(K.t("res.retry"))}</button>`;
      }
    }
    if (!g || !g.options || !g.options.length) return K.planCards(ai.plan) || `<div class="k-plan">${K.planToHtml(ai.plan)}</div>`;
    return `${g.summary ? `<p class="k-intro">${K.esc(g.summary)}</p>` : ""}
      ${g.outsideArea ? `<div class="alert k-warn small"><i class="bi bi-exclamation-circle"></i> ${K.esc(g.outsideArea)}</div>` : ""}
      ${g.options.map(option).join("")}
      ${g.tips && g.tips.length ? `<section class="k-guidebox mb-3"><h3 class="h6"><i class="bi bi-lightbulb-fill"></i> ${K.esc(K.t("plan.tips"))}</h3>
        <ul>${g.tips.map((x) => `<li>${K.esc(x)}</li>`).join("")}</ul></section>` : ""}
      ${g.checks && g.checks.length ? `<section class="k-checkbox"><h3 class="h6"><i class="bi bi-patch-check-fill"></i> ${K.esc(K.t("plan.checks"))}</h3>
        <ul>${g.checks.map((x) => `<li>${K.esc(x)}</li>`).join("")}</ul></section>` : ""}`;
  }

  // Text version for sharing (SMS, Messenger, etc.)
  function shareText(ai, S) {
    const head = `Komute: ${K.fmt.first(S.origin)} → ${K.fmt.first(S.destination)}`;
    if (!ai.guide) return head + "\n\n" + ai.plan;
    const lines = [head];
    ai.guide.options.forEach((o, i) => {
      lines.push("", `${i + 1}. ${o.title}${o.duration ? " (" + o.duration + ")" : ""}${o.fare ? " " + o.fare : ""}`);
      o.steps.forEach((s) => lines.push(`- ${s.text}${s.sign ? ` [${s.sign}]` : ""}${s.getOff ? ` → ${s.getOff}` : ""}`));
    });
    return lines.join("\n");
  }

  K.planView = { render, shareText, normMode, MODE };
})(window.Komute);
