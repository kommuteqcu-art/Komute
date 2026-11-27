// Fare reference for Quezon City commuters (pesos). Published rates, not live prices.
// LTFRB road fares in force since September 28, 2026. Rail discounts since March 23, 2026.
// Last checked: November 22, 2026. Update this file when fares change.
window.KOMUTE_DATA = window.KOMUTE_DATA || {};
window.KOMUTE_DATA.fares = {
  lastChecked: { en: "November 22, 2026", tl: "Nobyembre 22, 2026" },
  effective: { en: "LTFRB rates in force since September 28, 2026", tl: "Pamasahe ng LTFRB mula Setyembre 28, 2026" },

  road: [
    { icon: "bi-truck-front", mode: { en: "Traditional jeepney", tl: "Jeep (tradisyonal)" },
      fare: { en: "₱14 for the first 4 km, then +₱2.00 per km", tl: "₱14 sa unang 4 km, tapos +₱2.00 kada km" } },
    { icon: "bi-truck-front-fill", mode: { en: "Modern jeepney (aircon/e-jeep)", tl: "Modern jeep (aircon/e-jeep)" },
      fare: { en: "₱17 for the first 4 km, then +₱2.40 per km", tl: "₱17 sa unang 4 km, tapos +₱2.40 kada km" } },
    { icon: "bi-bus-front", mode: { en: "City bus (ordinary)", tl: "City bus (ordinary)" },
      fare: { en: "₱15 for the first 5 km, then +₱2.49 per km", tl: "₱15 sa unang 5 km, tapos +₱2.49 kada km" } },
    { icon: "bi-bus-front-fill", mode: { en: "City bus (aircon)", tl: "City bus (aircon)" },
      fare: { en: "₱18 for the first 5 km, then +₱2.98 per km", tl: "₱18 sa unang 5 km, tapos +₱2.98 kada km" } },
    { icon: "bi-signpost-split", mode: { en: "EDSA Carousel (busway)", tl: "EDSA Carousel (busway)" },
      fare: { en: "Distance-based: about ₱15–₱18 for nearby stops, up to about ₱85 end to end. Open 24/7. Cash or cashless.", tl: "Depende sa istasyon: mga ₱15–₱18 sa malapit, hanggang mga ₱85 dulo hanggang dulo. Cash o Beep card." } },
    { icon: "bi-gift", mode: { en: "Q City Bus (city government)", tl: "Q City Bus (gobyerno ng QC)" },
      fare: { en: "FREE. 8 routes, most start at Quezon City Hall.", tl: "LIBRE. 8 ruta, karamihan nagsisimula sa Quezon City Hall." }, free: true },
    { icon: "bi-car-front", mode: { en: "UV Express", tl: "UV Express" },
      fare: { en: "Provisional per-km rate (about ₱2.60/km, modern about ₱3.00/km). Check the posted fare.", tl: "Pansamantalang rate kada km (mga ₱2.60/km, modern mga ₱3.00/km). Tingnan ang nakapaskil na pamasahe." } },
    { icon: "bi-bicycle", mode: { en: "Tricycle", tl: "Tricycle" },
      fare: { en: "Set by the barangay or city. Ask the driver before you ride.", tl: "Itinatakda ng barangay o lungsod. Tanungin muna ang driver bago sumakay." } },
    { icon: "bi-scooter", mode: { en: "Motorcycle taxi (Angkas, JoyRide, Move It)", tl: "Motorcycle taxi (Angkas, JoyRide, Move It)" },
      fare: { en: "About ₱50 for the first 2 km, then about ₱10 per km. The app shows the exact price.", tl: "Mga ₱50 sa unang 2 km, tapos mga ₱10 kada km. Makikita sa app ang eksaktong presyo." } },
    { icon: "bi-taxi-front", mode: { en: "Taxi (regular)", tl: "Taxi (regular)" },
      fare: { en: "₱65 flag-down (provisional) + ₱13.50 per km + ₱2 per minute", tl: "₱65 flag-down (pansamantala) + ₱13.50 kada km + ₱2 kada minuto" } },
    { icon: "bi-phone", mode: { en: "Grab / TNVS", tl: "Grab / TNVS" },
      fare: { en: "Base ₱55 hatchback, ₱65 sedan, ₱75 SUV, + ₱13–₱18 per km + ₱2 per minute, plus a pick-up fare. Surge can apply.", tl: "Base ₱55 hatchback, ₱65 sedan, ₱75 SUV, + ₱13–₱18 kada km + ₱2 kada minuto, may dagdag na pick-up fare. Puwedeng may surge." } }
  ],

  // Used by js/lib/fare-estimate.js. PUV fares round to the nearest 25 centavos.
  estimate: {
    roadDetourFactor: 1.3,  // straight line x 1.3 when the road distance is not known yet
    trafficKmh: 18,         // average speed used for taxi/Grab time when no route time is known
    puv: [
      { id: "jeep", base: 14, coverKm: 4, perKm: 2.0 },
      { id: "mjeep", base: 17, coverKm: 4, perKm: 2.4 },
      { id: "bus", base: 15, coverKm: 5, perKm: 2.49 },
      { id: "abus", base: 18, coverKm: 5, perKm: 2.98 }
    ],
    uv: { perKm: [2.6, 3.0] },
    mcTaxi: { base: 50, coverKm: 2, perKm: 10, afterKm: 7, perKmAfter: 15 },
    taxi: { flag: 65, perKm: 13.5, perMin: 2 },
    tnvs: { flag: 65, perKm: 15, perMin: 2 }
  },

  // MRT-3 regular fares (before the 50% discount). Stations in or next to Quezon City.
  mrt3: {
    stations: ["North Avenue", "Quezon Avenue", "GMA Kamuning", "Araneta Center-Cubao", "Santolan-Annapolis"],
    pairs: [
      [0, 1, 13], [0, 2, 13], [0, 3, 16], [0, 4, 16],
      [1, 2, 13], [1, 3, 13], [1, 4, 16],
      [2, 3, 13], [2, 4, 13],
      [3, 4, 13]
    ],
    note: { en: "Full line: ₱13 to ₱28 regular (North Avenue to Taft Avenue). Everyone pays 50% less now.",
            tl: "Buong linya: ₱13 hanggang ₱28 regular (North Avenue hanggang Taft Avenue). 50% mas mura ngayon para sa lahat." }
  },

  lrt1: {
    trips: [
      { trip: "Fernando Poe Jr. ↔ Balintawak", beep: 19, sjt: 20 },
      { trip: "Balintawak ↔ Monumento", beep: 20, sjt: 20 },
      { trip: "Fernando Poe Jr. ↔ Monumento", beep: 22, sjt: 25 }
    ],
    range: { en: "Whole line: about ₱16–₱52 with Beep, ₱20–₱55 single journey. No 50% promo on LRT-1.",
             tl: "Buong linya: mga ₱16–₱52 sa Beep, ₱20–₱55 single journey. Walang 50% promo sa LRT-1." }
  },

  lrt2: {
    regular: { en: "₱13 to ₱33 with a Beep card, ₱15 to ₱35 single journey ticket.", tl: "₱13 hanggang ₱33 sa Beep card, ₱15 hanggang ₱35 sa single journey ticket." },
    discounted: { en: "About ₱6.50 to ₱16.50 with Beep, ₱8 to ₱18 single journey (Recto to Antipolo).", tl: "Mga ₱6.50 hanggang ₱16.50 sa Beep, ₱8 hanggang ₱18 sa single journey (Recto hanggang Antipolo)." }
  },

  notes: [
    { en: "MRT-7 is not open yet (partial opening is targeted for 2027). Komute does not plan trips on it.",
      tl: "Hindi pa bukas ang MRT-7 (target na bahagyang pagbubukas sa 2027). Hindi ito ginagamit ng Komute sa plano." }
  ],

  discounts: [
    { en: "MRT-3 and LRT-2: 50% off for every passenger since March 23, 2026, until further notice. Beep cards and ticket machines already show the lower price.",
      tl: "MRT-3 at LRT-2: 50% off para sa lahat ng pasahero mula Marso 23, 2026, hanggang may bagong abiso. Mababang presyo na agad sa Beep card at ticket machine." },
    { en: "LRT-1 has regular fares. Students, seniors, and PWDs still get their rail discount with a valid ID.",
      tl: "Regular ang pamasahe sa LRT-1. May rail discount pa rin ang estudyante, senior, at PWD basta may valid ID." },
    { en: "Jeepneys, buses, and UV Express: 20% off for students, senior citizens, and PWDs. Show your ID when you pay.",
      tl: "Jeep, bus, at UV Express: 20% off para sa estudyante, senior citizen, at PWD. Ipakita ang ID kapag nagbabayad." },
    { en: "Q City Bus is free for everyone.", tl: "Libre ang Q City Bus para sa lahat." }
  ]
};
