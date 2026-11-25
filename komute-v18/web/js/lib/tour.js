// Step-by-step guide for new users ("Show me around").
// - First visit, not signed in: a welcome card asks "Start the guide" or "Skip, use it now".
// - Part 1 (Plan screen): what each part does, ending at "Get my commute guide".
// - Part 2 starts by itself the first time a plan appears: tabs, the plan, where to ride, signboards, sharing.
// - Skip any time (button or Esc). Start again from the Guide screen or the "New here?" box.
// Saved on this device: komute.tour = "plan" | "results" | "done".
(function (K) {
  const $ = (s) => document.querySelector(s);
  const visible = (el) => { if (!el || !el.getClientRects().length) return false; const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
  // First matching element that is on screen (the header menu on computers, the bottom bar on phones)
  const pick = (sels) => { for (const s of [].concat(sels)) { const el = [...document.querySelectorAll(s)].find(visible); if (el) return el; } return null; };

  // Each step: target (CSS selector or list), title and text keys. Steps whose target is not on screen are skipped.
  const PLAN = [
    { sel: [".k-nav", ".k-tabbar"], key: "nav" },
    { sel: ["#themeBtn"], key: "theme", also: [".k-lang"] },
    { sel: ["#acctBtn"], key: "account" },
    { sel: ["#origin"], key: "origin", up: 1 },
    { sel: ["#btnLocate"], key: "locate" },
    { sel: ["#btnPinStart", "#btnPickStart"], key: "pin" },
    { sel: ["#destination"], key: "dest", up: 1 },
    { sel: ["#btnSwapHome"], key: "swap" },
    { sel: ["#planMapWrap"], key: "map" },
    { sel: ["#newCommuter"], key: "style", up: 1 },
    { sel: ["#btnFind"], key: "find", last: true }
  ];
  const RESULTS = [
    { sel: [".k-cats"], key: "tabs" },
    { sel: [".k-opt[open] > summary", ".k-opt > summary"], key: "option" },
    { sel: [".k-opt[open] .k-step-ride .k-board"], key: "board" },
    { sel: [".k-opt[open] .k-signwrap"], key: "signs" },
    { sel: [".k-opt[open] .k-choices"], key: "choices" },
    { sel: [".k-opt[open] .k-alight"], key: "alight" },
    { sel: ["#planTools"], key: "share" },
    { sel: ["#tripMap"], key: "tripmap" },
    { sel: [".k-nav", ".k-tabbar"], key: "more", last: true }
  ];

  let steps = [], idx = 0, part = "", ui = null, target = null;
  const stage = () => K.store.get("tour", "");
  const setStage = (v) => K.store.set("tour", v);

  function close() {
    if (ui) ui.remove();
    ui = null; target = null;
    window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (!ui) return;
    if (e.key === "Escape") skip();
    else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") back();
  }
  function skip() { setStage("done"); close(); }

  function frame() {
    close();
    ui = document.createElement("div");
    ui.className = "k-tour";
    ui.innerHTML = `<div class="k-tour-spot"></div><div class="k-tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle"></div>`;
    document.body.appendChild(ui);
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onKey);
  }

  // Welcome card: start the guide, or skip and use the app now
  function welcome() {
    frame();
    ui.classList.add("is-center");
    ui.querySelector(".k-tour-card").innerHTML = `
      <div class="k-tour-logo"><i class="bi bi-signpost-2-fill"></i></div>
      <h2 id="tourTitle" class="h5">${K.esc(K.t("tour.welcomeTitle"))}</h2>
      <p>${K.esc(K.t("tour.welcomeText"))}</p>
      <div class="k-tour-actions k-tour-actions-col">
        <button type="button" class="btn btn-primary" data-tour="start"><i class="bi bi-play-circle"></i> ${K.esc(K.t("tour.start"))}</button>
        <button type="button" class="btn btn-outline-secondary" data-tour="skip">${K.esc(K.t("tour.skipNow"))}</button>
      </div>
      <p class="k-tour-small">${K.esc(K.t("tour.later"))}</p>`;
    ui.querySelector('[data-tour="start"]').onclick = () => run("plan");
    ui.querySelector('[data-tour="skip"]').onclick = skip;
    ui.querySelector('[data-tour="start"]').focus();
  }

  function run(which) {
    part = which;
    if (which === "plan" && location.hash && location.hash !== "#plan") location.hash = "#plan";
    setStage(which);
    steps = (which === "plan" ? PLAN : RESULTS).map((s) => ({ ...s, el: pick(s.sel) })).filter((s) => s.el);
    idx = 0;
    if (!steps.length) return which === "plan" ? setStage("results") : skip();
    frame();
    show();
  }

  function show() {
    const s = steps[idx];
    target = s.el;
    if (s.up) { let t = s.el; for (let n = 0; n < s.up && t.parentElement; n++) t = t.parentElement; target = t; }
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    const total = steps.length, n = idx + 1;
    const partLabel = K.t(part === "plan" ? "tour.part1" : "tour.part2");
    ui.querySelector(".k-tour-card").innerHTML = `
      <div class="k-tour-count">${K.esc(partLabel)} · ${K.esc(K.t("tour.count", { n, total }))}</div>
      <h2 id="tourTitle" class="h6">${K.esc(K.t(`tour.${s.key}.t`))}</h2>
      <p>${K.esc(K.t(`tour.${s.key}.d`))}</p>
      <div class="k-tour-dots" aria-hidden="true">${steps.map((_, i) => `<span class="${i === idx ? "on" : ""}"></span>`).join("")}</div>
      <div class="k-tour-actions">
        <button type="button" class="btn btn-link btn-sm" data-tour="skip">${K.esc(K.t("tour.skip"))}</button>
        <span class="flex-grow-1"></span>
        ${idx > 0 ? `<button type="button" class="btn btn-outline-secondary btn-sm" data-tour="back">${K.esc(K.t("tour.back"))}</button>` : ""}
        <button type="button" class="btn btn-primary btn-sm" data-tour="next">${K.esc(K.t(s.last ? (part === "plan" ? "tour.gotIt" : "tour.finish") : "tour.next"))}</button>
      </div>`;
    ui.querySelector('[data-tour="skip"]').onclick = skip;
    ui.querySelector('[data-tour="next"]').onclick = next;
    const b = ui.querySelector('[data-tour="back"]'); if (b) b.onclick = back;
    ui.querySelector('[data-tour="next"]').focus({ preventScroll: true });
    // place now and again after the smooth scroll settles
    place(); setTimeout(place, 350); setTimeout(place, 700);
  }
  function next() {
    if (idx < steps.length - 1) { idx++; return show(); }
    // End of part 1: part 2 starts by itself when the first plan appears. End of part 2: done.
    if (part === "plan") { setStage("results"); close(); }
    else { setStage("done"); done(); }
  }
  function back() { if (idx > 0) { idx--; show(); } }

  function done() {
    frame();
    ui.classList.add("is-center");
    ui.querySelector(".k-tour-card").innerHTML = `
      <div class="k-tour-logo"><i class="bi bi-check2-circle"></i></div>
      <h2 id="tourTitle" class="h5">${K.esc(K.t("tour.doneTitle"))}</h2>
      <p>${K.esc(K.t("tour.doneText"))}</p>
      <div class="k-tour-actions"><span class="flex-grow-1"></span><button type="button" class="btn btn-primary" data-tour="close">${K.esc(K.t("tour.close"))}</button></div>`;
    ui.querySelector('[data-tour="close"]').onclick = close;
    ui.querySelector('[data-tour="close"]').focus();
  }

  // Spotlight around the target and the card next to it (below, or above when there is no room; at the bottom on phones)
  function place() {
    if (!ui || ui.classList.contains("is-center") || !target) return;
    const r = target.getBoundingClientRect(), pad = 6;
    const spot = ui.querySelector(".k-tour-spot"), card = ui.querySelector(".k-tour-card");
    Object.assign(spot.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const vw = window.innerWidth, vh = window.innerHeight, ch = card.offsetHeight || 200;
    if (vw < 576) {
      // phones: full width, at the bottom, or at the top when the highlighted part is low on the screen
      const low = r.bottom > vh - ch - 28;
      Object.assign(card.style, { left: "12px", width: `${vw - 24}px`, top: low ? "12px" : `${vh - ch - 12}px` });
      return;
    }
    const cw = Math.min(360, vw - 24);
    card.style.width = `${cw}px`;
    let top = r.bottom + 14;
    if (top + ch > vh - 12) top = r.top - ch - 14;
    if (top < 12) top = Math.max(12, vh - ch - 12); // no room above or below: keep it on screen
    const left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), vw - cw - 12);
    Object.assign(card.style, { top: `${top}px`, left: `${left}px` });
  }

  // Shown once, to people who are new (first visit and not signed in)
  function maybeStart() {
    if (stage()) return;
    const acc = K.account && K.account.info ? K.account.info() : null;
    if (acc && acc.signedIn) { setStage("done"); return; }
    if ((location.hash || "#plan") !== "#plan") return;
    welcome();
  }

  K.tour = {
    // Start from the beginning (button on the Guide screen and in the "New here?" box)
    start() { setStage(""); run("plan"); },
    // Part 2, the first time a plan appears after part 1
    onResults() { if (stage() === "results") setTimeout(() => { if (stage() === "results" && !ui) run("results"); }, 900); },
    init() { setTimeout(maybeStart, 1500); },
    skip
  };
})(window.Komute);
