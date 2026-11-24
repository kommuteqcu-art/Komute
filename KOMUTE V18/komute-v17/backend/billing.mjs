// Komute accounts and payments: sign in (Supabase), 5 free route plans, then ₱10/month or ₱120/year (PayMongo).
// If the Supabase keys are not set, everything here is switched off and the app stays free for everyone.
//
// Render "Environment" settings used here:
//   SUPABASE_URL              https://xxxx.supabase.co
//   SUPABASE_PUBLISHABLE_KEY  sb_publishable_...   (older projects: the "anon" key; SUPABASE_ANON_KEY also works)
//   SUPABASE_SECRET_KEY       sb_secret_...        (older projects: the "service_role" key; SUPABASE_SERVICE_KEY also works)
//   PAYMONGO_SECRET_KEY       sk_test_... for practice, sk_live_... for real money
//   FREE_PLANS=5  PRICE_MONTH_PHP=10  PRICE_YEAR_PHP=120   (optional, these are the defaults)

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

export const billingOn = Boolean(SB_URL && SB_PUBLIC && SB_SECRET);
export const paymentsOn = billingOn && Boolean(PM_SECRET);
export function billingStatus() {
  return {
    accounts: billingOn ? "on (Supabase)" : "off (add SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY)",
    payments: paymentsOn ? (PM_SECRET.startsWith("sk_test") ? "PayMongo TEST mode" : "PayMongo LIVE") : "off (add PAYMONGO_SECRET_KEY)",
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
function accountView(user, sub) {
  const paidUntil = sub.paid_until && new Date(sub.paid_until) > new Date() ? sub.paid_until : null;
  return {
    email: user.email, premium: Boolean(paidUntil), paidUntil,
    freeUsed: sub.free_used || 0, freeLimit: FREE_PLANS, freeLeft: Math.max(0, FREE_PLANS - (sub.free_used || 0)),
    prices: { month: PLANS.month.php, year: PLANS.year.php }, paymentsOn
  };
}
export async function account(request) {
  if (!billingOn) return { billing: false };
  const user = await userFrom(request);
  if (!user) return { billing: true, signedIn: false, freeLimit: FREE_PLANS, prices: { month: PLANS.month.php, year: PLANS.year.php } };
  return { billing: true, signedIn: true, ...accountView(user, await getSub(user.id)) };
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
