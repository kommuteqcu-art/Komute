# Komute Web (Version 16)

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

## What's new in Version 16

Version 16 combines the team's Version 15 update (search as you type, schools and barangays, buses near your trip, transit layer from OpenStreetMap, feedback, Render deploy files, Gemini/Groq/OpenRouter backup) with the new route engine below.


| Change | Where |
|---|---|
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
