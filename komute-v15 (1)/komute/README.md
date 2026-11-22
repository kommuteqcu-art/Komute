# Komute Web (Version 15)

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

### Is the AI working?
Open **http://localhost:8080/api/ai-status**, or run `npm run check-ai` in `backend`.
It tells you which model answered, or what is wrong (bad key, quota used up, model retired).

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
| `backend/server.mjs` | Website server, place search (OpenStreetMap), Gemini AI plan |
| `backend/.env.example` | Settings template (copy to `.env`) |
| `web/js/config.js` | Backend address, map style, router |
| `web/js/i18n.js` | All English and Tagalog text |
| `web/js/data/` | Fares, Q City Bus routes, stations, landmarks, guide topics. Edit these when fares change |
| `web/js/lib/` | Map, sensors (GPS/compass), navigation, fare estimate, plan cards, API |
| `web/js/views/` | One file per screen |

## Notes

- "My location", the compass, and navigation work on `localhost` and **HTTPS** sites only (browser rule).
  On iPhone, tap the compass button once and allow motion access.
- Road paths and turn-by-turn come from the free OpenStreetMap router. They follow roads, not jeepney or bus routes.
- Fares are published rates (checked November 22, 2026), not live prices. Update `web/js/data/fares.js` when they change.
- Never share or upload your `.env` file. It holds your Gemini key.
- To host the website somewhere else, copy `web` there and set `API_BASE` in `web/js/config.js`.
