// One shared object that holds the app's state (like KomuteViewModel in the Android app),
// plus saved places and recent trips kept on this phone/browser.
(function (K) {
  K.state = {
    origin: "Quezon City Hall, Quezon City",
    destination: "",
    originPoint: { latitude: 14.6466, longitude: 121.0496, label: "Quezon City Hall, Quezon City" },
    destinationPoint: null,
    newCommuterMode: K.store.get("newCommuter", true),
    requested: false,
    road: null, // { km, min } from the driving route, used by the fare estimate
    ai: { loading: false, error: null, plan: "", guide: null, sources: [], grounded: false, language: null }
  };

  const TYPES = ["HOME", "SCHOOL", "WORK", "OTHER"];
  K.places = {
    TYPES,
    // Built-in places (js/data/places.js) can be hidden; your own places are added on top.
    all() {
      const hidden = K.store.get("hiddenPlaces", []);
      const builtIn = (K.data().savedPlaces || []).filter((p) => !hidden.includes(p.name + "|" + p.address)).map((p) => ({ ...p, builtIn: true }));
      return [...K.store.get("myPlaces", []), ...builtIn];
    },
    add(place) {
      const mine = K.store.get("myPlaces", []).filter((p) => p.address !== place.address || p.name !== place.name);
      mine.unshift({ name: place.name, address: place.address, type: place.type || "OTHER", lat: place.lat ?? null, lng: place.lng ?? null });
      K.store.set("myPlaces", mine.slice(0, 30));
    },
    remove(place) {
      if (place.builtIn) K.store.set("hiddenPlaces", [...K.store.get("hiddenPlaces", []), place.name + "|" + place.address]);
      else K.store.set("myPlaces", K.store.get("myPlaces", []).filter((p) => !(p.name === place.name && p.address === place.address)));
    },
    // Built-in Home/School/Work names follow the app language.
    label(place) { return place.builtIn && ["HOME", "SCHOOL", "WORK"].includes(place.type) ? K.t("type." + place.type) : place.name; },
    toPoint(place) {
      return Number.isFinite(place.lat) && Number.isFinite(place.lng) ? { latitude: place.lat, longitude: place.lng, label: place.address } : null;
    }
  };

  K.recent = {
    trips: () => K.store.get("recentTrips", []),
    add(s) {
      if (!s.origin || !s.destination) return;
      const t = { origin: s.origin, destination: s.destination, originPoint: s.originPoint, destinationPoint: s.destinationPoint };
      const list = K.recent.trips().filter((x) => !(x.origin === t.origin && x.destination === t.destination));
      list.unshift(t);
      K.store.set("recentTrips", list.slice(0, 5));
    },
    clear() { K.store.set("recentTrips", []); }
  };
})(window.Komute);
