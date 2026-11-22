// Train stations and EDSA Carousel (busway) stops in and next to Quezon City (approximate coordinates),
// city bus routes that run through Quezon City, and the free Q City Bus routes.
// Sources: Sakay.ph EDSA Busway guide (2026), OpenStreetMap Metro Manila bus route list (2026). Routes change; check signboards.
window.KOMUTE_DATA = window.KOMUTE_DATA || {};
window.KOMUTE_DATA.transit = {
  stations: [
    { line: "MRT-3", idx: 0, name: "North Avenue", lat: 14.6522, lng: 121.0323 },
    { line: "MRT-3", idx: 1, name: "Quezon Avenue", lat: 14.6425, lng: 121.0387 },
    { line: "MRT-3", idx: 2, name: "GMA Kamuning", lat: 14.6352, lng: 121.0434 },
    { line: "MRT-3", idx: 3, name: "Araneta Center-Cubao", lat: 14.6195, lng: 121.0511 },
    { line: "MRT-3", idx: 4, name: "Santolan-Annapolis", lat: 14.6077, lng: 121.0565 },
    { line: "LRT-2", idx: 0, name: "Gilmore", lat: 14.6135, lng: 121.0343 },
    { line: "LRT-2", idx: 1, name: "Betty Go-Belmonte", lat: 14.6186, lng: 121.0430 },
    { line: "LRT-2", idx: 2, name: "Araneta Center-Cubao", lat: 14.6228, lng: 121.0527 },
    { line: "LRT-2", idx: 3, name: "Anonas", lat: 14.6280, lng: 121.0647 },
    { line: "LRT-2", idx: 4, name: "Katipunan", lat: 14.6311, lng: 121.0728 },
    { line: "LRT-1", idx: 0, name: "Fernando Poe Jr.", lat: 14.6574, lng: 121.0211 },
    { line: "LRT-1", idx: 1, name: "Balintawak", lat: 14.6574, lng: 121.0040 },
    // EDSA Carousel (busway) stops in Quezon City, north to south. Stops are in the middle of EDSA (use the footbridge).
    { line: "EDSA Carousel", idx: 0, name: "Balintawak", lat: 14.6576, lng: 121.0018 },
    { line: "EDSA Carousel", idx: 1, name: "Kaingin Road", lat: 14.6575, lng: 121.0122 },
    { line: "EDSA Carousel", idx: 2, name: "Roosevelt", lat: 14.6574, lng: 121.0205 },
    { line: "EDSA Carousel", idx: 3, name: "SM North EDSA", lat: 14.6561, lng: 121.0300 },
    { line: "EDSA Carousel", idx: 4, name: "North Avenue", lat: 14.6528, lng: 121.0326 },
    { line: "EDSA Carousel", idx: 5, name: "Philam QC", lat: 14.6474, lng: 121.0356 },
    { line: "EDSA Carousel", idx: 6, name: "Quezon Avenue", lat: 14.6425, lng: 121.0384 },
    { line: "EDSA Carousel", idx: 7, name: "Kamuning", lat: 14.6351, lng: 121.0433 },
    { line: "EDSA Carousel", idx: 8, name: "Nepa Q-Mart", lat: 14.6262, lng: 121.0473 },
    { line: "EDSA Carousel", idx: 9, name: "Main Avenue (Cubao)", lat: 14.6178, lng: 121.0526 },
    { line: "EDSA Carousel", idx: 10, name: "Santolan", lat: 14.6074, lng: 121.0566 }
  ],

  // Approximate points on main roads, used to guess which buses pass near your start or destination.
  anchors: {
    fairview: [14.7342, 121.0573], commonwealth: [14.6960, 121.0870], philcoa: [14.6540, 121.0560], elliptical: [14.6490, 121.0490],
    quezonAve: [14.6424, 121.0385], quezonAveSouth: [14.6260, 121.0110], northEdsa: [14.6565, 121.0294], cubao: [14.6195, 121.0525],
    katipunanC5: [14.6300, 121.0730], libisC5: [14.6100, 121.0790], eastAve: [14.6420, 121.0470], mindanaoAve: [14.6710, 121.0300],
    eRodriguez: [14.6230, 121.0280], santolan: [14.6074, 121.0566], balintawak: [14.6576, 121.0018]
  },

  // City buses through Quezon City (number, route, main roads in QC). "edsa" = stops at the EDSA Carousel stations.
  busRoutes: [
    { no: "1", name: "EDSA Carousel: Monumento ↔ PITX", via: "EDSA Busway (stations in the middle of EDSA)", anchors: ["edsa"], carousel: true },
    { no: "3", name: "Antipolo ↔ Cubao / Quiapo", via: "Ortigas Ave. Extension, Cubao", anchors: ["cubao", "santolan"] },
    { no: "6", name: "Sapang Palay ↔ PITX", via: "Quezon Avenue", anchors: ["quezonAve", "quezonAveSouth"] },
    { no: "6A", name: "Sapang Palay ↔ NIA Road", via: "East Avenue", anchors: ["eastAve", "elliptical"] },
    { no: "7", name: "Fairview ↔ PITX", via: "Commonwealth Ave., Elliptical Rd., Quezon Ave.", anchors: ["fairview", "commonwealth", "philcoa", "elliptical", "quezonAve", "quezonAveSouth"] },
    { no: "17", name: "Fairview ↔ Ayala", via: "Commonwealth Ave., Quezon Ave. (Eton Centris)", anchors: ["fairview", "commonwealth", "philcoa", "elliptical", "quezonAve", "quezonAveSouth"] },
    { no: "18", name: "North EDSA ↔ PITX", via: "SM North EDSA, C-5", anchors: ["northEdsa", "katipunanC5", "libisC5"] },
    { no: "33", name: "Starmall SJDM ↔ North EDSA", via: "Fairview, SM North EDSA", anchors: ["fairview", "northEdsa"] },
    { no: "33X", name: "Fairview ↔ One Ayala", via: "Commonwealth Ave., EDSA Busway", anchors: ["fairview", "commonwealth", "philcoa", "edsa"] },
    { no: "34", name: "Rodriguez (Montalban) ↔ PITX", via: "Commonwealth Ave., Quezon Ave. (Eton Centris)", anchors: ["commonwealth", "philcoa", "elliptical", "quezonAve", "quezonAveSouth"] },
    { no: "36", name: "Fairview ↔ Alabang", via: "Commonwealth Ave., Quezon Ave.", anchors: ["fairview", "commonwealth", "philcoa", "elliptical", "quezonAve"] },
    { no: "38", name: "Fairview ↔ Pacita Complex (via Ayala)", via: "Commonwealth Ave., Quezon Ave.", anchors: ["fairview", "commonwealth", "philcoa", "elliptical", "quezonAve", "quezonAveSouth"] },
    { no: "39", name: "Fairview ↔ Pacita Complex (via C-5)", via: "Commonwealth Ave., C-5", anchors: ["fairview", "commonwealth", "katipunanC5", "libisC5"] },
    { no: "40", name: "Fairview ↔ Alabang (via Ayala)", via: "Commonwealth Ave., Quezon Ave.", anchors: ["fairview", "commonwealth", "philcoa", "elliptical", "quezonAve", "quezonAveSouth"] },
    { no: "41", name: "Fairview ↔ FTI (Taguig)", via: "Commonwealth Ave., C-5", anchors: ["fairview", "commonwealth", "katipunanC5", "libisC5"] },
    { no: "49", name: "Starmall SJDM ↔ NAIA", via: "Quezon Ave. (Eton Centris)", anchors: ["quezonAve", "quezonAveSouth"] },
    { no: "51", name: "Valenzuela Gateway ↔ Cubao", via: "Mindanao Ave., SM North EDSA, Cubao", anchors: ["mindanaoAve", "northEdsa", "cubao"] },
    { no: "53", name: "Cubao ↔ Pacita Complex", via: "E. Rodriguez Sr. Ave.", anchors: ["cubao", "eRodriguez"] },
    { no: "61", name: "Cubao ↔ Dasmariñas", via: "Cubao (LRT-2 Araneta Center-Cubao)", anchors: ["cubao"] }
  ],

  // Free city buses (Quezon City government, "Libreng Sakay"). Most routes start at Quezon City Hall.
  qcityBus: {
    routes: [
      { no: 1, name: "Quezon City Hall ↔ Cubao" },
      { no: 2, name: "Quezon City Hall ↔ Litex / IBP Road" },
      { no: 3, name: "Welcome Rotonda ↔ Aurora Blvd. / Katipunan" },
      { no: 4, name: "Quezon City Hall ↔ General Luis (Novaliches)" },
      { no: 5, name: "Quezon City Hall ↔ Mindanao Avenue" },
      { no: 6, name: "Quezon City Hall ↔ Gilmore" },
      { no: 7, name: "Quezon City Hall ↔ C5 / Ortigas Avenue Extension" },
      { no: 8, name: "Quezon City Hall ↔ Muñoz" }
    ],
    note: { en: "Free for everyone. Buses run during the day and stop on some holidays. Check the Quezon City government page for today's schedule and exact stops.",
            tl: "Libre para sa lahat. Bumibiyahe sa araw at may tigil sa ilang holiday. Tingnan ang page ng Quezon City government para sa schedule at eksaktong hintuan." },
    link: "https://quezoncity.gov.ph/qcitizen-guides/quezon-city-bus-service-program/"
  }
};
