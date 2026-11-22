// Commuter guide topics (English + Tagalog): short steps first, then good-to-know tips.
window.KOMUTE_DATA = window.KOMUTE_DATA || {};
window.KOMUTE_DATA.guideTopics = [
  { id: "komute", icon: "bi-phone",
    title: { en: "How to use Komute", tl: "Paano gamitin ang Komute" },
    subtitle: { en: "Start here: 4 easy steps", tl: "Simulan dito: 4 na madaling hakbang" },
    steps: {
      en: ["Set where you start: type a place, press “My location”, pick a saved place or landmark, or pin it on the map.",
           "Set where you are going the same way. Tap the right place in the list.",
           "Press “Get my commute guide”. Komute shows 2–3 options with where to ride, the signboard to look for, and where to get off.",
           "On the trip page, open the Walk tab and press “Start navigation” to follow the arrow and compass to your stop."],
      tl: ["Ilagay kung saan ka manggagaling: mag-type ng lugar, pindutin ang “Lokasyon ko”, pumili sa saved o landmark, o i-pin sa mapa.",
           "Ilagay kung saan ka pupunta sa parehong paraan. I-tap ang tamang lugar sa listahan.",
           "Pindutin ang “Kunin ang gabay sa biyahe”. Ipapakita ang 2–3 paraan: saan sasakay, anong karatula ang hahanapin, at saan bababa.",
           "Sa trip page, buksan ang Lakad tab at pindutin ang “Simulan ang nabigasyon” para sundan ang arrow at compass papunta sa sakayan."] },
    tips: {
      en: ["Komute covers Quezon City only.", "Switch English / Tagalog anytime with the EN | TL button at the top.", "Add Komute to your home screen: in your phone browser menu, choose “Add to Home screen”."],
      tl: ["Quezon City lang ang sakop ng Komute.", "Puwedeng palitan ang English / Tagalog gamit ang EN | TL sa itaas.", "Idagdag ang Komute sa home screen: sa menu ng browser ng phone, piliin ang “Add to Home screen”."] } },

  { id: "jeepney", icon: "bi-truck-front",
    title: { en: "Riding a jeepney", tl: "Pagsakay sa jeep" },
    subtitle: { en: "Signboards, paying, and getting off", tl: "Karatula, pagbabayad, at pagbaba" },
    steps: {
      en: ["Wait at a loading area or jeepney stop on the correct side of the road (the side going your way).",
           "Read the signboard on the windshield and the side. Both ends of the route are written there, for example “CUBAO – QUIAPO”.",
           "Board, sit, and pass your fare forward: say “Bayad po” and where you are getting off.",
           "Watch for your stop. Say “Para po” clearly a few seconds before it."],
      tl: ["Maghintay sa loading area o sakayan ng jeep sa tamang bahagi ng kalsada (papunta sa direksyon mo).",
           "Basahin ang karatula sa harap at gilid. Nakasulat ang dalawang dulo ng ruta, halimbawa “CUBAO – QUIAPO”.",
           "Sumakay, umupo, at iabot ang bayad: sabihin ang “Bayad po” at kung saan ka bababa.",
           "Bantayan ang bababaan mo. Sabihin nang malinaw ang “Para po” ilang segundo bago dumating."] },
    tips: {
      en: ["Prepare coins and small bills.", "Not sure? Ask the driver “Dadaan po ba kayo sa …?” before you board.", "Modern jeepneys often have a door at the back or side and may accept Beep or e-wallets."],
      tl: ["Maghanda ng barya at maliit na pera.", "Hindi sigurado? Itanong sa driver “Dadaan po ba kayo sa …?” bago sumakay.", "Kadalasang may pinto sa likod o gilid ang modern jeep at puwedeng tumanggap ng Beep o e-wallet."] } },

  { id: "bus", icon: "bi-bus-front",
    title: { en: "Buses, EDSA Carousel, and Q City Bus", tl: "Bus, EDSA Carousel, at Q City Bus" },
    subtitle: { en: "Including the FREE city bus", tl: "Kasama ang LIBRENG city bus" },
    steps: {
      en: ["City buses stop at marked bus stops. Check the route sign on the front.",
           "EDSA Carousel buses stop only at busway stations in the middle of EDSA. Tap your Beep card or pay cash.",
           "Q City Bus is free. Wait at a Q City Bus stop (many routes start at Quezon City Hall) and check the route number.",
           "Tell the conductor your stop. Press the bell or say “Para po” before it."],
      tl: ["Humihinto ang city bus sa mga bus stop. Tingnan ang ruta sa harap.",
           "Ang EDSA Carousel ay humihinto lang sa busway station sa gitna ng EDSA. I-tap ang Beep card o magbayad ng cash.",
           "Libre ang Q City Bus. Maghintay sa Q City Bus stop (marami ang nagsisimula sa Quezon City Hall) at tingnan ang numero ng ruta.",
           "Sabihin sa konduktor ang bababaan mo. Pindutin ang bell o sabihin ang “Para po” bago dumating."] },
    tips: {
      en: ["The Fares page lists all 8 Q City Bus routes.", "Aircon buses cost a little more than ordinary buses."],
      tl: ["Nasa Fares page ang lahat ng 8 ruta ng Q City Bus.", "Medyo mas mahal ang aircon bus kaysa ordinary."] } },

  { id: "train", icon: "bi-train-front",
    title: { en: "Using LRT and MRT", tl: "Pagsakay sa LRT at MRT" },
    subtitle: { en: "Tickets, direction, and transfers", tl: "Ticket, direksyon, at paglipat" },
    steps: {
      en: ["Line up at the station entrance for the bag check.",
           "Buy a single journey ticket or tap a Beep card at the gate.",
           "Check the direction sign: Northbound, Southbound, Eastbound, or Westbound. Match it to your plan.",
           "Let passengers exit first, then board. At a transfer station, follow the signs for your next line.",
           "Keep your ticket or card. You need it to exit."],
      tl: ["Pumila sa entrance ng istasyon para sa bag check.",
           "Bumili ng single journey ticket o i-tap ang Beep card sa gate.",
           "Tingnan ang direksyon: Northbound, Southbound, Eastbound, o Westbound. Itugma sa plano mo.",
           "Paunahin ang mga bababa bago sumakay. Sa transfer station, sundan ang karatula ng susunod na linya.",
           "Itago ang ticket o card. Kailangan ito sa paglabas."] },
    tips: {
      en: ["Araneta Center-Cubao connects MRT-3 and LRT-2 (short walk between them).", "MRT-3 and LRT-2 are 50% off for everyone right now.", "MRT-7 is not open yet."],
      tl: ["Sa Araneta Center-Cubao nagkokonekta ang MRT-3 at LRT-2 (maikling lakad).", "50% off ngayon ang MRT-3 at LRT-2 para sa lahat.", "Hindi pa bukas ang MRT-7."] } },

  { id: "rides", icon: "bi-scooter",
    title: { en: "Tricycle, motorcycle taxi, taxi, and Grab", tl: "Tricycle, motorcycle taxi, taxi, at Grab" },
    subtitle: { en: "When you need door-to-door", tl: "Kapag kailangan ng door-to-door" },
    steps: {
      en: ["Tricycle: go to the toda (terminal). Ask the fare before you ride; it is set locally.",
           "Motorcycle taxi: book in Angkas, JoyRide, or Move It. Wear the helmet they give you.",
           "Taxi: make sure the meter is on when you start.",
           "Grab/TNVS: check the plate number and driver name before you get in."],
      tl: ["Tricycle: pumunta sa toda (terminal). Itanong muna ang pamasahe; lokal itong itinatakda.",
           "Motorcycle taxi: mag-book sa Angkas, JoyRide, o Move It. Isuot ang helmet na ibibigay.",
           "Taxi: siguraduhing naka-on ang metro pagsimula ng biyahe.",
           "Grab/TNVS: tingnan ang plate number at pangalan ng driver bago sumakay."] },
    tips: {
      en: ["These cost more but save time when it rains or you carry a lot.", "Share your trip from the app with someone you trust."],
      tl: ["Mas mahal pero mas mabilis kapag umuulan o marami kang dala.", "I-share ang biyahe mula sa app sa taong pinagkakatiwalaan mo."] } },

  { id: "payment", icon: "bi-cash-coin",
    title: { en: "Fares and payment", tl: "Pamasahe at pagbabayad" },
    subtitle: { en: "What to prepare before boarding", tl: "Ihanda bago sumakay" },
    steps: {
      en: ["Open the Fares tab to see published rates and discounts.",
           "Bring coins and small bills even if you use a Beep card or e-wallet.",
           "Have your ID ready if you are a student, senior citizen, or PWD (20% off on jeeps and buses).",
           "Confirm the fare with the driver or conductor if you are unsure."],
      tl: ["Buksan ang Fares tab para makita ang pamasahe at discount.",
           "Magdala ng barya at maliit na pera kahit may Beep card o e-wallet.",
           "Ihanda ang ID kung estudyante, senior citizen, o PWD (20% off sa jeep at bus).",
           "Kumpirmahin ang pamasahe sa driver o konduktor kung hindi sigurado."] },
    tips: {
      en: ["Komute fares are estimates. The fare posted inside the vehicle wins."],
      tl: ["Tantya lang ang pamasahe sa Komute. Ang nakapaskil sa loob ng sasakyan ang masusunod."] } },

  { id: "safety", icon: "bi-shield-check",
    title: { en: "Travel safety", tl: "Kaligtasan sa biyahe" },
    subtitle: { en: "Simple habits for unfamiliar trips", tl: "Simpleng gawi sa bagong biyahe" },
    steps: {
      en: ["Share your route with someone you trust.", "Wait only in loading areas that are well lit.", "Keep your phone and valuables in front of you, away from doors and windows."],
      tl: ["I-share ang ruta mo sa taong pinagkakatiwalaan mo.", "Maghintay lang sa maliwanag na sakayan.", "Itago sa harap mo ang phone at gamit, malayo sa pinto at bintana."] },
    tips: {
      en: ["If you feel lost, ask a guard, station staff, a traffic enforcer, or a store clerk."],
      tl: ["Kapag naligaw, magtanong sa guard, staff ng istasyon, traffic enforcer, o tindera/tindero."] } }
];
