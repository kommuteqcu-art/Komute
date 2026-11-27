# Komute Web (Version 18)

A step-by-step commute guide for Quezon City: where to ride, which signboard to look for, where to get off,
and how much it costs. It works on phones and computers, in **English and Tagalog**.

## Run it (Windows)

1. Install **Node.js 20 or newer** (nodejs.org, LTS).
2. Keep this folder layout. The server looks for `web` right next to `backend`:
   ```
   komute/
     backend/   server.mjs, package.json, .env
     web/       index.html, css/, js/, assets/
   ```
3. Put your **`.env`** in `backend/`. If you don't have one yet, copy `.env.example` to `.env`.
   Then paste your Gemini key after `GEMINI_API_KEY=`. Get a key at https://aistudio.google.com/apikey.
   New keys start with `AQ.`, and that is normal.
4. Double-click `backend/start-windows.bat`, or open Command Prompt in `backend` and run `npm start`.
5. Open **http://localhost:8080**.

You don't need `npm install` or a database.

### Backup AI (if Gemini says "busy")
Gemini's free tier is often overloaded. Add a free **Groq** key as a backup:
1. Sign in at https://console.groq.com/keys and press **Create API Key** (it starts with `gsk_`).
2. In `backend/.env`, paste it after `GROQ_API_KEY=`, save, and restart the server.

Komute then tries Gemini first and switches to Groq automatically. To use Groq first, set `AI_PROVIDER=groq`.
OpenRouter (`OPENROUTER_API_KEY`) works the same way.

### Is the AI working?
Open **http://localhost:8080/api/ai-status**, or run `npm run check-ai` in `backend`.
It tells you which model answered, or what is wrong (bad key, quota used up, model retired).

## Accounts and payments (5 free plans, then ₱10/month or ₱99/year)

Switched off until the keys below are set; without them Komute is free with no sign-in.

