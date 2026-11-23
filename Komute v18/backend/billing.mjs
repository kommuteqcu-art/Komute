// Komute accounts and payments: sign in (Supabase), 5 free route plans, then ₱10/month or ₱120/year (PayMongo).
// If the Supabase keys are not set, everything here is switched off and the app stays free for everyone.
//
// Render "Environment" settings used here:
//   SUPABASE_URL              https://xxxx.supabase.co
//   SUPABASE_PUBLISHABLE_KEY  sb_publishable_...   (older projects: the "anon" key; SUPABASE_ANON_KEY also works)
//   SUPABASE_SECRET_KEY       sb_secret_...        (older projects: the "service_role" key; SUPABASE_SERVICE_KEY also works)
//   PAYMONGO_SECRET_KEY       sk_test_... for practice, sk_live_... for real money
//   FREE_PLANS=5  PRICE_MONTH_PHP=10  PRICE_YEAR_PHP=120   (optional, these are the defaults)

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const env = (...names) => names.map((n) => (process.env[n] || "").trim()).find(Boolean) || "";
const SB_URL = env("SUPABASE_URL").replace(/\/$/, "");
const SB_PUBLIC = env("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
const SB_SECRET = env("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
const PM_SECRET = env("PAYMONGO_SECRET_KEY");
const PM_BASE = (process.env.PAYMONGO_API_BASE || "https://api.paymongo.com").replace(/\/$/, "");
const FREE_PLANS = Math.max(0, Number(process.env.FREE_PLANS || 5));
const PLANS = {
  month: { days: 30, php: Number(process.env.PRICE_MONTH_PHP || 10) },
  year: { days: 365, php: Number(process.env.PRICE_YEAR_PHP || 120) }
};
// GCash, Maya and QR Ph only: a card fee (3.125% + ₱13.39) is more than a ₱10 payment.
const PAY_METHODS = (process.env.PAYMONGO_METHODS || "gcash,paymaya,qrph").split(",").map((s) => s.trim()).filter(Boolean);

// Manual payment (no payment service): people pay your GCash / Maya / bank, send the reference number, you approve it.
const PAY_METHOD = env("PAY_METHOD_NAME");           // e.g. GCash
const PAY_NAME = env("PAY_ACCOUNT_NAME");            // e.g. Juan Dela Cruz
const PAY_NUMBER = env("PAY_ACCOUNT_NUMBER");        // e.g. 0917 123 4567
const PAY_QR = env("PAY_QR_URL") || (fs.existsSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "assets", "pay-qr.png")) ? "assets/pay-qr.png" : "");
const PAY_NOTE = env("PAY_NOTE");                    // optional extra line
const ADMIN_KEY = env("PAYMENT_ADMIN_KEY", "FEEDBACK_ADMIN_KEY"); // secret word for the approval page

export const billingOn = Boolean(SB_URL && SB_PUBLIC && SB_SECRET);
export const paymentsOn = billingOn && Boolean(PM_SECRET);
export const manualOn = billingOn && !paymentsOn && Boolean(PAY_NUMBER || PAY_QR) && ADMIN_KEY.length >= 8;
const payMode = () => (paymentsOn ? "paymongo" : manualOn ? "manual" : "off");
export function billingStatus() {
  return {
    accounts: billingOn ? "on (Supabase)" : "off (add SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY)",
    payments: paymentsOn ? (PM_SECRET.startsWith("sk_test") ? "PayMongo TEST mode" : "PayMongo LIVE")
      : manualOn ? `manual (${PAY_METHOD || "bank/e-wallet"}, you approve at /admin/payments)`
      : "off (set PAY_ACCOUNT_NUMBER and PAYMENT_ADMIN_KEY for manual payments, or PAYMONGO_SECRET_KEY)",
    freePlans: FREE_PLANS, prices: { month: PLANS.month.php, year: PLANS.year.php }
  };
}

function fail(status, code, message) {
  const e = new Error(message);
  e.statusCode = status; e.publicMessage = message; e.code = code;
  return e;
}

