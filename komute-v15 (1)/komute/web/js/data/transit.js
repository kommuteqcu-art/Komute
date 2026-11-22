// Train stations in and next to Quezon City (approximate coordinates) and the free Q City Bus routes.
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
    { line: "LRT-1", idx: 1, name: "Balintawak", lat: 14.6574, lng: 121.0040 }
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