1. **Supabase** (free, https://supabase.com): make a project. In **SQL Editor**, paste `backend/supabase.sql` and click **Run**.
   For a class demo, turn off **Authentication → Sign In / Providers → Email → Confirm email** so new accounts can sign in right away.
   Copy the **Project URL**, the **Publishable key**, and a **Secret key** (Project Settings → API Keys).
2. **PayMongo** (https://dashboard.paymongo.com): **Developers → API Keys**, copy the **Secret key**. `sk_test_` keys use practice money.
3. In Render → **Environment**, add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `PAYMONGO_SECRET_KEY`.
4. Check `https://YOUR-SITE/health`: the `billing` part should say `accounts: on` and `payments: PayMongo TEST mode`.

**No PayMongo? Use manual payment:** set `PAY_METHOD_NAME`, `PAY_ACCOUNT_NAME`, `PAY_ACCOUNT_NUMBER` and `PAYMENT_ADMIN_KEY` (at least 8 characters, a secret word) in Render.
People pay your GCash/Maya/bank, type the reference number, and you approve it at `https://YOUR-SITE/admin/payments?key=PAYMENT_ADMIN_KEY`.
Run `backend/supabase.sql` again so the `manual_payments` table exists. If `PAYMONGO_SECRET_KEY` is also set, PayMongo is used instead.

Payments through PayMongo are GCash, Maya and QR Ph only (a card fee is more than ₱10). After paying, PayMongo sends the person back to Komute,
which checks the payment with PayMongo and adds 30 or 365 days. Optional backup: a PayMongo webhook for the event
`checkout_session.payment.paid` pointing to `https://YOUR-SITE/api/paymongo-webhook`.
For real money (`sk_live_`), PayMongo needs a registered business (DTI) within 30 days of activation.

### Google sign-in on localhost

1. In `backend/.env`, set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `GOOGLE_LOGIN=on`. Get the URL and keys from the Supabase project with the Google provider enabled and the Komute schema installed. Keep the secret key in the backend environment.
2. In Supabase, open **Authentication → URL Configuration → Redirect URLs** and add `http://localhost:8080/auth/callback`. Use the exact host and port you open in the browser. Keep your deployed site as the **Site URL**. [Supabase redirect URL documentation](https://supabase.com/docs/guides/auth/redirect-urls)
3. Restart the local server with `npm start`. Open [Komute on localhost](http://localhost:8080/) and choose **Sign in → Continue with Google**.

## What's new in Version 18

| Change | Where |
|---|---|
| **Step-by-step guide for new users.** On the first visit (not signed in) a welcome card asks: **Start the guide** or **Skip, I'll use it now**. Part 1 highlights each part of the Plan screen one at a time (the four screens, theme and language, sign in, Step 1 start, My location, pin on map / saved places, Step 2 destination, swap, the map, New commuter mode, Get my commute guide). Part 2 starts by itself when the first plan appears (the ride tabs, the plan header, where to wait, the signboard, other jeeps going your way, where to get off, share, the map, Saved / Fares / Guide). Every step has Back, Next and Skip guide (Esc also skips). It is shown once; **Show me around** on the Guide screen and in the "New here?" box starts it again. English and Tagalog, Light and Dark, computer and phone. | `web/js/lib/tour.js`, `web/index.html`, `web/css/styles.css`, `web/js/i18n.js`, `web/js/app.js`, `web/js/views/results.js` |
| **One kind of PUV per plan when possible.** Komute avoids mixing kinds of PUV (for example jeep then bus, or jeep then EDSA Carousel). The Jeep, Bus and UV Express tabs keep only plans with that one kind when there are any; Best way drops a mixed plan when a one-kind plan with no more rides exists and is not much slower; a connecting ride is the same kind as the main ride when one goes there. A tab whose only plans mix kinds, while the Best way uses one kind, says so and points to the Best way. | `backend/transit.mjs`, `backend/server.mjs` |
| **One route when one route goes there.** When a single jeep, bus or UV route goes from start to destination (a tricycle at the ends is fine), the Jeep, Bus and UV tabs show only that, not plans that change between routes. In Best way, the one-route plan comes first unless a plan with a transfer is more than 20 minutes faster. | `backend/transit.mjs`, `backend/server.mjs` (`fewestRides`) |
| **Few transfers, counting the connecting ride.** A tricycle or other connecting ride counts as a ride. Each plan now says "Direct, no transfer", "1 transfer" or "2 transfers (incl. tricycle / connecting ride)". A plan with one more ride is shown only when it is at least 10 minutes faster than the best plan with the fewest rides, and a 3-ride plan is shown only when even the Best way needs 3 (otherwise that tab says it needs too many transfers). | `backend/transit.mjs`, `backend/server.mjs` (`fewestRides`), `web/js/lib/plan-view.js` |
| **All jeepney routes that go your way.** Every jeep step now has a list "N jeepney routes go your way (tap to compare)": one row per route with its signboard, traditional or modern (aircon), its fare, and its route number or LTFRB name. It includes the routes on the same stretch and routes whose road passes close to where you board and where you get off. Riders can take whichever comes first or pick aircon or cheaper, and more routes (and drivers) get passengers. | `backend/transit.mjs` (`alongWay`, `choices` in `rideStep`), `web/js/lib/plan-view.js`, `web/css/styles.css` |
| **Shorter, simpler plans for beginners.** Komute now ranks plans the way a newcomer needs them: the most direct route first. A roundabout plan (for example north to Fairview and then back west) is ranked lower, and is dropped when a fairly direct plan with no more rides exists. A tricycle at either end, or a signboard Komute has not confirmed, also counts against a plan. The AI is told the same: shortest and simplest, big easy-to-find places to board and get off, no detours. | `backend/transit.mjs` (`score`, `detour`), `backend/server.mjs` (FOR BEGINNERS rule) |
| **Jeepney routes from LTFRB's official list.** Komute now uses LTFRB-NCR's "List of PUJ routes with consolidated entities as of December 31, 2023" (Memorandum Circular 2023-052): 227 franchise names start, end, or pass through Quezon City. 27 new jeepney routes were added to the trip planner (for example Balara – Philcoa, Anonas – Lagro, Fairview – Cubao, Fairview – Philcoa, Lagro – Welcome Rotonda, Zabarte – Panay Ave., Project 2 & 3 / 6 / 8 – TM Kalaw, Pantranco – UP, SM North – Katipunan via C-5, NPC/NIA Village – SM North, Marcos Ave. – Quirino Hwy. via Tandang Sora, Payatas – Ever Gotesco, Bagong Silangan – Ever Gotesco, Jordan Plains – QC Hall via Commonwealth with its last stop at Philcoa; its terminal point is approximate), and Litex – TM Kalaw became Fairview – TM Kalaw. Every jeep step shows its name on the LTFRB list. The Fares screen lists all 227 names with a search box; a check mark means the route is in the planner. The list has only names (no stops or signboard text), so the new routes follow the roads in their names and are marked "ask the driver". | `web/js/data/ltfrb-jeep.js` (the list), `web/js/data/routes.js` (`ltfrb:` names, new routes and points), `backend/transit.mjs`, `web/js/lib/plan-view.js`, `web/js/views/fare-page.js` |
| **Themes: Light, Dark, and System.** Tap the round button next to EN/TL in the header: each tap switches Light → Dark → System, and a short note shows which one is on. **System** (the default) follows the phone or computer and changes by itself when the device switches to dark mode at night. The choice is saved on the device. The map keeps its normal look (Streets, Light or Satellite, as you chose with the map button) in every theme. The jeepney signboard keeps its yellow look, and the payment QR code stays black on white so it still scans. | `web/js/lib/theme.js`, `web/index.html` (header switch and the small script at the top that sets the theme before the page shows, so there is no white flash), `web/css/styles.css` (Themes section at the end), `web/js/i18n.js` |

## What's new in Version 17

| Change | Where |
|---|---|
| **Kind of vehicle on every ride.** Jeepney steps say *traditional jeepney* (open-air, no aircon) or *modern jeepney* (aircon). City bus steps say *aircon bus* or *ordinary bus*; when both run on the route, the plan shows them separately ("Ordinary bus · no aircon" and "Aircon bus" chips, and "Ordinary about ₱25 · Aircon about ₱30" for the fare). When several routes share a stretch, the signboards are grouped by kind, each with its own fare and route numbers, for example "Traditional jeepney · no aircon: NOVALICHES – BALINTAWAK / BLUMENTRITT / RIZAL AVE." and "Modern jeepney · aircon: NOVALICHES – BLUMENTRITT". The plan's header chips show the same kinds. | `backend/transit.mjs` (`vehicleClass`, `signsFor`, `rideStep`), `web/js/lib/plan-view.js`, `web/css/styles.css` |
| **Set the kind per route.** In `web/js/data/routes.js`, add `ac: "aircon"` or `ac: "ordinary"` to a city bus route once you have confirmed it; leave it out when both kinds run (the default). A modern jeepney route without aircon gets `ac: "ordinary"`. | `web/js/data/routes.js` |
| **Fewer transfers.** At most 3 rides per plan (a tricycle counts), never the same route twice, and the plans with the fewest rides first. | `backend/transit.mjs`, `backend/server.mjs` |

## What's new in Version 16

Version 16 combines the team's Version 15 update (search as you type, schools and barangays, buses near your trip, transit layer from OpenStreetMap, feedback, Render deploy files, Gemini/Groq/OpenRouter backup) with the new route engine below.


| Change | Where |
|---|---|
| **Fewer transfers.** A plan has at most 3 rides (a tricycle counts as a ride) and never rides the same route twice. Each tab shows only the plans with the fewest rides (a 2-ride plan may appear next to a 1-ride plan). A tab that needs 2 or more extra rides than the Best way says so and points to the Best way. If a bus or jeep already passes near you, Komute no longer has you ride something else first to catch it. | `backend/transit.mjs` (`MAX_RIDES`, `rideLimit`, `staysOn`), `backend/server.mjs` (`fewestRides`) |
| **Separate plans for every way to travel**: tabs for Best way, Jeep, Bus, UV Express, and Taxi. In each tab that kind of ride is the main ride. When a tab has no public transport for the trip, it says why and suggests **ride-hailing** instead (Grab, Angkas/JoyRide/Move It) | Results |
| **Correct signboards, in the direction you travel.** Example: going toward Balintawak you look for `NOVALICHES – BALINTAWAK / BLUMENTRITT` (via Quirino Hwy. / A. Bonifacio); going back you look for `BALINTAWAK / BLUMENTRITT – NOVALICHES`. Wrong AI signs like `QUIRINO HIGHWAY – NOVALICHES` are fixed automatically | backend/transit.mjs |
| **Exact place to wait** ("platform"): the stop and the side of the road, the EDSA Carousel station and Northbound/Southbound side, the train platform direction, the UV Express terminal | Every ride step |
| **Route data** for 56 routes: jeepneys and modern jeeps, regular **city buses** (Routes 3, 6, 7, 13/20, 16/59, 17, 18, 33, 34, 36/39/41, 50, 53), the **EDSA Carousel** with all Quezon City stations, all 8 **Q City Bus** routes with their real stops, UV Express, MRT-3, LRT-1, LRT-2 | web/js/data/routes.js |
| **No more unfinished plans**: every option starts at A and ends at B, every ride has a "Get off at"; an AI answer that was cut off is repaired; if the AI is busy or out of quota, Komute still gives a full plan from its route data | backend/server.mjs |
| **Backup AI**: Groq and OpenRouter (free tiers) are now really used when Gemini fails. Add `GROQ_API_KEY` and/or `OPENROUTER_API_KEY` in `.env` | backend/server.mjs |
| **No long walks, safest connecting rides**: anything farther than about 300 m becomes a ride. Connecting rides use the safest public transport first: MRT/LRT, then the EDSA Carousel, then a city bus or Q City Bus, then a jeep (for example jeep → EDSA Carousel instead of a long tricycle ride). A **tricycle** is used only for a short gap no route covers, with a motorcycle-taxi price as a backup. A tricycle is suggested **only where a registered TODA serves the area** (all 136 TODAs from the Quezon City government's "Tricycle Operators and Drivers 2026" list, each mapped to the area it is named after), and the step names that TODA. Malls, business districts, and campuses (SM North/TriNoma, QC Hall/Quezon Memorial Circle, Araneta City, Eton Centris, UP Diliman, Eastwood) have no tricycles. Everywhere else the plan says to walk. Edit `todas` and `noTricycle` in `web/js/data/routes.js` | Every plan |
| **No walking to the jeep or bus**: if your start (or destination) is on the road a jeep or bus uses, the plan says to wait right there, with no "walk to the boarding area" step. A walk at the end is replaced by a connecting jeep or bus (or a TODA tricycle). A walk is left only when nothing else covers a short stretch | Every plan |
| **Board right where you are**: jeepneys and city buses can be flagged down anywhere along their road, so if you start (or end) on a road a route uses, for example Commonwealth Ave., the plan says to wait right there instead of sending you by tricycle to a farther stop | Every plan |
| **Combined rides**: a plan can join 2 to 3 rides (for example jeep → bus → Q City Bus) and says exactly where to get off and transfer and which signboard to look for next | Every plan |
| **Tricycle and Ride-hailing tabs removed**: tricycles appear only as short connecting rides inside a plan; ride-hailing appears only when no public transport works | Results |
| Fares screen lists the Q City Bus routes with all stops, the city buses, the Carousel stations, and the jeepney/UV routes Komute knows | Fares |

### Fixing or adding a route
Open `web/js/data/routes.js`. Each place is listed once in `points` (name, latitude, longitude, road), and each route lists its stops in order.
The signboard is made from `ends` (first end → second end), so write the two terminals exactly as painted on the vehicle.
Coordinates are approximate; correct a point once and every route that uses it is fixed. Restart the server after editing.

## What's new in Version 15

| Feature | Where |
|---|---|
| Choose the starting point: type it, use **My location**, pick from **Saved & landmarks** (16 popular QC places), use **recent trips**, or **pin it on the map** (drag the map under the center pin) | Plan screen |
| Save your own places (☆ star) and delete them | Plan → ☆, Saved screen |
| **English / Tagalog** switch (EN \| TL). The AI writes the plan in the chosen language | Header |
| New **vector map** (MapLibre + OpenFreeMap): sharp on phones, rotate and tilt, Streets/Light/Satellite styles | All maps |
| **Compass** button (tap to face north), heading cone on your blue dot, and a **"Which way do I go?"** arrow to your destination or the nearest train station | Results |
| **Live navigation** like Google Maps: heading-up map, big next-turn arrow, a guide arrow that points where to walk, rerouting, optional voice, screen stays on | Results → Walk/Drive/Bike → Start navigation |
| Fares updated to the **LTFRB rates in force since September 28, 2026**, plus Q City Bus (free), UV Express, motorcycle taxi, taxi, Grab, and the MRT-3/LRT-2 50% discount | Fares screen, fare estimate |
| Fare estimate for every mode, including train fares when both ends are near stations and student/senior/PWD prices | Plan and Results |
| Plan cards: "Ride here", a **signboard** picture of the jeepney sign to look for, "Get off at", fare and time per option, **Share this plan** | Results |
| Phone friendly: bottom tab bar, big buttons, sticky main button, map plus bottom sheet. Can be added to the home screen | Everywhere |
| AI fixed: current Gemini models with automatic fallback, structured JSON plan, clear error messages | backend/server.mjs |

## Folders

| File | What it does |
|---|---|
| `backend/server.mjs` | Website server, place search (OpenStreetMap), AI plan (Gemini, then Groq, then OpenRouter) |
| `backend/transit.mjs` | Route engine: finds real routes, writes signboards in the right direction, checks and fixes the AI plan |
| `backend/.env.example` | Settings template (copy to `.env`) |
| `web/js/config.js` | Backend address, map style, router |
| `web/js/i18n.js` | All English and Tagalog text |
| `web/js/data/` | Fares, route data (`routes.js`), stations, landmarks, guide topics. Edit these when fares or routes change |
| `web/js/lib/` | Map, sensors (GPS/compass), navigation, fare estimate, plan cards, API |
| `web/js/views/` | One file per screen |

## Notes

- "My location", the compass, and navigation work on `localhost` and **HTTPS** sites only (browser rule).
  On iPhone, tap the compass button once and allow motion access.
- Road paths and turn-by-turn come from the free OpenStreetMap router. They follow roads, not jeepney or bus routes.
- Route data was checked on November 23, 2026 against the LTFRB route list, the OpenStreetMap jeepney/UV list, and the Q City Bus guide. Steps marked "Ask the driver to confirm" use routes Komute could not check.
- Fares are published rates (checked November 22, 2026), not live prices. Update `web/js/data/fares.js` when they change.
- Never share or upload your `.env` file. It holds your Gemini key.
- To host the website somewhere else, copy `web` there and set `API_BASE` in `web/js/config.js`.

## Automatic payment checking (no payment service)

Your GCash sends you a text like "You have received PHP 10.00 ... Ref. No. 1234567890123". Set your phone to forward each one to Komute:

1. Render → Environment: add `PAY_SMS_KEY` (a long secret word, 8+ characters). Run the new `incoming_payments` part of `backend/supabase.sql` in Supabase.
2. On the Android phone that has the GCash number, install a free SMS-forwarding app (for example "SMS Forwarder" or MacroDroid). Rule: when an SMS from GCash arrives, send an HTTP POST to
   `https://komute.onrender.com/api/gcash-sms?key=YOUR_PAY_SMS_KEY` with the message text as the body.
3. Done. A reference number is accepted only if a received-money message with that number and the exact price (₱10 or ₱99) has arrived. A wrong amount is refused.

### No reference number needed
When automatic checking is on, a person taps **Get my payment amount** and receives their own amount, for example ₱10.37 (₱10.01 to ₱10.49, or ₱99.01 to ₱99.49 for the year). They send exactly that amount to your GCash. When the GCash message arrives, the account with that amount unlocks by itself. The amount is held for 30 minutes (`PAY_REQUEST_MINUTES`). Run the new `payment_requests` part of `backend/supabase.sql` once.


## Payment check: email to Gmail and automatic approve / reject
When a person taps **Check my payment**, Komute emails the details (account, plan, reference) to `MAIL_TO` (default kommuteqcu@gmail.com). The KSFApp on your phone reads the GCash "received" message and sends it to Komute. Then:

- reference found and the amount is right: **approved** automatically;
- reference found but the amount is wrong: **rejected** automatically;
- no matching GCash message within `PAY_WAIT_MINUTES` (default 10): **rejected** automatically.

Every result is also emailed to you. To turn the emails on, add `GMAIL_USER` (the Gmail that sends) and `GMAIL_APP_PASSWORD` (a Google App Password, needs 2-Step Verification) in Render. If they are missing, checking still works, only the emails are skipped.

### Sending the email on Render's free plan
Render's free plan blocks the normal email ports, so `GMAIL_USER` / `GMAIL_APP_PASSWORD` do not work there. Use the free Google script instead:

1. Sign in to the Gmail (kommuteqcu@gmail.com). Go to script.google.com > New project. Delete the sample code and paste in `mail-hook/Komute-Mail.gs`. Change `KEY` to the same value as `PAY_SMS_KEY`.
2. Pick `testMail` at the top and press Run. Allow the permissions (Google may say "unverified app": Advanced > Go to project, it is your own script). A test email should arrive.
3. Deploy > New deployment > gear icon > Web app. Execute as **Me**, Who has access **Anyone**. Deploy and copy the Web app URL.
4. In Render > Environment add `MAIL_HOOK_URL` with that URL. Save.

### Phone notification (optional, free)
Gmail does not buzz for email you send to yourself, so Komute can also push a message to your phone with ntfy: install the **ntfy** app (Play Store), tap **+**, subscribe to a long secret topic name (for example `komute-payments-x7k2q9m4w8`), and add that same name in Render as `NTFY_TOPIC`. Anyone who knows the topic name can read the messages, so make it long and keep it private.
