// Sign in, free route plans left, and paying for unlimited plans (₱10/month or ₱120/year with GCash, Maya or QR Ph).
// Everything here hides itself when the server has accounts switched off.
(function (K) {
  const $ = (id) => document.getElementById(id);
  const cfg = window.KOMUTE_CONFIG || {};
  const base = (cfg.API_BASE || "").replace(/\/$/, "");
  let info = { billing: false };   // last answer from /api/account
  let modal = null, mode = "login"; // "login" | "signup"

  // ---------- session (kept on this phone) ----------
  const getSession = () => K.store.get("session", null);
  const setSession = (s) => K.store.set("session", s);

  async function call(path, body, withToken = true) {
    const headers = { "Content-Type": "application/json" };
    const s = getSession();
    if (withToken && s && s.accessToken) headers.Authorization = "Bearer " + s.accessToken;
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
      else if (e.code === "expired") info = { ...info, signedIn: false };
    }
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
    btn.classList.toggle("d-none", !info.billing);
    if (!info.billing) return;
    let icon = "bi-person-circle", text = K.t("acct.signIn");
    if (info.signedIn && info.premium) { icon = "bi-star-fill"; text = K.t("acct.unlimited"); }
    else if (info.signedIn) { icon = "bi-person-check-fill"; text = K.t("acct.freeShort", { n: info.freeLeft }); }
    btn.innerHTML = `<i class="bi ${icon}"></i><span>${K.esc(text)}</span>`;
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
  }
  function status(msg, kind) {
    const el = $("acctStatus");
    el.textContent = msg || "";
    el.className = "small mt-2 " + (kind === "ok" ? "text-success" : kind === "err" ? "text-danger" : "text-muted");
  }

  function render() {
    const body = $("acctBody");
    if (!info.signedIn) {
      $("acctTitle").textContent = K.t(mode === "signup" ? "acct.create" : "acct.signIn");
      body.innerHTML = `<p class="small text-muted">${K.esc(K.t("acct.why", { n: info.freeLimit || 5, m: info.prices?.month ?? 10, y: info.prices?.year ?? 120 }))}</p>
        <form id="acctForm" novalidate>
          <label class="form-label fw-semibold" for="acctEmail">${K.esc(K.t("acct.email"))}</label>
          <input id="acctEmail" type="email" class="form-control mb-3" autocomplete="email" required>
          <label class="form-label fw-semibold" for="acctPass">${K.esc(K.t("acct.password"))}</label>
          <input id="acctPass" type="password" class="form-control mb-3" minlength="6" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" required>
          <button class="btn btn-primary w-100" type="submit">${K.esc(K.t(mode === "signup" ? "acct.create" : "acct.signIn"))}</button>
        </form>
        <button type="button" class="btn btn-link w-100 mt-2" id="acctSwitch">${K.esc(K.t(mode === "signup" ? "acct.haveAccount" : "acct.noAccount"))}</button>`;
      $("acctSwitch").onclick = () => { mode = mode === "signup" ? "login" : "signup"; status(""); render(); };
      $("acctForm").onsubmit = submitLogin;
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
      <button type="button" class="btn btn-outline-secondary btn-sm mt-3" id="acctOut"><i class="bi bi-box-arrow-right"></i> ${K.esc(K.t("acct.signOut"))}</button>`;
    body.querySelectorAll("[data-plan]").forEach((b) => b.onclick = () => buy(b.dataset.plan, b));
    body.querySelectorAll("[data-mplan]").forEach((b) => b.onclick = () => { manualPlan = b.dataset.mplan; render(); });
    if ($("manualSend")) $("manualSend").onclick = sendManual;
    if ($("manualCheck")) $("manualCheck").onclick = async () => { status(K.t("acct.wait")); await load(); status(info.premium ? K.t("acct.thanks") : K.t("acct.stillPending")); };
    $("acctOut").onclick = () => { setSession(null); info = { ...info, signedIn: false, premium: false }; mode = "login"; paint(); render(); status(K.t("acct.signedOut")); };
  }

  // ---------- manual payment: pay your GCash/Maya/bank, send the reference number, the owner approves ----------
  let manualPlan = "month";
  function manualHtml() {
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
        ${m.qr ? `<img class="k-payqr" src="${K.esc(m.qr)}" alt="QR code">` : ""}
        ${m.note ? `<div class="small mt-1">${K.esc(m.note)}</div>` : ""}
        <div class="fw-bold mt-3 mb-1">2. ${K.esc(K.t("acct.manualRef"))}</div>
        <input id="manualRef" class="form-control" maxlength="40" autocomplete="off" placeholder="${K.esc(K.t("acct.refPh"))}">
        <button type="button" class="btn btn-primary w-100 mt-2" id="manualSend">${K.esc(K.t("acct.submitRef"))}</button>
      </div>
      ${info.manualPending ? `<div class="alert k-info small mt-3 mb-0"><i class="bi bi-hourglass-split"></i> ${K.esc(K.t("acct.pending", { n: info.manualPending }))}
        <button type="button" class="btn btn-link btn-sm p-0 ms-1" id="manualCheck">${K.esc(K.t("acct.checkAgain"))}</button></div>` : ""}`;
  }
  async function sendManual() {
    const btn = $("manualSend"), reference = $("manualRef").value.trim();
    btn.disabled = true; status(K.t("acct.wait"));
    try {
      await token();
      const r = await call("/api/pay/manual", { plan: manualPlan, reference });
      info = { ...info, manualPending: r.pending };
      render(); status(K.t("acct.sent"), "ok");
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
    if (e.code === "pay") { open(e.message); return true; }
    return false;
  }

  function init() {
    if (!$("acctBtn") || !$("acctModal")) return; // older index.html without the account parts
    $("acctBtn").onclick = () => open("");
    if ($("upgradeBtn")) $("upgradeBtn").onclick = () => open("");
    load().then(handleReturn);
  }

  K.account = { init, load, update, open, token, forceRefresh, blocked, relabel: paint };
})(window.Komute);
