// Komute website settings.
// API_BASE: where the Komute backend lives. "" = the same server that serves this website
// (what you get with `npm start` in /backend). If you host the website somewhere else,
// put the backend address here, for example "https://your-backend.example.com".
// MAP_STYLE: the map look. OpenFreeMap is free and needs no key.
//   Other free styles: "https://tiles.openfreemap.org/styles/bright", ".../positron"
// ROUTER: free OpenStreetMap road routing (walk / drive / bike paths and turn-by-turn).
window.KOMUTE_CONFIG = {
  API_BASE: "",
  MAP_STYLE: "https://tiles.openfreemap.org/styles/liberty",
  ROUTER: "https://routing.openstreetmap.de"
};
