// Turns the AI plan text into option cards with a step-by-step timeline (like transit apps).
// Returns null when the text has no "Option N" parts, so the plain layout is used instead.
(function (K) {
  const clean = (s) => s.replace(/\*\*/g, "").replace(/^#+\s*/, "").trim();
  const STEPS = [
    [/board|start|begin|origin/i, "bi-geo-alt-fill", "Start here", "k-s-start"],
    [/vehicle|mode|ride|take/i, "bi-bus-front-fill", "Ride", "k-s-ride"],
    [/transfer/i, "bi-arrow-left-right", "Transfer", "k-s-transfer"],
    [/alight|get off|drop/i, "bi-box-arrow-down", "Get off", "k-s-off"],
    [/walk/i, "bi-person-walking", "Walk to your destination", "k-s-walk"]
  ];
  const MODES = [
    [/jeep|puv/i, "bi-truck-front", "Jeepney"], [/bus|carousel/i, "bi-bus-front", "Bus"],
    [/mrt|lrt|train/i, "bi-train-front", "Train"], [/tricycle|uv express|taxi|grab/i, "bi-car-front", "Other ride"]
  ];
  const kv = (s) => { const m = s.match(/^([^:]{3,40}):\s*(.+)$/); return m ? { label: m[1], text: m[2] } : null; };

  function parse(text) {
    const out = { intro: [], options: [], guide: [] };
    let cur = null, mode = "intro";
    for (const raw of String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      const item = clean(raw.replace(/^([-*\u2022]|\d+[.)])\s+/, ""));
      const line = clean(raw);
      if (/^option\s*\d+/i.test(line)) {
        cur = { no: out.options.length + 1, steps: [], notes: [],
          title: line.replace(/^option\s*\d+\s*[:.\-\u2013]?\s*/i, "") || line };
        out.options.push(cur); mode = "opt"; continue;
      }
      if (/guideline/i.test(line) && line.length < 60) { mode = "guide"; continue; }
      if (mode === "guide") out.guide.push(item);
      else if (mode === "opt") { const p = kv(item); p ? cur.steps.push(p) : cur.notes.push(item); }
      else out.intro.push(item);
    }
    return out;
  }

  function option(o) {
    const all = o.title + " " + o.steps.map((s) => s.text).join(" ");
    const chips = MODES.filter((m) => m[0].test(all)).map((m) =>
      `<span class="k-mode"><i class="bi ${m[1]}"></i> ${m[2]}</span>`).join("");
    const isGood = (s) => /advantage|benefit|pro/i.test(s.label);
    const isWarn = (s) => /verify|check|confirm/i.test(s.label);
    const line = o.steps.filter((s) => !isGood(s) && !isWarn(s)).map((s) => {
      const t = STEPS.find((x) => x[0].test(s.label)) || [0, "bi-circle-fill", s.label, ""];
      return `<li class="${t[3]}"><span class="k-tl-ic"><i class="bi ${t[1]}"></i></span>
        <div><div class="k-tl-lab">${K.esc(t[2])}</div><div>${K.esc(s.text)}</div></div></li>`;
    }).join("");
    const call = (s) => isGood(s)
      ? `<div class="k-call k-call-good"><strong><i class="bi bi-hand-thumbs-up-fill"></i> Why this option</strong><div>${K.esc(s.text)}</div></div>`
      : isWarn(s) ? `<div class="k-call k-call-warn"><strong><i class="bi bi-exclamation-triangle-fill"></i> Check before you go</strong><div>${K.esc(s.text)}</div></div>` : "";
    return `<details class="k-opt"${o.no === 1 ? " open" : ""}>
      <summary><span class="k-opt-no">${o.no}</span>
        <span><strong>${K.esc(o.title)}</strong><span class="k-modes">${chips}</span></span></summary>
      <ol class="k-tl">${line}</ol>${o.steps.map(call).join("")}
      ${o.notes.map((n) => `<p class="small text-muted mb-1">${K.esc(n)}</p>`).join("")}</details>`;
  }

  K.planCards = function (text) {
    const p = parse(text);
    if (!p.options.length) return null;
    const g = (x) => { const s = kv(x); return s ? `<strong>${K.esc(s.label)}:</strong> ${K.esc(s.text)}` : K.esc(x); };
    return (p.intro.length ? `<p class="k-intro">${K.esc(p.intro.join(" "))}</p>` : "") +
      p.options.map(option).join("") +
      (p.guide.length ? `<section class="k-guidebox"><h3 class="h5"><i class="bi bi-lightbulb-fill"></i> Tips for first-timers</h3>
        <ul>${p.guide.map((x) => `<li>${g(x)}</li>`).join("")}</ul></section>` : "");
  };
})(window.Komute);
