// Sign in, free route plans left, and paying for unlimited plans (₱10/month or ₱99/year with GCash, Maya or QR Ph).
// The account entry remains available when this server has accounts switched off.
(function (K) {
  const $ = (id) => document.getElementById(id);
  const cfg = window.KOMUTE_CONFIG || {};
  const base = (cfg.API_BASE || "").replace(/\/$/, "");
  const googleFlowKey = "komute.googleSignIn";
  const googleCallback = "/auth/callback";
  const inApp = /KomuteApp/i.test(navigator.userAgent);
  // Inside the Android app the sign-in runs in the phone's browser, so the saved sign-in details must survive in the app itself.
  const flowStore = () => (inApp ? localStorage : sessionStorage);
  let info = { billing: null };   // last answer from /api/account
  let modal = null, mode = "login"; // "login" | "signup"

  // ---------- session (kept on this phone) ----------
  // "Keep me signed in" ticked: the sign-in stays on this phone. Unticked: it is forgotten when the browser or app is closed.
  const keepOn = () => K.store.get("keepSignedIn", true) !== false;
  const getSession = () => {
    const kept = K.store.get("session", null);
    if (kept) return kept;
    try { return JSON.parse(sessionStorage.getItem("komute.session")); } catch { return null; }
  };
  const setSession = (s) => {
    const keep = keepOn();
    K.store.set("session", s && keep ? s : null);
    try { if (s && !keep) sessionStorage.setItem("komute.session", JSON.stringify(s)); else sessionStorage.removeItem("komute.session"); } catch { /* storage unavailable */ }
  };

  async function call(path, body, withToken = true) {
    const headers = { "Content-Type": "application/json" };
    const s = getSession();
    if (withToken && s && s.accessToken) headers.Authorization = "Bearer " + s.accessToken;
    const d = K.deviceId(); if (d) headers["X-Komute-Device"] = d;
    let res;
    try { res = await fetch(base + path, { method: "POST", headers, body: JSON.stringify(body || {}) }); }
    catch { throw Object.assign(new Error(K.t("err.backend")), { code: "network" }); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || "HTTP " + res.status), { code: data.code, status: res.status });
    return data;
  }

  // A fresh token for API calls (refreshed a little before it expires). Returns "" when signed out.
  async function token() {
    const s = getSession();
    if (!s || !s.accessToken) return "";
    if (s.expiresAt && s.expiresAt - Date.now() < 120000 && s.refreshToken) {
      try { const r = await call("/api/auth/refresh", { refreshToken: s.refreshToken }, false); setSession(r.session); return r.session.accessToken; }
      catch (e) { if (e.code === "login") { setSession(null); return ""; } }
    }
    return s.accessToken;
  }
  async function forceRefresh() {
    const s = getSession();
    if (!s || !s.refreshToken) { setSession(null); return false; }
    try { const r = await call("/api/auth/refresh", { refreshToken: s.refreshToken }, false); setSession(r.session); return true; }
    catch { setSession(null); return false; }
  }

  async function load() {
    try { await token(); info = await call("/api/account", {}); }
    catch (e) {
      if (e.code === "expired" && (await forceRefresh())) { try { info = await call("/api/account", {}); } catch { /* keep old */ } }
      else if (e.code === "expired") info = { ...info, billing: true, signedIn: false };
      else {
        // The server answered with an error (for example a database table is missing). Keep the Sign in button visible and say why.
        console.warn("Account check failed:", e.message);
        info = { ...info, billing: true, loadError: e.message };
      }
    }
    if (info && info.deviceLocked) { setSession(null); info = { ...info, loadError: info.deviceLocked }; }
    paint();
    return info;
  }

  // Called after every route plan with the account the server sent back
  function update(acc) {
    if (!acc) return;
    info = { ...info, billing: true, signedIn: true, ...acc };
    paint();
  }

  const fmtDate = (iso) => new Date(iso).toLocaleDateString(K.lang === "tl" ? "fil-PH" : "en-PH", { month: "short", day: "numeric", year: "numeric" });

  // ---------- header button ----------
  function paint() {
    const btn = $("acctBtn");
    if (!btn) return;
    let icon = "bi-person-circle", text = K.t("acct.signIn");
    if (info.signedIn && info.premium) { icon = "bi-star-fill"; text = K.t("acct.unlimited"); }
    else if (info.signedIn) { icon = "bi-person-check-fill"; text = K.t("acct.freeShort", { n: info.freeLeft }); }
    btn.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i><span>${K.esc(text)}</span>`;
    btn.setAttribute("aria-label", text);
    btn.title = text;
    btn.classList.toggle("k-acct-premium", Boolean(info.premium));
    // "Go unlimited" bar under the Find button: anyone signed in without Unlimited can subscribe right away, even with free plans left
    const bar = $("upgradeBar");
    if (bar) {
      const show = Boolean(info.billing && info.signedIn && !info.premium && (info.payMode === "paymongo" || info.payMode === "manual"));
      bar.classList.toggle("d-none", !show);
      if (show) {
        $("upgradeText").textContent = K.t("acct.freeLeft", { n: info.freeLeft, t: info.freeLimit });
        $("upgradeLabel").textContent = K.t("acct.goUnlimited", { m: info.prices.month });
      }
    }
    if (modal && $("acctModal").classList.contains("show")) render();
  }

  // ---------- the account window ----------
  function open(reason) {
    if (!$("acctModal")) return;
    if (!modal) modal = bootstrap.Modal.getOrCreateInstance($("acctModal"));
    $("acctReason").textContent = reason || "";
    $("acctReason").classList.toggle("d-none", !reason);
    status("");
    render();
    modal.show();
    if (info && (info.manualPending || info.request)) pollPending(true);
  }
  function status(msg, kind) {
    const el = $("acctStatus");
    el.textContent = msg || "";
    el.className = "small mt-2 " + (kind === "ok" ? "text-success" : kind === "err" ? "text-danger" : "text-muted");
  }

  function render() {
    const body = $("acctBody");
    if (info.billing !== true) {
      $("acctTitle").textContent = K.t("acct.signIn");
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
      body.innerHTML = `<p class="text-muted mb-0" role="status">${K.esc(K.t(info.billing === null ? "acct.wait" : "acct.unavailable"))}</p>`;
      if (info.billing === false && local) {
        body.insertAdjacentHTML("beforeend", `<a class="btn btn-primary mt-3" href="https://komute.onrender.com/">${K.esc(K.t("acct.openLive"))}</a>`);
      }
      return;
    }
    if (mode === "forgot" || mode === "reset") { renderReset(); return; }
    if (!info.signedIn) {
      $("acctTitle").textContent = K.t(mode === "signup" ? "acct.create" : "acct.signIn");
      body.innerHTML = `${info.loadError ? `<div class="alert alert-warning small">${K.esc(info.loadError)}</div>` : ""}<p class="small text-muted">${K.esc(K.t("acct.why", { n: info.freeLimit || 5, m: info.prices?.month ?? 10, y: info.prices?.year ?? 99 }))}</p>
        ${info.google ? `<button type="button" class="k-google-signin w-100" id="acctGoogle">
          <img src="/assets/google-signin.png" width="20" height="20" alt="">
          <span>${K.esc(K.t("acct.google"))}</span>
        </button>
        <div class="k-auth-divider"><span>${K.esc(K.t("acct.orEmail"))}</span></div>` : ""}
        <form id="acctForm" novalidate>
          <label class="form-label fw-semibold" for="acctEmail">${K.esc(K.t("acct.email"))}</label>
          <input id="acctEmail" type="email" class="form-control mb-3" autocomplete="email" required>
          <label class="form-label fw-semibold" for="acctPass">${K.esc(K.t("acct.password"))}</label>
          <div class="k-passwrap mb-3">
            <input id="acctPass" type="password" class="form-control" minlength="6" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" required>
            <button type="button" class="k-passeye" id="acctEye" aria-label="Show password" aria-pressed="false">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="k-eye-open" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle class="k-eye-open" cx="12" cy="12" r="3"/><path class="k-eye-off" d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.2-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>
            </button>
          </div>
          <div class="d-flex justify-content-between align-items-center gap-2 mb-3 k-passmeta">
            <div class="form-check m-0"><input class="form-check-input" type="checkbox" id="acctKeep"${keepOn() ? " checked" : ""}><label class="form-check-label small" for="acctKeep">${K.esc(K.t("acct.keep"))}</label></div>
            ${mode === "login" ? `<button type="button" class="btn btn-link btn-sm p-0 k-forgot" id="acctForgot">${K.esc(K.t("acct.forgot"))}</button>` : ""}
          </div>
          <button class="btn btn-primary w-100" type="submit">${K.esc(K.t(mode === "signup" ? "acct.create" : "acct.signIn"))}</button>
        </form>
        <button type="button" class="btn btn-link w-100 mt-2" id="acctSwitch">${K.esc(K.t(mode === "signup" ? "acct.haveAccount" : "acct.noAccount"))}</button>`;
      $("acctSwitch").onclick = () => { mode = mode === "signup" ? "login" : "signup"; status(""); render(); };
      $("acctForm").onsubmit = submitLogin;
      if ($("acctKeep")) $("acctKeep").onchange = () => K.store.set("keepSignedIn", $("acctKeep").checked);
      if ($("acctForgot")) $("acctForgot").onclick = () => { mode = "forgot"; status(""); render(); };
      if ($("acctGoogle")) $("acctGoogle").onclick = startGoogle;
      wireEye();
      return;
    }
    $("acctTitle").textContent = K.t("acct.title");
    const line = info.premium
      ? `<div class="k-acct-badge premium"><i class="bi bi-star-fill"></i> ${K.esc(K.t("acct.premiumUntil", { d: fmtDate(info.paidUntil) }))}</div>`
      : `<div class="k-acct-badge"><i class="bi bi-ticket-perforated"></i> ${K.esc(K.t("acct.freeLeft", { n: info.freeLeft, t: info.freeLimit }))}</div>`;
    const pay = info.payMode === "manual" ? manualHtml() : info.paymentsOn ? `
      <h3 class="h6 mt-3">${K.esc(K.t(info.premium ? "acct.extend" : "acct.getUnlimited"))}</h3>
      <div class="k-plans">
        <button type="button" class="k-plan" data-plan="month"><span class="k-plan-price">₱${info.prices.month}</span><span>${K.esc(K.t("acct.perMonth"))}</span></button>
        <button type="button" class="k-plan" data-plan="year"><span class="k-plan-price">₱${info.prices.year}</span><span>${K.esc(K.t("acct.perYear"))}</span></button>
      </div>
      <p class="small text-muted mt-2 mb-0"><i class="bi bi-shield-lock"></i> ${K.esc(K.t("acct.payNote"))}</p>`
      : `<p class="small text-muted mt-3">${K.esc(K.t("acct.payOff"))}</p>`;
    body.innerHTML = `<div class="small text-muted mb-2">${K.esc(K.t("acct.signedInAs", { e: info.email }))}</div>${line}${pay}
      <div class="d-flex flex-wrap align-items-center gap-3 mt-3">
        <button type="button" class="btn btn-outline-secondary btn-sm" id="acctOut"><i class="bi bi-box-arrow-right"></i> ${K.esc(K.t("acct.signOut"))}</button>
        <button type="button" class="btn btn-link btn-sm text-danger p-0" id="acctDel">${K.esc(K.t("acct.delete"))}</button>
      </div>
      <div class="alert alert-danger small mt-3 mb-0 d-none" id="acctDelBox">
        <div class="fw-bold mb-1">${K.esc(K.t("acct.deleteWhat"))}</div>${K.esc(K.t("acct.deleteInfo"))}
        <div class="d-flex gap-2 mt-2"><button type="button" class="btn btn-danger btn-sm" id="acctDelYes">${K.esc(K.t("acct.deleteYes"))}</button><button type="button" class="btn btn-light btn-sm" id="acctDelNo">${K.esc(K.t("acct.cancel"))}</button></div>
      </div>`;
    $("acctDel").onclick = () => $("acctDelBox").classList.remove("d-none");
    $("acctDelNo").onclick = () => $("acctDelBox").classList.add("d-none");
    $("acctDelYes").onclick = async (e) => {
      // Instant: sign out on this device right away and let the server close the account in the background.
      // Nothing is lost if that request is slow or fails, because deleting keeps all the data anyway.
      const s0 = getSession();
      const headers = { "Content-Type": "application/json", Authorization: "Bearer " + (s0 && s0.accessToken || "") };
      const d = K.deviceId(); if (d) headers["X-Komute-Device"] = d;
      try { fetch(base + "/api/account/delete", { method: "POST", headers, body: "{}", keepalive: true }).catch(() => {}); } catch { /* ignore */ }
      setSession(null); info = { ...info, signedIn: false, premium: false }; mode = "login"; paint(); render(); lockPlan(); status(K.t("acct.deleted"), "ok");
      call("/api/account", {}).then((fresh) => { info = { ...info, ...fresh }; render(); status(K.t("acct.deleted"), "ok"); }).catch(() => {}); // fill in the Google button
    };
    body.querySelectorAll("[data-plan]").forEach((b) => b.onclick = () => buy(b.dataset.plan, b));
    body.querySelectorAll("[data-mplan]").forEach((b) => b.onclick = () => { manualPlan = b.dataset.mplan; render(); });
    if ($("manualSend")) $("manualSend").onclick = sendManual;
    if ($("reqBtn")) $("reqBtn").onclick = () => { payShown = true; render(); };
    if ($("reqLeft")) tickLeft();
    if ($("openGcash")) $("openGcash").onclick = openGcash;
    if ($("copyNo")) $("copyNo").onclick = async () => { try { await navigator.clipboard.writeText(String((info.manual || {}).number || "").replace(/\s+/g, "")); status(K.t("acct.copied"), "ok"); } catch { status(String((info.manual || {}).number || ""), "ok"); } };
    if ($("manualCheck")) $("manualCheck").onclick = async () => { status(K.t("acct.wait")); await load(); status(paidNow() ? K.t("acct.thanks") : K.t("acct.stillPending")); };
    $("acctOut").onclick = async () => {
      setSession(null); info = { ...info, signedIn: false, premium: false }; mode = "login"; paint(); render(); lockPlan(); status(K.t("acct.signedOut"));
      // ask the server again so the sign-in box has the Google button (and the plan prices) after signing out
      try { const fresh = await call("/api/account", {}); info = { ...info, ...fresh }; render(); } catch { /* keep what we have */ }
    };
  }

  // ---------- manual payment: pay your GCash/Maya/bank, send the reference number, the owner approves ----------
  let manualPlan = "month";
  let payShown = false; // the payment box opens after "Get my payment amount"
  let qrOpen = null; // null = decide by device: shown on a computer, hidden on a phone until asked
  function manualHtml() {
    if ((info.manual || {}).verify) return verifyHtml();
    const m = info.manual || {}, price = info.prices[manualPlan];
    const row = (label, v) => v ? `<div class="k-pay-row"><span class="text-muted">${K.esc(label)}</span><b>${K.esc(v)}</b></div>` : "";
    return `<h3 class="h6 mt-3">${K.esc(K.t(info.premium ? "acct.extend" : "acct.getUnlimited"))}</h3>
      <div class="k-plans">
        <button type="button" class="k-plan${manualPlan === "month" ? " on" : ""}" data-mplan="month" aria-pressed="${manualPlan === "month"}"><span class="k-plan-price">₱${info.prices.month}</span><span>${K.esc(K.t("acct.perMonth"))}</span></button>
        <button type="button" class="k-plan${manualPlan === "year" ? " on" : ""}" data-mplan="year" aria-pressed="${manualPlan === "year"}"><span class="k-plan-price">₱${info.prices.year}</span><span>${K.esc(K.t("acct.perYear"))}</span></button>
      </div>
      <div class="k-paybox mt-3">
        <div class="fw-bold mb-2">1. ${K.esc(K.t("acct.manualPay", { p: price }))}</div>
        ${row(K.t("acct.payVia"), m.method)}${row(K.t("acct.accName"), m.name)}${row(K.t("acct.accNo"), m.number)}
        ${/gcash/i.test(m.method || "") ? `<div class="d-flex gap-2 mt-2"><button type="button" class="btn btn-success flex-fill" id="openGcash"><i class="bi bi-phone"></i> ${K.esc(K.t("acct.openGcash"))}</button>
          ${m.number ? `<button type="button" class="btn btn-outline-secondary" id="copyNo" title="${K.esc(K.t("acct.copy"))}"><i class="bi bi-clipboard"></i></button>` : ""}</div>
          <div class="small text-muted mt-1">${K.esc(K.t("acct.sendExact", { p: price }))}</div>` : ""}
        ${(manualPlan === "year" ? m.qrYear : m.qrMonth) ? `<img class="k-payqr" src="${K.esc(manualPlan === "year" ? m.qrYear : m.qrMonth)}" alt="QR code ₱${price}"><div class="small text-center text-muted">${K.esc(K.t("acct.qrAmount", { p: price }))}</div>`
          : m.qr ? `<img class="k-payqr" src="${K.esc(m.qr)}" alt="QR code"><div class="small text-center text-muted">${K.esc(K.t("acct.sendExact", { p: price }))}</div>` : ""}
        ${m.note ? `<div class="small mt-1">${K.esc(m.note)}</div>` : ""}
        <div class="fw-bold mt-3 mb-1">2. ${K.esc(K.t("acct.manualRef"))}</div>
        <input id="manualRef" class="form-control" maxlength="40" autocomplete="off" placeholder="${K.esc(K.t("acct.refPh"))}">
        <button type="button" class="btn btn-primary w-100 mt-2" id="manualSend">${K.esc(K.t(m.instant ? "acct.submitRefNow" : "acct.submitRef"))}</button>
      </div>
      ${info.rejected ? `<div class="alert alert-danger small mt-3 mb-0"><i class="bi bi-x-octagon"></i> ${K.esc(K.t("acct.rejected", { r: info.rejected }))}</div>` : ""}
      ${info.manualPending ? `<div class="alert k-info small mt-3 mb-0"><i class="bi bi-hourglass-split"></i> ${K.esc(K.t("acct.pending", { n: info.manualPending }))}
        <button type="button" class="btn btn-link btn-sm p-0 ms-1" id="manualCheck">${K.esc(K.t("acct.checkAgain"))}</button></div>` : ""}`;
  }

  // ---------- automatic payment: each person gets their own amount (₱10.37), no reference number needed ----------
  const peso = (n) => "₱" + Number(n).toFixed(2);
  function verifyHtml() {
    const m = info.manual || {}, req = info.request && info.request.plan === manualPlan ? info.request : null;
    const row = (label, v) => v ? `<div class="k-pay-row"><span class="text-muted">${K.esc(label)}</span><b>${K.esc(v)}</b></div>` : "";
    const tiles = `<h3 class="h6 mt-3">${K.esc(K.t(info.premium ? "acct.extend" : "acct.getUnlimited"))}</h3>
      <div class="k-plans">
        <button type="button" class="k-plan${manualPlan === "month" ? " on" : ""}" data-mplan="month" aria-pressed="${manualPlan === "month"}"><span class="k-plan-price">₱${info.prices.month}</span><span>${K.esc(K.t("acct.perMonth"))}</span></button>
        <button type="button" class="k-plan${manualPlan === "year" ? " on" : ""}" data-mplan="year" aria-pressed="${manualPlan === "year"}"><span class="k-plan-price">₱${info.prices.year}</span><span>${K.esc(K.t("acct.perYear"))}</span></button>
      </div>`;
    const ref = `<details class="mt-3 small"><summary class="text-muted">${K.esc(K.t("acct.haveRef"))}</summary>
      <input id="manualRef" class="form-control mt-2" maxlength="40" autocomplete="off" placeholder="${K.esc(K.t("acct.refPh"))}">
      <button type="button" class="btn btn-outline-primary w-100 mt-2" id="manualSend">${K.esc(K.t("acct.submitRef2"))}</button></details>`;
    // Fixed price (₱10 or ₱99, no extra centavos). One button opens the payment box; the QR shows at once as the other way to pay.
    const price = info.prices[manualPlan];
    const qr = (manualPlan === "year" ? m.qrYear : m.qrMonth) || m.qr;
    if (!payShown) return `${tiles}<button type="button" class="btn btn-primary w-100 mt-3" id="reqBtn"><i class="bi bi-qr-code"></i> ${K.esc(K.t("acct.getAmount"))}</button>
      <p class="small text-muted mt-2 mb-0">${K.esc(K.t("acct.amountWhy"))}</p>`;
    return `${tiles}<div class="k-paybox mt-3 text-center">
        <div class="small text-muted">${K.esc(K.t("acct.sendExactly"))}</div>
        <div class="k-reqamt" id="reqAmt">₱${price}</div>
        <div class="small text-danger fw-bold">${K.esc(K.t("acct.exactFixed", { p: price }))}</div>
        <div class="text-start mt-2">${row(K.t("acct.payVia"), m.method)}${row(K.t("acct.accName"), m.name)}${row(K.t("acct.accNo"), m.number)}</div>
        <div class="d-flex gap-2 mt-2"><button type="button" class="btn btn-success flex-fill" id="openGcash"><i class="bi bi-phone"></i> ${K.esc(K.t("acct.openGcash"))}</button>
          ${m.number ? `<button type="button" class="btn btn-outline-secondary" id="copyNo" title="${K.esc(K.t("acct.copy"))}"><i class="bi bi-clipboard"></i></button>` : ""}</div>
        <div class="k-qrpanel mt-3"><div class="fw-bold small">${K.esc(K.t("acct.scanInstead"))}</div>
          ${qr ? `<img class="k-payqr" src="${K.esc(qr)}" alt="QR code ₱${price}"><div class="small text-muted mt-1">${K.esc(K.t("acct.qrHowFixed", { p: price }))}</div><a class="small" href="${K.esc(qr)}" download="komute-gcash-qr.png"><i class="bi bi-download"></i> ${K.esc(K.t("acct.saveQr"))}</a>` : `<div class="small text-muted mt-1">${K.esc(K.t("acct.noQr"))}</div>`}</div>
        <div class="fw-bold mt-3 mb-1 text-start">${K.esc(K.t("acct.manualRef"))}</div>
        <input id="manualRef" class="form-control" maxlength="40" autocomplete="off" placeholder="${K.esc(K.t("acct.refPh"))}">
        <button type="button" class="btn btn-primary w-100 mt-2" id="manualSend">${K.esc(K.t("acct.submitRef2"))}</button>
      </div>
      ${info.rejected ? `<div class="alert alert-danger small mt-3 mb-0"><i class="bi bi-x-octagon"></i> ${K.esc(K.t("acct.rejected", { r: info.rejected }))}</div>` : ""}
      ${info.manualPending ? `<div class="alert k-info small mt-3 mb-0"><i class="bi bi-hourglass-split"></i> ${K.esc(K.t("acct.pending", { n: info.manualPending }))}
        <button type="button" class="btn btn-link btn-sm p-0 ms-1" id="manualCheck">${K.esc(K.t("acct.checkAgain"))}</button></div>` : ""}`;
  }
  async function getAmount() {
    const btn = $("reqBtn"); btn.disabled = true; status(K.t("acct.wait"));
    try {
      await token();
      const r = await call("/api/pay/request", { plan: manualPlan });
      info = { ...info, request: r.request };
      render(); status(""); pollPending(); tickLeft();
    } catch (e) { status(e.message, "err"); btn.disabled = false; }
  }
  let leftTimer = null;
  function tickLeft() {
    clearInterval(leftTimer);
    const draw = () => {
      const el = $("reqLeft"); if (!el || !info.request) return clearInterval(leftTimer);
      const s = Math.max(0, Math.round((new Date(info.request.expiresAt) - Date.now()) / 1000));
      el.textContent = `(${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")})`;
      if (!s) { clearInterval(leftTimer); info = { ...info, request: null }; render(); status(K.t("acct.reqExpired"), "err"); }
    };
    draw(); leftTimer = setInterval(draw, 1000);
  }

  // Opens the GCash app on a phone (it cannot fill in the amount, so the screen says how much to send). Elsewhere, scan the QR.
  function openGcash() {
    const ua = navigator.userAgent || "", m = info.manual || {};
    // The number is copied first, so it can be pasted into Send Money even if the app does not open by itself.
    try { navigator.clipboard.writeText(String(m.number || "").replace(/\s+/g, "")); } catch {}
    if (/KomuteApp/i.test(ua)) { status(K.t("acct.openHelp", { n: m.number || "" }), "ok"); location.href = "komute://open-gcash"; return; }
    if (/Android/i.test(ua)) { status(K.t("acct.openHelp", { n: m.number || "" }), "ok"); location.href = "intent://#Intent;package=com.globe.gcash.android;end"; }
    else if (/iPhone|iPad/i.test(ua)) { status(K.t("acct.openHelp", { n: m.number || "" }), "ok"); location.href = "gcash://"; }
    else status(K.t("acct.scanQr"), "ok");
  }
  let pollTimer = null, watchUntil = null, watching = false;
  // A payment counts as received only when the paid-until date moves, so someone who is already unlimited
  // (and just wants to add time) does not get a false "Payment received".
  const paidNow = () => Boolean(info.premium) && (info.paidUntil || null) !== watchUntil;
  function pollPending(keep) {
    clearInterval(pollTimer); let n = 0;
    if (!(keep && watching)) { watchUntil = info.paidUntil || null; watching = true; }
    pollTimer = setInterval(async () => {
      if (++n > 200) { watching = false; return clearInterval(pollTimer); }   // about 10 minutes
      await load();
      if (paidNow()) { clearInterval(pollTimer); clearInterval(leftTimer); watching = false; render(); status(K.t("acct.thanks"), "ok"); }
    }, 3000);
  }
  // Coming back from the GCash app: check right away instead of waiting for the next tick
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !watching) return;
    await load();
    if (paidNow()) { clearInterval(pollTimer); clearInterval(leftTimer); watching = false; render(); status(K.t("acct.thanks"), "ok"); } else pollPending(true);
  });
  async function sendManual() {
    const btn = $("manualSend"), reference = $("manualRef").value.trim();
    btn.disabled = true; status(K.t("acct.wait"));
    try {
      await token();
      const r = await call("/api/pay/manual", { plan: manualPlan, reference });
      if (r.approved) { await load(); status(K.t("acct.thanks"), "ok"); return; }
      info = { ...info, manualPending: r.pending };
      render(); status(K.t(r.waiting ? "acct.waitingMoney" : "acct.sent"), "ok");
      if (r.waiting) pollPending();
    } catch (e) { status(e.message, "err"); btn.disabled = false; }
  }

  async function submitLogin(ev) {
    ev.preventDefault();
    const email = $("acctEmail").value.trim(), password = $("acctPass").value;
    const btn = ev.target.querySelector("button[type=submit]");
    btn.disabled = true; status(K.t("acct.wait"));
    try {
      const r = await call(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", { email, password }, false);
      if (r.confirmEmail) { mode = "login"; render(); status(K.t("acct.checkEmail"), "ok"); return; }
      setSession(r.session);
      await load();
      status(K.t("acct.welcome"), "ok");
      if (pendingPlan) { pendingPlan = false; modal.hide(); K.app.requestPlan(); }
    } catch (e) { status(e.message, "err"); }
    finally { btn.disabled = false; }
  }

  function wireEye() {
    const eye = $("acctEye"); if (!eye) return;
    eye.onclick = () => {
      const f = $("acctPass"), show = f.type === "password";
      f.type = show ? "text" : "password";
      eye.classList.toggle("on", show);
      eye.setAttribute("aria-pressed", String(show));
      eye.setAttribute("aria-label", show ? "Hide password" : "Show password");
      f.focus();
    };
  }

  // ---------- forgot / reset password ----------
  let recoveryToken = "";
  function renderReset() {
    const body = $("acctBody");
    if (mode === "forgot") {
      $("acctTitle").textContent = K.t("acct.resetTitle");
      body.innerHTML = `<p class="small text-muted">${K.esc(K.t("acct.resetHelp"))}</p>
        <form id="acctForm" novalidate>
          <label class="form-label fw-semibold" for="acctEmail">${K.esc(K.t("acct.email"))}</label>
          <input id="acctEmail" type="email" class="form-control mb-3" autocomplete="email" required>
          <button class="btn btn-primary w-100" type="submit">${K.esc(K.t("acct.sendReset"))}</button>
        </form>
        <button type="button" class="btn btn-link w-100 mt-2" id="acctBack">${K.esc(K.t("acct.backSignIn"))}</button>`;
      $("acctForm").onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.submitter || e.target.querySelector("button[type=submit]"), email = $("acctEmail").value.trim();
        if (!email) { status(K.t("acct.email"), "err"); return; }
        btn.disabled = true; status(K.t("acct.opening"));
        try { await call("/api/auth/forgot", { email }, false); status(K.t("acct.resetSent"), "ok"); }
        catch (err) { status(err.message, "err"); }
        finally { btn.disabled = false; }
      };
    } else {
      $("acctTitle").textContent = K.t("acct.resetTitle");
      body.innerHTML = `<form id="acctForm" novalidate>
          <label class="form-label fw-semibold" for="acctPass">${K.esc(K.t("acct.newPass"))}</label>
          <div class="k-passwrap mb-3">
            <input id="acctPass" type="password" class="form-control" minlength="6" autocomplete="new-password" required>
            <button type="button" class="k-passeye" id="acctEye" aria-label="Show password" aria-pressed="false"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path class="k-eye-open" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle class="k-eye-open" cx="12" cy="12" r="3"/><path class="k-eye-off" d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.2-.9M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg></button>
          </div>
          <button class="btn btn-primary w-100" type="submit">${K.esc(K.t("acct.savePass"))}</button>
        </form>`;
      wireEye();
      $("acctForm").onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.submitter || e.target.querySelector("button[type=submit]"), password = $("acctPass").value;
        if (password.length < 6) { status(K.t("acct.password"), "err"); return; }
        btn.disabled = true; status(K.t("acct.opening"));
        try {
          await call("/api/auth/reset", { accessToken: recoveryToken, password }, false);
          recoveryToken = ""; mode = "login"; render(); status(K.t("acct.passSaved"), "ok");
        } catch (err) { status(err.message, "err"); btn.disabled = false; }
      };
    }
    if ($("acctBack")) $("acctBack").onclick = () => { mode = "login"; status(""); render(); };
  }
  // The link in the reset email comes back as  https://site/#access_token=...&type=recovery
  function checkRecovery() {
    const h = new URLSearchParams((location.hash || "").replace(/^#/, ""));
    if (h.get("type") !== "recovery" || !h.get("access_token")) return false;
    recoveryToken = h.get("access_token");
    history.replaceState(null, "", location.pathname + "#plan");
    mode = "reset"; return true;
  }

  async function startGoogle(event) {
    const button = event.currentTarget;
    button.disabled = true;
    status(K.t("acct.googleOpening"));
    try {
      const random = crypto.getRandomValues(new Uint8Array(32));
      const verifier = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const url = new URL(info.google);
      url.searchParams.set("redirect_to", new URL(googleCallback, location.origin).href);
      url.searchParams.set("prompt", "select_account");
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "s256");

      const { origin, destination, originPoint, destinationPoint } = K.state;
      const view = K.app.currentView();
      flowStore().setItem(googleFlowKey, JSON.stringify({
        verifier, returnView: view === "results" ? "plan" : view, pendingPlan,
        draft: { origin, destination, originPoint, destinationPoint }
      }));
      // Google refuses sign-in inside an app: the app opens the phone's browser and Komute comes back by komute://auth
      location.assign(inApp ? "komute://google?u=" + encodeURIComponent(url.href) : url.href);
      if (inApp) setTimeout(() => { button.disabled = false; status(""); }, 2500);
    } catch {
      button.disabled = false;
      status(K.t("acct.googleFailed"), "err");
    }
  }

  function returnToApp(code) {
    const c = encodeURIComponent(code);
    const go = "intent://auth?code=" + c + "#Intent;scheme=komute;package=ph.komute.app;S.browser_fallback_url=" + encodeURIComponent(location.origin) + ";end";
    document.body.innerHTML = '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#0b6b47;color:#fff;font-family:system-ui,sans-serif;text-align:center;padding:24px">'
      + '<img src="/assets/icon-192.png" width="84" height="84" alt="" style="border-radius:20px" onerror="this.remove()">'
      + '<h2 style="margin:0">Signed in</h2><p style="margin:0;max-width:300px">Going back to the Komute app...</p>'
      + '<a href="' + go + '" style="background:#f2b705;color:#1a1a1a;font-weight:700;padding:12px 26px;border-radius:999px;text-decoration:none">Open Komute app</a></div>';
    setTimeout(() => { location.href = go; }, 300);
  }

  async function finishGoogle() {
    const code = new URLSearchParams(location.search).get("code");
    let flow;
    try {
      flow = JSON.parse(flowStore().getItem(googleFlowKey));
      flowStore().removeItem(googleFlowKey);
    } catch { /* Storage can be unavailable in private browsing. */ }
    // Signed in through the phone's browser for the Android app: hand the code back to the app, which holds the sign-in details.
    if (!inApp && !flow && code) { returnToApp(code); return; }
    const view = ["plan", "saved", "fares", "guide"].includes(flow?.returnView) ? flow.returnView : "plan";
    history.replaceState(null, "", "/#" + view);
    if (flow?.draft) Object.assign(K.state, flow.draft);
    try {
      if (!code || !flow?.verifier) throw new Error("Missing authorization");
      const result = await call("/api/auth/google", { code, verifier: flow.verifier }, false);
      setSession(result.session);
      await load();
      if (info.signedIn && flow.pendingPlan) K.app.findRoutes();
      else {
        open("");
        status(K.t(info.signedIn ? "acct.welcome" : "acct.googleFailed"), info.signedIn ? "ok" : "err");
      }
    } catch {
      await load();
      open(K.t("acct.googleFailed"));
    }
  }

  async function buy(plan, btn) {
    btn.disabled = true; status(K.t("acct.opening"));
    try {
      await token();
      const r = await call("/api/pay", { plan });
      K.store.set("checkoutId", r.checkoutId);
      location.href = r.url; // PayMongo's own payment page
    } catch (e) { status(e.message, "err"); btn.disabled = false; }
  }

  // Back from PayMongo: ?paid=1 (paid) or ?paid=0 (cancelled)
  async function handleReturn() {
    const q = new URLSearchParams(location.search);
    if (!q.has("paid")) return;
    history.replaceState(null, "", location.pathname + (location.hash || "#plan"));
    const id = K.store.get("checkoutId", "");
    if (q.get("paid") !== "1" || !id) { open(K.t("acct.cancelled")); return; }
    open(""); status(K.t("acct.checking"));
    // The payment can take a few seconds to show as paid
    for (let i = 0; i < 6; i++) {
      try {
        await token();
        const r = await call("/api/pay/confirm", { checkoutId: id });
        if (r.paid) { K.store.set("checkoutId", ""); update(r.account); render(); status(K.t("acct.thanks"), "ok"); return; }
      } catch (e) { status(e.message, "err"); return; }
      await new Promise((ok) => setTimeout(ok, 2500));
    }
    status(K.t("acct.notYet"), "err");
  }

  // The plan request was refused: open the right window and plan again after signing in
  let pendingPlan = false;
  function blocked(e) {
    if (e.code === "login" || e.code === "expired") { setSession(null); info = { ...info, billing: true, signedIn: false }; paint(); pendingPlan = true; open(e.message); return true; }
    if (e.code === "pay" || e.code === "device") { open(e.message); return true; }
    return false;
  }

  // After signing out, the route plan on screen is hidden and the "sign in to get free route plans" box shows instead
  function lockPlan() {
    try {
      const S = K.state;
      if (!S || !S.ai || (!S.ai.plan && !S.ai.guide)) return;
      pendingPlan = true; // after signing in again, the plan is made again
      S.ai = { loading: false, error: K.t("acct.signInPlans", { n: info.freeLimit || 5 }), code: "login", plan: "", guide: null, sources: [], grounded: false, language: K.lang };
      if (K.results && K.results.render) K.results.render();
      const bx = document.getElementById("busesBox"); if (bx) bx.innerHTML = "";
    } catch { /* the plan stays if this fails */ }
  }

  function init() {
    if (!$("acctBtn") || !$("acctModal")) return; // older index.html without the account parts
    $("acctBtn").onclick = () => open("");
    if ($("upgradeBtn")) $("upgradeBtn").onclick = () => open("");
    if (checkRecovery()) { load().then(() => open("")); return; }
    if (location.pathname === googleCallback) finishGoogle();
    else load().then(handleReturn);
  }

  K.account = { init, load, update, open, token, forceRefresh, blocked, relabel: paint, info: () => info };
})(window.Komute);
