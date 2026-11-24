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
const assetIf = (file) => (fs.existsSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "assets", file)) ? "assets/" + file : "");
// One QR per plan, each made in GCash with the amount already set (QR > Generate QR > Receive Money via QR Code > Add Amount)
const PAY_QR_MONTH = env("PAY_QR_MONTH_URL") || assetIf("pay-qr-month.png");
const PAY_QR_YEAR = env("PAY_QR_YEAR_URL") || assetIf("pay-qr-year.png");
const PAY_NOTE = env("PAY_NOTE");                    // optional extra line
const ADMIN_KEY = env("PAYMENT_ADMIN_KEY", "FEEDBACK_ADMIN_KEY"); // secret word for the approval page
// Instant unlock: PAY_AUTO_APPROVE=true unlocks the account the moment a well-formed, never-used reference number is sent.
// The server cannot ask GCash whether that payment is real, so each user gets at most PAY_AUTO_LIMIT (default 2) instant
// unlocks that you have not confirmed yet; after that, payments wait for you again. You can Revoke any of them.
const AUTO = /^(1|true|yes|on)$/i.test(env("PAY_AUTO_APPROVE"));
const AUTO_LIMIT = Math.max(1, Number(env("PAY_AUTO_LIMIT") || 2));
// Automatic checking with no payment service: your phone forwards each "You have received ₱.. Ref. No. .." message from GCash
// to /api/gcash-sms?key=PAY_SMS_KEY. Then a reference number only works if that money really arrived, for the exact price.
const SMS_KEY = env("PAY_SMS_KEY");
const VERIFY = SMS_KEY.length >= 8;
// With automatic checking, each person is asked to send a slightly different amount (₱10.01 to ₱10.49), so a payment can be
// matched to the right account with no reference number. A payment of a wrong amount matches nobody.
const CENTS_MAX = Math.min(99, Math.max(5, Number(env("PAY_CENTS_MAX") || 49)));
const REQUEST_MINUTES = Math.max(5, Number(env("PAY_REQUEST_MINUTES") || 30));
const cents = (n) => Math.round(Number(n) * 100);
const amountFits = (plan, amount) => { const c = cents(amount), base = cents(PLANS[plan].php); return c >= base && c <= base + CENTS_MAX; };
const REF_RE = (() => {
  const custom = env("PAY_REF_PATTERN");
  try { if (custom) return new RegExp(custom, "i"); } catch { console.warn("PAY_REF_PATTERN is not a valid pattern, ignored."); }
  return /gcash/i.test(env("PAY_METHOD_NAME")) ? /^\d{13}$/ : null; // GCash reference numbers are 13 digits
})();