// Supabase: new keys (sb_...) go in the "apikey" header only; old JWT keys also go in "Authorization".
function sbHeaders(key, userToken) {
  const h = { apikey: key, "Content-Type": "application/json" };
  if (userToken) h.Authorization = `Bearer ${userToken}`;
  else if (!key.startsWith("sb_")) h.Authorization = `Bearer ${key}`;
  return h;
}
async function sb(path, { method = "GET", key = SB_SECRET, token, body, prefer } = {}) {
  const headers = sbHeaders(key, token);
  if (prefer) headers.Prefer = prefer;
  let res;
  try {
    res = await fetch(SB_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  } catch (e) {
    throw fail(503, "account_down", "The account service is not reachable right now. Please try again in a minute.");
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  return { ok: res.ok, status: res.status, data };
}
const sbMsg = (d) => String(d?.msg || d?.error_description || d?.message || d?.error || "unknown error");

// ---------- Sign up / sign in (email + password) ----------
function session(d) {
  return { accessToken: d.access_token, refreshToken: d.refresh_token, expiresAt: Date.now() + (Number(d.expires_in) || 3600) * 1000, email: d.user?.email || "" };
}
function checkCredentials(body) {
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, "bad_email", "Please type a valid email address.");
  if (password.length < 6) throw fail(400, "bad_password", "The password needs at least 6 characters.");
  return { email, password };
}
export async function signUp(body) {
  if (!billingOn) throw fail(503, "billing_off", "Accounts are not set up on this server.");
  const cred = checkCredentials(body);
  const r = await sb("/auth/v1/signup", { method: "POST", key: SB_PUBLIC, body: cred });
  if (!r.ok) {
    if (r.status === 422 || /already/i.test(sbMsg(r.data))) throw fail(409, "exists", "This email already has an account. Tap “Sign in” instead.");
    if (r.status === 429) throw fail(429, "rate", "Too many sign-ups right now. Please wait a few minutes.");
    throw fail(400, "signup_failed", "Could not create the account: " + sbMsg(r.data));
  }
  if (r.data?.access_token) return { session: session(r.data) };
  return { confirmEmail: true }; // "Confirm email" is on in Supabase
}
export async function signIn(body) {
  if (!billingOn) throw fail(503, "billing_off", "Accounts are not set up on this server.");
  const cred = checkCredentials(body);
  const r = await sb("/auth/v1/token?grant_type=password", { method: "POST", key: SB_PUBLIC, body: cred });
  if (!r.ok) {
    if (/confirm/i.test(sbMsg(r.data))) throw fail(401, "unconfirmed", "Please open the email we sent and tap the confirm link first.");
    if (r.status === 429) throw fail(429, "rate", "Too many tries. Please wait a few minutes.");
    throw fail(401, "bad_login", "Wrong email or password.");
  }
  return { session: session(r.data) };
}
export async function refresh(body) {
  if (!billingOn) throw fail(503, "billing_off", "Accounts are not set up on this server.");
  const r = await sb("/auth/v1/token?grant_type=refresh_token", { method: "POST", key: SB_PUBLIC, body: { refresh_token: String(body.refreshToken || "") } });
  if (!r.ok) throw fail(401, "login", "Please sign in again.");
  return { session: session(r.data) };
}

// ---------- Who is calling ----------
const userCache = new Map(); // token -> { user, until }
export async function userFrom(request) {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.authorization || "");
  if (!m) return null;
  const token = m[1].trim();
  const hit = userCache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  const r = await sb("/auth/v1/user", { key: SB_PUBLIC, token });
  if (!r.ok || !r.data?.id) throw fail(401, "expired", "Your sign-in has expired. Please sign in again.");
  const user = { id: r.data.id, email: r.data.email || "" };
  if (userCache.size > 500) userCache.clear();
  userCache.set(token, { user, until: Date.now() + 60000 });
  return user;
}