export const billingOn = Boolean(SB_URL && SB_PUBLIC && SB_SECRET);
export const paymentsOn = billingOn && Boolean(PM_SECRET);
export const manualOn = billingOn && !paymentsOn && Boolean(PAY_NUMBER || PAY_QR) && ADMIN_KEY.length >= 8;
const payMode = () => (paymentsOn ? "paymongo" : manualOn ? "manual" : "off");
export function billingStatus() {
  return {
    accounts: billingOn ? "on (Supabase)" : "off (add SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY)",
    payments: paymentsOn ? (PM_SECRET.startsWith("sk_test") ? "PayMongo TEST mode" : "PayMongo LIVE")
      : manualOn ? `manual (${PAY_METHOD || "bank/e-wallet"}, ${VERIFY ? "automatic: checks the GCash message for the exact amount" : AUTO ? "instant unlock, you can review at /admin/payments" : "you approve at /admin/payments"})`
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
  return { method: PAY_METHOD, name: PAY_NAME, number: PAY_NUMBER, qr: PAY_QR, qrMonth: PAY_QR_MONTH, qrYear: PAY_QR_YEAR, note: PAY_NOTE, instant: AUTO && !VERIFY, verify: VERIFY };
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
  if (manualOn && VERIFY) view.request = await openRequest(user.id);
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
async function addDays(userId, plan, sign = 1) {
  const sub = await getSub(userId);
  const now = new Date();
  const base = sub.paid_until && new Date(sub.paid_until) > now ? new Date(sub.paid_until) : now;
  let until = new Date(base.getTime() + sign * PLANS[plan].days * 86400000);
  if (sign < 0 && until <= now) until = null; // revoking the only paid period ends premium now
  await saveSub({ ...sub, paid_until: until ? until.toISOString() : null });
  return until ? until.toISOString() : null;
}
async function autoCount(userId) {
  const r = await sb(`/rest/v1/manual_payments?user_id=eq.${encodeURIComponent(userId)}&status=eq.auto&select=id`);
  return r.ok && Array.isArray(r.data) ? r.data.length : 0;
}
export async function submitManual(request, body) {
  if (!manualOn) throw fail(503, "pay_off", "Payments are not set up on this server yet.");
  const user = await userFrom(request);
  if (!user) throw fail(401, "login", "Please sign in first.");
  const plan = body.plan === "year" ? "year" : "month";
  const reference = cleanRef(body.reference);
  if (reference.length < 6 || reference.length > 40) throw fail(400, "bad_ref", "Type the reference number from your payment receipt (at least 6 letters or numbers).");
  if (REF_RE && !REF_RE.test(reference)) throw fail(400, "bad_ref", `That reference number does not look right${/gcash/i.test(PAY_METHOD) ? ". A GCash reference number has 13 digits" : ""}. Please copy it from your receipt.`);
  if ((await pendingCount(user.id)) >= 3) throw fail(429, "too_many", "You already have 3 payments waiting. Please wait for them to be approved.");
  if (VERIFY) {
    const price = PLANS[plan].php;
    const got = await incomingFor(reference);
    if (got && !amountFits(plan, got.amount)) {
      throw fail(400, "wrong_amount", `We received ₱${got.amount} with this reference, but this plan costs ₱${price}. Please send ₱${price} to ₱${(price + CENTS_MAX / 100).toFixed(2)}, or choose the ${amountFits("year", got.amount) ? "yearly" : amountFits("month", got.amount) ? "monthly" : "matching"} plan.`);
    }
    const ins = await sb("/rest/v1/manual_payments", { method: "POST", prefer: "return=minimal",
      body: { user_id: user.id, email: user.email, plan, amount: price, reference, status: got ? "approved" : "pending" } });
    if (ins.status === 409) throw fail(409, "ref_used", "This reference number was already submitted.");
    if (!ins.ok) throw fail(503, "db", tableHelp(ins));
    if (got) {
      const until = await addDays(user.id, plan);
      console.log(`Payment ${reference} verified (₱${price}): ${user.email} ${plan}, premium until ${until}`);
      return { ok: true, approved: true, paidUntil: until, pending: await pendingCount(user.id) };
    }
    return { ok: true, pending: await pendingCount(user.id), waiting: true };
  }
  const instant = AUTO && (await autoCount(user.id)) < AUTO_LIMIT;
  const r = await sb("/rest/v1/manual_payments", { method: "POST", prefer: "return=minimal",
    body: { user_id: user.id, email: user.email, plan, amount: PLANS[plan].php, reference, status: instant ? "auto" : "pending" } });
  if (r.status === 409) throw fail(409, "ref_used", "This reference number was already submitted.");
  if (!r.ok) throw fail(503, "db", tableHelp(r));
  if (instant) {
    const until = await addDays(user.id, plan);
    console.log(`Manual payment ${reference} unlocked instantly: ${user.email} ${plan}, premium until ${until}`);
    return { ok: true, approved: true, paidUntil: until, pending: await pendingCount(user.id) };
  }
  console.log(`Manual payment submitted: ${user.email} ${plan} ref ${reference}`);
  return { ok: true, pending: await pendingCount(user.id) };
}

// ---------- GCash messages forwarded from the owner's phone ----------
async function incomingFor(reference) {
  const r = await sb(`/rest/v1/incoming_payments?reference=eq.${encodeURIComponent(reference)}&select=*`);
  if (!r.ok) throw fail(503, "db", tableHelp(r));
  return r.data?.[0] || null;
}
// Reads "received PHP 10.00 ... Ref. No. 1234567890123" out of the text. Only money coming IN counts.
export function parseGcashText(text) {
  const t = String(text || "").replace(/\s+/g, " ");
  if (!/received/i.test(t)) return null;
  const money = t.match(/(?:PHP|PhP|₱|P)\s?([\d,]+(?:\.\d{1,2})?)/);
  const ref = t.match(/\b(\d{13})\b/);
  if (!money || !ref) return null;
  return { amount: Math.round(Number(money[1].replace(/,/g, "")) * 100) / 100, reference: ref[1] };
}
export async function smsIn(key, text) {
  if (!VERIFY) throw fail(503, "sms_off", "Automatic checking is not set up (add PAY_SMS_KEY).");
  const a = Buffer.from(String(key || "")), b = Buffer.from(SMS_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw fail(403, "sms_key", "Wrong key.");
  const got = parseGcashText(text);
  if (!got) { console.log("GCash message ignored (not a received-money message)"); return { ok: true, ignored: true }; }
  const ins = await sb("/rest/v1/incoming_payments", { method: "POST", prefer: "return=minimal",
    body: { reference: got.reference, amount: got.amount, raw: String(text).slice(0, 300) } });
  if (ins.status === 409) return { ok: true, duplicate: true };
  if (!ins.ok) throw fail(503, "db", tableHelp(ins));
  console.log(`GCash payment received: ₱${got.amount} ref ${got.reference}`);
  // Someone may already be waiting with this reference number
  const w = await sb(`/rest/v1/manual_payments?reference=eq.${encodeURIComponent(got.reference)}&status=eq.pending`, { method: "PATCH", prefer: "return=representation", body: { status: "approved" } });
  const row = w.ok ? w.data?.[0] : null;
  if (row) {
    const plan = row.plan === "year" ? "year" : "month";
    if (amountFits(plan, got.amount)) { const until = await addDays(row.user_id, plan); console.log(`Waiting payment ${got.reference} approved: ${row.email} until ${until}`); }
    else { await sb(`/rest/v1/manual_payments?id=eq.${row.id}`, { method: "PATCH", prefer: "return=minimal", body: { status: "rejected" } }); console.log(`Waiting payment ${got.reference} rejected: paid ₱${got.amount}, plan ₱${PLANS[plan].php}`); }
  }
  // Or a payment request: nobody typed a reference, the unique amount says whose payment this is
  let matched = Boolean(row);
  if (!row) matched = await matchRequest(got);
  return { ok: true, amount: got.amount, matched };
}

// ---------- Payment requests (no reference number needed) ----------
const nowIso = () => new Date().toISOString();
async function openRequest(userId) {
  const r = await sb(`/rest/v1/payment_requests?user_id=eq.${encodeURIComponent(userId)}&status=eq.open&expires_at=gt.${encodeURIComponent(nowIso())}&select=*&order=created_at.desc&limit=1`);
  if (!r.ok) throw fail(503, "db", tableHelp(r));
  const x = r.data?.[0];
  return x ? { plan: x.plan, amount: Number(x.amount), expiresAt: x.expires_at } : null;
}
export async function payRequest(request, body) {
  if (!manualOn || !VERIFY) throw fail(503, "pay_off", "Automatic payment is not set up on this server yet.");
  const user = await userFrom(request);
  if (!user) throw fail(401, "login", "Please sign in first.");
  const plan = body.plan === "year" ? "year" : "month";
  // old unpaid requests stop blocking amounts
  await sb(`/rest/v1/payment_requests?status=eq.open&expires_at=lt.${encodeURIComponent(nowIso())}`, { method: "PATCH", prefer: "return=minimal", body: { status: "expired" } });
  const mine = await openRequest(user.id);
  if (mine && mine.plan === plan) return { ok: true, request: mine };
  if (mine) await sb(`/rest/v1/payment_requests?user_id=eq.${encodeURIComponent(user.id)}&status=eq.open`, { method: "PATCH", prefer: "return=minimal", body: { status: "cancelled" } });
  const used = await sb(`/rest/v1/payment_requests?status=eq.open&plan=eq.${plan}&select=amount`);
  if (!used.ok) throw fail(503, "db", tableHelp(used));
  const taken = new Set((used.data || []).map((x) => cents(x.amount)));
  const base = cents(PLANS[plan].php), free = [];
  for (let c = 1; c <= CENTS_MAX; c++) if (!taken.has(base + c)) free.push(base + c);
  if (!free.length) throw fail(429, "busy", "Many people are paying right now. Please try again in a few minutes.");
  const pick = free[Math.floor(Math.random() * free.length)];
  const row = { user_id: user.id, email: user.email, plan, amount: pick / 100, status: "open", expires_at: new Date(Date.now() + REQUEST_MINUTES * 60000).toISOString() };
  const ins = await sb("/rest/v1/payment_requests", { method: "POST", prefer: "return=minimal", body: row });
  if (!ins.ok) throw fail(503, "db", tableHelp(ins));
  return { ok: true, request: { plan, amount: row.amount, expiresAt: row.expires_at } };
}
async function matchRequest(got) {
  const f = await sb(`/rest/v1/payment_requests?status=eq.open&amount=eq.${got.amount}&expires_at=gt.${encodeURIComponent(nowIso())}&select=*&order=created_at.asc&limit=1`);
  const req = f.ok ? f.data?.[0] : null;
  if (!req) return false;
  // claim it once (only an open request can be claimed)
  const c = await sb(`/rest/v1/payment_requests?id=eq.${req.id}&status=eq.open`, { method: "PATCH", prefer: "return=representation", body: { status: "paid" } });
  const row = c.ok ? c.data?.[0] : null;
  if (!row) return false;
  const plan = row.plan === "year" ? "year" : "month";
  const until = await addDays(row.user_id, plan);
  await sb("/rest/v1/manual_payments", { method: "POST", prefer: "return=minimal",
    body: { user_id: row.user_id, email: row.email, plan, amount: got.amount, reference: got.reference, status: "approved" } });
  console.log(`Payment request matched: ₱${got.amount} ref ${got.reference} -> ${row.email} ${plan}, premium until ${until}`);
  return true;
}

function adminOk(key) {
  const a = Buffer.from(String(key || "")), b = Buffer.from(ADMIN_KEY);
  return manualOn && a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function incomingList() {
  const r = await sb("/rest/v1/incoming_payments?select=*&order=created_at.desc&limit=50");
  return r.ok && Array.isArray(r.data) ? r.data : [];
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
  // approve/reject: a waiting payment.  confirm/revoke: a payment that was unlocked instantly.
  const act = { approve: ["pending", "approved"], reject: ["pending", "rejected"], confirm: ["auto", "approved"], revoke: ["auto", "rejected"] }[body.action];
  if (!act) throw fail(400, "bad_action", "Unknown action.");
  const [from, status] = act;
  // Only a payment in the right state can be changed, and only once
  const r = await sb(`/rest/v1/manual_payments?id=eq.${id}&status=eq.${from}`, { method: "PATCH", prefer: "return=representation", body: { status } });
  if (!r.ok) throw fail(503, "db", tableHelp(r));
  const row = r.data?.[0];
  if (!row) return { ok: true, already: true };
  const plan = row.plan === "year" ? "year" : "month";
  if (body.action === "approve") {
    const until = await addDays(row.user_id, plan);
    console.log(`Manual payment ${row.reference} approved: ${row.email} premium until ${until}`);
  } else if (body.action === "revoke") {
    const until = await addDays(row.user_id, plan, -1);
    console.log(`Manual payment ${row.reference} revoked: ${row.email} premium until ${until || "none"}`);
  }
  return { ok: true, status };
}

export async function adminPage(response, url) {
  const send = (status, html) => { response.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); response.end(html); };
  const key = url.searchParams.get("key") || "";
  if (!adminOk(key)) return send(403, "<p style='font-family:sans-serif;padding:2rem'>Wrong or missing key. Open /admin/payments?key=YOUR_PAYMENT_ADMIN_KEY</p>");
  const rows = await adminList();
  const received = VERIFY ? await incomingList() : [];
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const when = (d) => new Date(d).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
  const pending = rows.filter((x) => x.status === "pending");
  const auto = rows.filter((x) => x.status === "auto");
  const done = rows.filter((x) => x.status !== "pending" && x.status !== "auto");
  const card = (x, buttons) => `<div class="c"><div><b>₱${esc(x.amount)}</b> · ${esc(x.plan === "year" ? "1 year" : "1 month")} · <span class="s ${esc(x.status)}">${esc(x.status)}</span></div>
    <div>Reference: <code>${esc(x.reference)}</code> <button class="cp" data-copy="${esc(x.reference)}">Copy</button></div><div class="m">${esc(x.email)} <button class="cp" data-copy="${esc(x.email)}">Copy</button> · ${esc(when(x.created_at))}</div>${buttons}</div>`;
  send(200, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Komute payments</title>
<style>body{font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:1rem;background:#f5f7f4}h1{font-size:1.3rem}.c{background:#fff;border-radius:12px;padding:.8rem 1rem;margin:.6rem 0;box-shadow:0 1px 4px #0002}
.m{color:#666;font-size:.85rem}code{background:#eef;padding:1px 6px;border-radius:6px;font-size:1rem}button{border:0;border-radius:10px;padding:.55rem 1rem;font-weight:700;margin:.5rem .4rem 0 0;font-size:1rem}
button.cp{padding:.1rem .5rem;margin:0 0 0 .3rem;font-size:.75rem;background:#e0e7ff;border-radius:6px}#q{width:100%;padding:.6rem;border:1px solid #ccc;border-radius:10px;font-size:1rem;margin:.4rem 0}.ok{background:#047857;color:#fff}.no{background:#e5e7eb}.s.pending,.s.auto{color:#b45309}.s.approved{color:#047857}.s.rejected{color:#b91c1c}</style>
<h1>Komute payments</h1><p class="m">Open your GCash / Maya / bank app, find a payment with the same reference and amount, then tap Approve. Approve each payment once.</p>
<input id="q" placeholder="Search reference or email">
${VERIFY ? `<p class="m"><b>Automatic checking is ON.</b> A reference number is approved by itself when the GCash message for the exact amount arrives. Money received so far: ${received.length}${received.slice(0, 8).map((x) => `<br>₱${esc(x.amount)} · <code>${esc(x.reference)}</code>`).join("")}</p>` : ""}
<h2 style="font-size:1.05rem">Waiting (${pending.length})</h2>
${pending.map((x) => card(x, `<button class="ok" data-id="${esc(x.id)}" data-a="approve">Approve</button><button class="no" data-id="${esc(x.id)}" data-a="reject">Reject</button>`)).join("") || "<p>Nothing waiting.</p>"}
${AUTO ? `<h2 style="font-size:1.05rem">Unlocked instantly, please check (${auto.length})</h2><p class="m">These accounts were unlocked as soon as the reference number was sent. Look for the same reference in your GCash history. Tap Confirm if it is there, or Revoke to take the access back.</p>
${auto.map((x) => card(x, `<button class="ok" data-id="${esc(x.id)}" data-a="confirm">Confirm</button><button class="no" data-id="${esc(x.id)}" data-a="revoke">Revoke</button>`)).join("") || "<p>Nothing to check.</p>"}` : ""}
<h2 style="font-size:1.05rem">Done</h2>${done.map((x) => card(x, "")).join("") || "<p>None yet.</p>"}
<script>document.getElementById("q").oninput=e=>{const v=e.target.value.toLowerCase();document.querySelectorAll(".c").forEach(c=>c.style.display=c.textContent.toLowerCase().includes(v)?"":"none")};
document.querySelectorAll("button.cp").forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copy);b.textContent="Copied"}catch{prompt("Copy:",b.dataset.copy)}});
const KEY=${JSON.stringify(key)};document.querySelectorAll("button[data-id]").forEach(b=>b.onclick=async()=>{
if(!confirm(b.dataset.a[0].toUpperCase()+b.dataset.a.slice(1)+" this payment?"))return;b.disabled=true;
const r=await fetch("/api/admin/payments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:KEY,id:b.dataset.id,action:b.dataset.a})});
const d=await r.json().catch(()=>({}));if(!r.ok){alert(d.error||"Error");b.disabled=false;return}location.reload()});</script>`);
}