// ---------- Free plans and subscription ----------
async function getSub(userId) {
  const r = await sb(`/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  if (!r.ok) throw fail(503, "db", tableHelp(r));
  return r.data?.[0] || { user_id: userId, free_used: 0, paid_until: null };
}
async function saveSub(row) {
  const r = await sb("/rest/v1/subscriptions?on_conflict=user_id", {
    method: "POST", prefer: "resolution=merge-duplicates,return=representation",
    body: { user_id: row.user_id, free_used: row.free_used, paid_until: row.paid_until }
  });
  if (!r.ok) throw fail(503, "db", tableHelp(r));
  return r.data?.[0] || row;
}
function tableHelp(r) {
  console.warn("Supabase table error:", r.status, sbMsg(r.data));
  return /does not exist|relation|schema cache/i.test(sbMsg(r.data))
    ? "The account table is missing. Run the SQL from the README in Supabase (SQL Editor)."
    : "The account service had a problem. Please try again.";
}
function manualInfo() {
  if (!manualOn) return null;
  return { method: PAY_METHOD, name: PAY_NAME, number: PAY_NUMBER, qr: PAY_QR, note: PAY_NOTE };
}
function accountView(user, sub) {
  const paidUntil = sub.paid_until && new Date(sub.paid_until) > new Date() ? sub.paid_until : null;
  return {
    email: user.email, premium: Boolean(paidUntil), paidUntil,
    freeUsed: sub.free_used || 0, freeLimit: FREE_PLANS, freeLeft: Math.max(0, FREE_PLANS - (sub.free_used || 0)),
    prices: { month: PLANS.month.php, year: PLANS.year.php }, paymentsOn, payMode: payMode(), manual: manualInfo()
  };
}
export async function account(request) {
  if (!billingOn) return { billing: false };
  const user = await userFrom(request);
  if (!user) return { billing: true, signedIn: false, freeLimit: FREE_PLANS, prices: { month: PLANS.month.php, year: PLANS.year.php }, payMode: payMode() };
  const view = accountView(user, await getSub(user.id));
  if (manualOn) view.manualPending = await pendingCount(user.id);
  return { billing: true, signedIn: true, ...view };
}

// Before a route plan: must be signed in, and premium or still has free plans.
export async function gate(request) {
  if (!billingOn) return null;
  const user = await userFrom(request);
  if (!user) throw fail(401, "login", `Sign in to get ${FREE_PLANS} free route plans.`);
  const sub = await getSub(user.id);
  const view = accountView(user, sub);
  if (!view.premium && view.freeLeft <= 0) {
    throw fail(402, "pay", `You used your ${FREE_PLANS} free route plans. Get unlimited plans for ₱${PLANS.month.php} a month or ₱${PLANS.year.php} a year.`);
  }
  return { user, sub, view };
}
// After a plan was made: use up one free plan (premium users are not counted).
export async function count(g) {
  if (!g) return null;
  if (g.view.premium) return g.view;
  const sub = await saveSub({ ...g.sub, free_used: (g.sub.free_used || 0) + 1 });
  return accountView(g.user, sub);
}

// ---------- PayMongo ----------
const pmAuth = () => "Basic " + Buffer.from(PM_SECRET + ":").toString("base64");
async function pm(path, method = "GET", body) {
  let res;
  try {
    res = await fetch(PM_BASE + path, {
      method, headers: { Authorization: pmAuth(), "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000)
    });
  } catch {
    throw fail(503, "pay_down", "The payment service is not reachable right now. Please try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.errors?.[0]?.detail || res.status;
    console.warn("PayMongo error:", detail);
    throw fail(502, "pay_failed", "The payment service said: " + detail);
  }
  return data;
}

function siteUrl(request) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const proto = String(request.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  return `${proto}://${request.headers["x-forwarded-host"] || request.headers.host}`;
}

export async function startPayment(request, body) {
  if (!paymentsOn) throw fail(503, "pay_off", "Payments are not set up on this server yet.");
  const user = await userFrom(request);
  if (!user) throw fail(401, "login", "Please sign in first.");
  const plan = body.plan === "year" ? "year" : "month";
  const p = PLANS[plan];
  const site = siteUrl(request);
  const d = await pm("/v1/checkout_sessions", "POST", {
    data: { attributes: {
      line_items: [{ name: plan === "year" ? "Komute Unlimited – 1 year" : "Komute Unlimited – 1 month", amount: Math.round(p.php * 100), currency: "PHP", quantity: 1 }],
      payment_method_types: PAY_METHODS,
      description: `Unlimited Komute route plans for ${p.days} days`,
      success_url: `${site}/?paid=1#plan`,
      cancel_url: `${site}/?paid=0#plan`,
      send_email_receipt: true,
      show_description: true,
      metadata: { user_id: user.id, plan }
    } }
  });
  return { checkoutId: d.data.id, url: d.data.attributes.checkout_url };
}

// Check a checkout with PayMongo itself and add the days once. Used by the "back from payment" page and the webhook.
async function applyCheckout(checkoutId, expectUserId) {
  if (!/^cs_[A-Za-z0-9]+$/.test(checkoutId || "")) throw fail(400, "bad_checkout", "Unknown payment.");
  const d = await pm(`/v1/checkout_sessions/${checkoutId}`);
  const a = d.data.attributes;
  const userId = a.metadata?.user_id;
  const plan = a.metadata?.plan === "year" ? "year" : "month";
  if (!userId || (expectUserId && userId !== expectUserId)) throw fail(403, "not_yours", "This payment belongs to another account.");
  const paid = (a.payments || []).find((x) => x.attributes?.status === "paid");
  if (!paid) return { paid: false, userId };
  // Record the payment first. If it is already recorded, the days were already added.
  const ins = await sb("/rest/v1/payments", { method: "POST", prefer: "return=minimal",
    body: { checkout_id: checkoutId, user_id: userId, plan, amount: paid.attributes.amount } });
  if (ins.status === 409) return { paid: true, userId, already: true };
  if (!ins.ok) throw fail(503, "db", tableHelp(ins));
  const sub = await getSub(userId);
  const start = sub.paid_until && new Date(sub.paid_until) > new Date() ? new Date(sub.paid_until) : new Date();
  const until = new Date(start.getTime() + PLANS[plan].days * 86400000).toISOString();
  await saveSub({ ...sub, paid_until: until });
  console.log(`Payment ${checkoutId}: ${plan} for user ${userId}, premium until ${until}`);
  return { paid: true, userId };
}

export async function confirmPayment(request, body) {
  if (!paymentsOn) throw fail(503, "pay_off", "Payments are not set up on this server yet.");
  const user = await userFrom(request);
  if (!user) throw fail(401, "login", "Please sign in first.");
  const r = await applyCheckout(String(body.checkoutId || ""), user.id);
  return { paid: r.paid, account: accountView(user, await getSub(user.id)) };
}

// Optional PayMongo webhook (event: checkout_session.payment.paid). It only passes the checkout id;
// the details are always read back from PayMongo with the secret key, so a fake call cannot add days.
export async function webhook(body) {
  if (!paymentsOn) return { ok: false };
  const ev = body?.data?.attributes;
  const id = ev?.data?.id;
  if (ev?.type !== "checkout_session.payment.paid" || !id) return { ok: true, ignored: true };
  await applyCheckout(id);
  return { ok: true };
}

// ---------- Manual payments ----------
const cleanRef = (v) => String(v || "").replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
async function pendingCount(userId) {
  const r = await sb(`/rest/v1/manual_payments?user_id=eq.${encodeURIComponent(userId)}&status=eq.pending&select=id`);
  return r.ok && Array.isArray(r.data) ? r.data.length : 0;
}
export async function submitManual(request, body) {
  if (!manualOn) throw fail(503, "pay_off", "Payments are not set up on this server yet.");
  const user = await userFrom(request);
  if (!user) throw fail(401, "login", "Please sign in first.");
  const plan = body.plan === "year" ? "year" : "month";
  const reference = cleanRef(body.reference);
  if (reference.length < 6 || reference.length > 40) throw fail(400, "bad_ref", "Type the reference number from your payment receipt (at least 6 letters or numbers).");
  if ((await pendingCount(user.id)) >= 3) throw fail(429, "too_many", "You already have 3 payments waiting. Please wait for them to be approved.");
  const r = await sb("/rest/v1/manual_payments", { method: "POST", prefer: "return=minimal",
    body: { user_id: user.id, email: user.email, plan, amount: PLANS[plan].php, reference, status: "pending" } });
  if (r.status === 409) throw fail(409, "ref_used", "This reference number was already submitted.");
  if (!r.ok) throw fail(503, "db", tableHelp(r));
  console.log(`Manual payment submitted: ${user.email} ${plan} ref ${reference}`);
  return { ok: true, pending: await pendingCount(user.id) };
}

function adminOk(key) {
  const a = Buffer.from(String(key || "")), b = Buffer.from(ADMIN_KEY);
  return manualOn && a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function adminList() {
  const r = await sb("/rest/v1/manual_payments?select=*&order=created_at.desc&limit=100");
  if (!r.ok) throw fail(503, "db", tableHelp(r));
  return r.data || [];
}
export async function adminAct(body) {
  if (!adminOk(body.key)) throw fail(403, "admin", "Wrong admin key.");
  const id = Number(body.id);
  if (!Number.isInteger(id)) throw fail(400, "bad_id", "Bad payment id.");
  const status = body.action === "approve" ? "approved" : "rejected";
  // Only a pending payment can be changed, and only once
  const r = await sb(`/rest/v1/manual_payments?id=eq.${id}&status=eq.pending`, { method: "PATCH", prefer: "return=representation", body: { status } });
  if (!r.ok) throw fail(503, "db", tableHelp(r));
  const row = r.data?.[0];
  if (!row) return { ok: true, already: true };
  if (status === "approved") {
    const plan = row.plan === "year" ? "year" : "month";
    const sub = await getSub(row.user_id);
    const start = sub.paid_until && new Date(sub.paid_until) > new Date() ? new Date(sub.paid_until) : new Date();
    const until = new Date(start.getTime() + PLANS[plan].days * 86400000).toISOString();
    await saveSub({ ...sub, paid_until: until });
    console.log(`Manual payment ${row.reference} approved: ${row.email} premium until ${until}`);
  }
  return { ok: true, status };
}

export async function adminPage(response, url) {
  const send = (status, html) => { response.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); response.end(html); };
  const key = url.searchParams.get("key") || "";
  if (!adminOk(key)) return send(403, "<p style='font-family:sans-serif;padding:2rem'>Wrong or missing key. Open /admin/payments?key=YOUR_PAYMENT_ADMIN_KEY</p>");
  const rows = await adminList();
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = (d) => new Date(d).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  const pending = rows.filter((x) => x.status === "pending");
  const done = rows.filter((x) => x.status !== "pending");
  const card = (x, buttons) => `<div class="c"><div><b>₱${esc(x.amount)}</b> · ${esc(x.plan === "year" ? "1 year" : "1 month")} · <span class="s ${esc(x.status)}">${esc(x.status)}</span></div>
    <div>Reference: <code>${esc(x.reference)}</code></div><div class="m">${esc(x.email)} · ${esc(when(x.created_at))}</div>${buttons}</div>`;
  send(200, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Komute payments</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:1rem;background:#f5f7f4}h1{font-size:1.3rem}.c{background:#fff;border-radius:12px;padding:.8rem 1rem;margin:.6rem 0;box-shadow:0 1px 4px #0002}
.m{color:#666;font-size:.85rem}code{background:#eef;padding:1px 6px;border-radius:6px;font-size:1rem}button{border:0;border-radius:10px;padding:.55rem 1rem;font-weight:700;margin:.5rem .4rem 0 0;font-size:1rem}
.ok{background:#047857;color:#fff}.no{background:#e5e7eb}.s.pending{color:#b45309}.s.approved{color:#047857}.s.rejected{color:#b91c1c}</style>
<h1>Komute payments</h1><p class="m">Open your GCash / Maya / bank app, find a payment with the same reference and amount, then tap Approve. Approve each payment once.</p>
<h2 style="font-size:1.05rem">Waiting (${pending.length})</h2>
${pending.map((x) => card(x, `<button class="ok" data-id="${esc(x.id)}" data-a="approve">Approve</button><button class="no" data-id="${esc(x.id)}" data-a="reject">Reject</button>`)).join("") || "<p>Nothing waiting.</p>"}
<h2 style="font-size:1.05rem">Done</h2>${done.map((x) => card(x, "")).join("") || "<p>None yet.</p>"}
<script>const KEY=${JSON.stringify(key)};document.querySelectorAll("button[data-id]").forEach(b=>b.onclick=async()=>{
if(!confirm((b.dataset.a==="approve"?"Approve":"Reject")+" this payment?"))return;b.disabled=true;
const r=await fetch("/api/admin/payments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:KEY,id:b.dataset.id,action:b.dataset.a})});
const d=await r.json().catch(()=>({}));if(!r.ok){alert(d.error||"Error");b.disabled=false;return}location.reload()});</script>`);
}
