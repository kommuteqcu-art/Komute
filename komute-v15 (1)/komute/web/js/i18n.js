// English and Tagalog (Filipino) text for the whole app.
// HTML uses data-i18n="key" (text), data-i18n-ph="key" (placeholder), data-i18n-aria="key" (aria-label and title).
// In code: K.t("key", { name: value }) replaces {name}. K.L({en, tl}) picks the right language from data files.
(function (K) {
  const en = {
    "a11y.skip": "Skip to content", "common.close": "Close", "lang.label": "Language",
    "nav.plan": "Plan", "nav.saved": "Saved", "nav.fares": "Fares", "nav.guide": "Guide",
    "err.backend": "Could not reach the Komute server. Make sure it is running (npm start in the backend folder).",

    "home.tagline": "Quezon City commute helper", "home.title": "Know how to get there before you go",
    "welcome.title": "New here? It takes 3 steps.", "welcome.hide": "Hide this tip",
    "welcome.s1": "Say where you are starting.", "welcome.s2": "Say where you are going.", "welcome.s3": "Press “Get my commute guide”.",
    "welcome.more": "Read the full guide",
    "home.from": "Where are you starting?", "home.fromPh": "Type a barangay, street, or place",
    "home.to": "Where are you going?", "home.toPh": "Example: Maginhawa St., or SM North",
    "home.clear": "Clear", "home.myLoc": "My location", "home.search": "Search", "home.pin": "Pin on map", "home.choose": "Saved & landmarks",
    "home.swap": "Swap start and destination", "home.recent": "Recent trips", "home.clearRecent": "Clear",
    "home.style": "Choose your style", "home.newMode": "New commuter mode",
    "home.newModeSub": "Adds simple tips: how to spot the right jeepney, where to ask for help, and what to double-check.",
    "home.find": "Get my commute guide",
    "home.hintNeedStart": "Fill in step 1 (starting point) first.", "home.hintNeedDest": "Fill in step 2 to turn this button on.",
    "home.hintReady": "Ready! Press the button when you are set.",
    "home.typeStart": "Type a starting point first, then press Search.", "home.typeDest": "Type a destination first, then press Search.",
    "home.searching": "Searching Quezon City…", "home.noMatch": "No Quezon City match. Try a fuller name, a landmark, or Pin on map.",
    "home.selectOne": "Tap the right place in the list.", "home.startSet": "Starting point set.", "home.destSet": "Destination set.",
    "home.startSetTo": "Starting point set to {n}.", "home.destSetTo": "Destination set to {n}.",
    "home.noGeo": "This browser cannot get your location. Type a place instead.", "home.locating": "Getting your location…",
    "home.youOutside": "You seem to be outside Quezon City. Type a starting point inside Quezon City.",
    "home.startIsYou": "Starting point set to where you are now.",
    "home.geoDenied": "Location is off or not allowed. Allow location for this site, or type a place.",
    "place.myLocation": "My location", "place.pinned": "Pinned spot",
    "save.this": "Save this place", "save.title": "Save this place", "save.name": "Name", "save.type": "Type", "save.ok": "Save",
    "save.nothing": "Choose a place first, then tap the star to save it.", "save.done": "Saved “{n}”. Find it under Saved.",
    "type.HOME": "Home", "type.SCHOOL": "School", "type.WORK": "Work", "type.OTHER": "Other",

    "ta.district": "Barangay · District {d}, Quezon City", "ta.approx": "House number kept; pin is on the street. Drag it to the exact house.",
    "ta.loading": "Finding streets and places…", "ta.notFound": "Not in the list? Tap the map or use Pin on map.",
    "ta.dragHint": "Drag the pin on the map to the exact house.", "ta.noSpot": "Couldn't find the exact spot. Tap the map to place it.",
    "pop.start": "Start here", "pop.go": "Go here", "map.expand": "Full-screen map", "map.shrink": "Exit full-screen map",
    "map.qc": "Map of Quezon City", "map.trip": "Trip map", "map.compass": "Compass: tap to face north",
    "map.hint": "Tap anywhere on the map to set Start or Destination. Drag the A or B pin to fine-tune the exact spot.",
    "map.unsupported": "The map needs a newer browser (WebGL). You can still plan your trip.",
    "map.pinA": "Starting point (A)", "map.pinB": "Destination (B)",
    "map.style.streets": "Map style: Streets (tap to change)", "map.style.light": "Map style: Light (tap to change)", "map.style.satellite": "Map style: Satellite (tap to change)",

    "pin.titleStart": "Move the map to put the blue pin on your starting point", "pin.titleDest": "Move the map to put the red pin on your destination",
    "pin.drag": "Drag the map. You can also tap a spot.", "pin.finding": "Finding the address…",
    "pin.outside": "That spot is outside Quezon City. Komute covers Quezon City only.",
    "pin.use": "Use this spot", "pin.cancel": "Cancel", "pin.startSet": "Starting pin set.", "pin.destSet": "Destination pin set.",

    "pick.titleStart": "Choose your starting point", "pick.titleDest": "Choose your destination",
    "pick.myLocation": "Use my location", "pick.myLocationSub": "Uses your phone's GPS",
    "pick.pin": "Pin on the map", "pick.pinSub": "Move the map to the exact spot",
    "pick.saved": "Saved places", "pick.noSaved": "No saved places yet. Tap ☆ next to a box to save one.",
    "pick.recent": "Recent", "pick.landmarks": "Popular landmarks in Quezon City",

    "fare.estimating": "Estimating your fare…", "fare.needPoints": "Pick a suggested place or drop a pin to see a fare estimate.",
    "fare.estTitle": "Fare estimate · about {km} km", "fare.byRoad": "Based on the road distance of your trip.",
    "fare.byStraight": "Rough guess from the distance. It gets better after the route loads.",
    "fare.group.free": "Free", "fare.group.puv": "Public transport (one ride)", "fare.group.door": "Door to door",
    "fare.free": "FREE", "fare.qcbusIf": "If a Q City Bus route passes your trip",
    "fare.m.jeep": "Jeepney", "fare.m.mjeep": "Modern jeepney", "fare.m.bus": "City bus (ordinary)", "fare.m.abus": "City bus (aircon)",
    "fare.m.mc": "Motorcycle taxi", "fare.m.taxi": "Taxi", "fare.m.tnvs": "Grab / TNVS (sedan)",
    "fare.discShort": "{p} with discount", "fare.regularWas": "50% off (regular {p})", "fare.from": "from {p}",
    "fare.lrt2Poster": "50% off; exact fare on the station poster", "fare.beepSjt": "Beep {b} · single ticket {s}",
    "fare.provisional": "Provisional rate", "fare.appPrice": "The app shows the exact price", "fare.traffic": "More in heavy traffic", "fare.surge": "Plus pick-up fare; surge can apply",
    "fare.disclaimer": "Estimates only. The fare posted in the vehicle wins. Discount = students, seniors, PWD with ID.", "fare.seeAll": "See all fares",

    "tab.commute": "Commute", "tab.walk": "Walk", "tab.drive": "Drive", "tab.bike": "Bike",
    "res.back": "Back to planner", "res.myLoc": "Show my location", "res.sheet": "Show more map",
    "res.loading": "Building your commute guide…", "res.loadingSub": "This can take up to a minute.",
    "res.retry": "Try again", "res.errorHelp": "If this keeps happening, open /api/ai-status on your server to see what is wrong.",
    "res.grounded": "Made with Google Maps place data.", "res.notGrounded": "AI-made from your two places. Routes were not checked live.",
    "res.otherLang": "This plan is in the other language.", "res.makeAgain": "Make it again",
    "res.share": "Share this plan", "res.again": "Make another plan", "res.transitGoogle": "Transit in Google Maps",
    "res.sources": "Google Maps sources", "res.aiWarn": "This guide is AI-made. Routes, fares, and schedules may have changed. Always verify locally.",
    "ride.title": "Before you ride", "ride.c1": "Check the vehicle’s route sign matches your plan.", "ride.c2": "Ask the driver or conductor for the current fare.",
    "ride.c3": "Carry small bills or coins.", "ride.c4": "Tell someone your route if the trip is new to you.",

    "plan.why": "Why this option", "plan.check": "Check before you go", "plan.tips": "Tips for first-timers", "plan.checks": "Important checks",
    "tag.cheapest": "Cheapest", "tag.fastest": "Fastest", "tag.easiest": "Easiest", "tag.fewest": "Fewest transfers",
    "step.start": "Start", "step.walk": "Walk", "step.ride": "Ride", "step.transfer": "Transfer", "step.getoff": "Get off", "step.arrive": "Arrive",
    "step.rideHere": "Ride here:", "step.where": "Where:", "step.lookSign": "Look for this sign", "step.getOffAt": "Get off at:",
    "mode.walk": "Walk", "mode.jeepney": "Jeepney", "mode.modern_jeepney": "Modern jeep", "mode.bus": "Bus", "mode.carousel": "EDSA Carousel",
    "mode.qcity_bus": "Q City Bus (free)", "mode.uv_express": "UV Express", "mode.tricycle": "Tricycle", "mode.mrt3": "MRT-3", "mode.lrt1": "LRT-1",
    "mode.lrt2": "LRT-2", "mode.taxi": "Taxi", "mode.tnvs": "Grab", "mode.mc_taxi": "Motorcycle taxi",

    "route.failed": "The road path could not load. You can still open Google Maps.", "route.needPoints": "Pick places from the list (or pins) to see road paths.",
    "route.openGoogle": "Open in Google Maps", "route.googleMaps": "Google Maps", "route.share": "Share", "route.copied": "Link copied",
    "route.arriveAt": "Arrive about {t}", "route.fastest": "Fastest road path", "route.alt": "Alternative path",
    "route.noTraffic": "Traffic is not included.", "route.tapAlt": "Tap a light-blue path on the map to switch.", "route.steps": "Turn-by-turn directions",

    "turn.depart": "Start", "turn.departOn": "Start on {n}", "turn.arrive": "You have arrived",
    "turn.roundabout": "Enter the roundabout", "turn.roundaboutOnto": "Enter the roundabout to {n}",
    "turn.left": "Turn left", "turn.right": "Turn right", "turn.slightLeft": "Bear left", "turn.slightRight": "Bear right",
    "turn.sharpLeft": "Turn sharp left", "turn.sharpRight": "Turn sharp right", "turn.straight": "Go straight", "turn.uturn": "Make a U-turn", "turn.continue": "Continue",
    "turn.leftOnto": "Turn left onto {n}", "turn.rightOnto": "Turn right onto {n}", "turn.slightLeftOnto": "Bear left onto {n}", "turn.slightRightOnto": "Bear right onto {n}",
    "turn.sharpLeftOnto": "Turn sharp left onto {n}", "turn.sharpRightOnto": "Turn sharp right onto {n}", "turn.straightOnto": "Go straight on {n}",
    "turn.uturnOnto": "Make a U-turn on {n}", "turn.continueOnto": "Continue on {n}",

    "nav.start": "Start navigation", "nav.exit": "Exit", "nav.recenter": "Re-center", "nav.voice": "Voice directions", "nav.voiceOn": "Voice directions on.",
    "nav.reroute": "Off route. Finding a new way…", "nav.findingYou": "Finding your location…", "nav.noGps": "Turn on location (GPS) to navigate.",
    "nav.arrived": "You have arrived", "nav.arrivedShort": "Arrived", "nav.then": "Then: {x}", "nav.eta": "Arrive {t}", "nav.inDist": "In {d},",
    "nav.compassBtn": "Turn on compass", "nav.compassOff": "Tap to use the compass", "nav.followArrow": "Walk where the arrow points",
    "nav.compassDenied": "Compass not available on this phone",

    "dir.title": "Which way do I go?", "dir.toDest": "Destination", "dir.toStation": "Nearest train station",
    "dir.tapStart": "Tap the button. The arrow points where you need to go, like a compass.",
    "dir.start": "Show direction", "dir.on": "Compass on", "dir.noCompass": "GPS only (no compass)",
    "dir.noGps": "Turn on location (GPS) to see the direction.", "dir.noDest": "Pick the destination from the list or a pin first.",
    "dir.line": "{d} to the {c} · {n}.", "dir.northUp": "(Hold the phone with the top facing north.)",
    "card.N": "north", "card.NE": "northeast", "card.E": "east", "card.SE": "southeast", "card.S": "south", "card.SW": "southwest", "card.W": "west", "card.NW": "northwest",

    "saved.title": "Saved places", "saved.sub": "Choose Start or Destination to use a place. To add a place, tap the ☆ star next to a box on the Plan screen.",
    "saved.start": "Start", "saved.dest": "Destination", "saved.remove": "Remove", "saved.empty": "No saved places. Tap the ☆ star on the Plan screen to add one.",
    "guide.title": "Commuter guide", "guide.sub": "Tap a topic to open it. Start with “How to use Komute”.", "guide.good": "Good to know",

    "fares.title": "Fares", "fares.sub": "Published rates for jeepneys, buses, trains, and other rides. Use them as a guide, then confirm before you ride.",
    "fares.road": "Jeepney, bus, and other road rides", "fares.qcbus": "Q City Bus: free routes", "fares.qcbusLink": "Official routes and schedule",
    "fares.mrt3": "MRT-3 (stations in and near Quezon City)", "fares.mrt3Sub": "Big number = what you pay now (50% off). Crossed out = regular fare.",
    "fares.lrt1": "LRT-1 (Quezon City stations)", "fares.lrt2": "LRT-2 (Gilmore, Betty Go-Belmonte, Cubao, Anonas, Katipunan, and the rest)",
    "fares.trip": "Trip", "fares.sjt": "Single ticket", "fares.now50": "Now, with 50% off:", "fares.regular": "Regular:", "fares.discounts": "Discounts",
    "fares.warn": "Published rates as last checked on {d}. Fares change, and your actual fare can differ. Confirm with the posted fare matrix or the conductor before you ride."
  };

  const tl = {
    "a11y.skip": "Pumunta sa nilalaman", "common.close": "Isara", "lang.label": "Wika",
    "nav.plan": "Plano", "nav.saved": "Naka-save", "nav.fares": "Pamasahe", "nav.guide": "Gabay",
    "err.backend": "Hindi maabot ang Komute server. Siguraduhing tumatakbo ito (npm start sa backend folder).",

    "home.tagline": "Katuwang sa biyahe sa Quezon City", "home.title": "Alamin ang daan bago umalis",
    "welcome.title": "Bago ka rito? 3 hakbang lang.", "welcome.hide": "Itago ang tip na ito",
    "welcome.s1": "Sabihin kung saan ka manggagaling.", "welcome.s2": "Sabihin kung saan ka pupunta.", "welcome.s3": "Pindutin ang “Kunin ang gabay sa biyahe”.",
    "welcome.more": "Basahin ang buong gabay",
    "home.from": "Saan ka manggagaling?", "home.fromPh": "Mag-type ng barangay, kalye, o lugar",
    "home.to": "Saan ka pupunta?", "home.toPh": "Halimbawa: Maginhawa St., o SM North",
    "home.clear": "Burahin", "home.myLoc": "Lokasyon ko", "home.search": "Hanapin", "home.pin": "I-pin sa mapa", "home.choose": "Saved at landmark",
    "home.swap": "Pagpalitin ang simula at pupuntahan", "home.recent": "Mga huling biyahe", "home.clearRecent": "Burahin",
    "home.style": "Piliin ang istilo mo", "home.newMode": "New commuter mode",
    "home.newModeSub": "May dagdag na simpleng tip: paano makita ang tamang jeep, saan magtatanong, at ano ang dapat siguraduhin.",
    "home.find": "Kunin ang gabay sa biyahe",
    "home.hintNeedStart": "Punan muna ang hakbang 1 (simula).", "home.hintNeedDest": "Punan ang hakbang 2 para gumana ang button.",
    "home.hintReady": "Handa na! Pindutin ang button kapag okay ka na.",
    "home.typeStart": "Mag-type muna ng simula, tapos pindutin ang Hanapin.", "home.typeDest": "Mag-type muna ng pupuntahan, tapos pindutin ang Hanapin.",
    "home.searching": "Naghahanap sa Quezon City…", "home.noMatch": "Walang tugma sa Quezon City. Subukan ang buong pangalan, landmark, o I-pin sa mapa.",
    "home.selectOne": "I-tap ang tamang lugar sa listahan.", "home.startSet": "Naitakda na ang simula.", "home.destSet": "Naitakda na ang pupuntahan.",
    "home.startSetTo": "Simula: {n}.", "home.destSetTo": "Pupuntahan: {n}.",
    "home.noGeo": "Hindi makuha ng browser na ito ang lokasyon mo. Mag-type na lang ng lugar.", "home.locating": "Kinukuha ang lokasyon mo…",
    "home.youOutside": "Mukhang nasa labas ka ng Quezon City. Mag-type ng simula sa loob ng Quezon City.",
    "home.startIsYou": "Ang simula ay kung nasaan ka ngayon.",
    "home.geoDenied": "Naka-off o hindi pinayagan ang location. Payagan ang location para sa site na ito, o mag-type ng lugar.",
    "place.myLocation": "Lokasyon ko", "place.pinned": "Naka-pin na lugar",
    "save.this": "I-save ang lugar na ito", "save.title": "I-save ang lugar", "save.name": "Pangalan", "save.type": "Uri", "save.ok": "I-save",
    "save.nothing": "Pumili muna ng lugar, tapos i-tap ang star para i-save.", "save.done": "Na-save ang “{n}”. Makikita sa Naka-save.",
    "type.HOME": "Bahay", "type.SCHOOL": "Paaralan", "type.WORK": "Trabaho", "type.OTHER": "Iba pa",

    "ta.district": "Barangay · Distrito {d}, Quezon City", "ta.approx": "Naitala ang numero ng bahay; nasa kalye ang pin. I-drag ito sa eksaktong bahay.",
    "ta.loading": "Hinahanap ang mga kalye at lugar…", "ta.notFound": "Wala sa listahan? I-tap ang mapa o gamitin ang I-pin sa mapa.",
    "ta.dragHint": "I-drag ang pin sa mapa papunta sa eksaktong bahay.", "ta.noSpot": "Hindi makita ang eksaktong lugar. I-tap ang mapa para ilagay.",
    "pop.start": "Simula dito", "pop.go": "Pumunta dito", "map.expand": "Buong-screen na mapa", "map.shrink": "Isara ang buong-screen na mapa",
    "map.qc": "Mapa ng Quezon City", "map.trip": "Mapa ng biyahe", "map.compass": "Compass: i-tap para humarap sa north",
    "map.hint": "I-tap kahit saan sa mapa para itakda ang Simula o Pupuntahan. I-drag ang A o B na pin para sa eksaktong lugar.",
    "map.unsupported": "Kailangan ng mas bagong browser (WebGL) para sa mapa. Puwede ka pa ring magplano.",
    "map.pinA": "Simula (A)", "map.pinB": "Pupuntahan (B)",
    "map.style.streets": "Istilo ng mapa: Kalsada (i-tap para palitan)", "map.style.light": "Istilo ng mapa: Light (i-tap para palitan)", "map.style.satellite": "Istilo ng mapa: Satellite (i-tap para palitan)",

    "pin.titleStart": "Igalaw ang mapa para mailagay ang asul na pin sa simula mo", "pin.titleDest": "Igalaw ang mapa para mailagay ang pulang pin sa pupuntahan mo",
    "pin.drag": "I-drag ang mapa. Puwede ring mag-tap sa lugar.", "pin.finding": "Hinahanap ang address…",
    "pin.outside": "Nasa labas ng Quezon City ang lugar na iyan. Quezon City lang ang sakop ng Komute.",
    "pin.use": "Gamitin ang lugar na ito", "pin.cancel": "Kanselahin", "pin.startSet": "Naitakda ang pin ng simula.", "pin.destSet": "Naitakda ang pin ng pupuntahan.",

    "pick.titleStart": "Piliin ang simula mo", "pick.titleDest": "Piliin ang pupuntahan mo",
    "pick.myLocation": "Gamitin ang lokasyon ko", "pick.myLocationSub": "Gamit ang GPS ng phone mo",
    "pick.pin": "I-pin sa mapa", "pick.pinSub": "Igalaw ang mapa sa eksaktong lugar",
    "pick.saved": "Mga naka-save na lugar", "pick.noSaved": "Wala pang naka-save. I-tap ang ☆ sa tabi ng kahon para mag-save.",
    "pick.recent": "Kamakailan", "pick.landmarks": "Mga kilalang landmark sa Quezon City",

    "fare.estimating": "Tinatantya ang pamasahe…", "fare.needPoints": "Pumili ng lugar sa listahan o mag-pin para makita ang tantyang pamasahe.",
    "fare.estTitle": "Tantyang pamasahe · mga {km} km", "fare.byRoad": "Batay sa layo ng kalsada ng biyahe mo.",
    "fare.byStraight": "Magaspang na tantya mula sa layo. Mas tumpak kapag na-load na ang ruta.",
    "fare.group.free": "Libre", "fare.group.puv": "Pampublikong sasakyan (isang sakay)", "fare.group.door": "Door to door",
    "fare.free": "LIBRE", "fare.qcbusIf": "Kung may ruta ng Q City Bus na dadaan sa biyahe mo",
    "fare.m.jeep": "Jeep", "fare.m.mjeep": "Modern jeep", "fare.m.bus": "City bus (ordinary)", "fare.m.abus": "City bus (aircon)",
    "fare.m.mc": "Motorcycle taxi", "fare.m.taxi": "Taxi", "fare.m.tnvs": "Grab / TNVS (sedan)",
    "fare.discShort": "{p} may discount", "fare.regularWas": "50% off (regular {p})", "fare.from": "mula {p}",
    "fare.lrt2Poster": "50% off; eksaktong pamasahe nasa poster ng istasyon", "fare.beepSjt": "Beep {b} · single ticket {s}",
    "fare.provisional": "Pansamantalang rate", "fare.appPrice": "Makikita sa app ang eksaktong presyo", "fare.traffic": "Mas mahal kapag traffic", "fare.surge": "May pick-up fare; puwedeng may surge",
    "fare.disclaimer": "Tantya lang. Ang nakapaskil sa sasakyan ang masusunod. Discount = estudyante, senior, PWD na may ID.", "fare.seeAll": "Tingnan lahat ng pamasahe",

    "tab.commute": "Commute", "tab.walk": "Lakad", "tab.drive": "Kotse", "tab.bike": "Bisikleta",
    "res.back": "Bumalik sa planner", "res.myLoc": "Ipakita ang lokasyon ko", "res.sheet": "Ipakita pa ang mapa",
    "res.loading": "Ginagawa ang gabay sa biyahe mo…", "res.loadingSub": "Puwedeng umabot ng isang minuto.",
    "res.retry": "Subukan ulit", "res.errorHelp": "Kung paulit-ulit ito, buksan ang /api/ai-status sa server mo para makita ang problema.",
    "res.grounded": "Ginawa gamit ang place data ng Google Maps.", "res.notGrounded": "Gawa ng AI mula sa dalawang lugar mo. Hindi na-check nang live ang ruta.",
    "res.otherLang": "Nasa ibang wika ang planong ito.", "res.makeAgain": "Gawin ulit",
    "res.share": "I-share ang plano", "res.again": "Gumawa ng ibang plano", "res.transitGoogle": "Transit sa Google Maps",
    "res.sources": "Mga source mula sa Google Maps", "res.aiWarn": "Gawa ng AI ang gabay na ito. Puwedeng nagbago na ang ruta, pamasahe, at oras. Laging siguraduhin sa lugar.",
    "ride.title": "Bago sumakay", "ride.c1": "Tingnan kung tugma ang karatula ng sasakyan sa plano mo.", "ride.c2": "Itanong sa driver o konduktor ang kasalukuyang pamasahe.",
    "ride.c3": "Magdala ng barya o maliit na pera.", "ride.c4": "Sabihan ang isang tao ng ruta mo kung bago sa iyo ang biyahe.",

    "plan.why": "Bakit ito", "plan.check": "Siguraduhin bago umalis", "plan.tips": "Tips para sa first-timer", "plan.checks": "Mahahalagang dapat i-check",
    "tag.cheapest": "Pinakamura", "tag.fastest": "Pinakamabilis", "tag.easiest": "Pinakamadali", "tag.fewest": "Kaunting lipat",
    "step.start": "Simula", "step.walk": "Lakad", "step.ride": "Sakay", "step.transfer": "Lipat", "step.getoff": "Baba", "step.arrive": "Dating",
    "step.rideHere": "Sumakay dito:", "step.where": "Saan:", "step.lookSign": "Hanapin ang karatulang ito", "step.getOffAt": "Bumaba sa:",
    "mode.walk": "Lakad", "mode.jeepney": "Jeep", "mode.modern_jeepney": "Modern jeep", "mode.bus": "Bus", "mode.carousel": "EDSA Carousel",
    "mode.qcity_bus": "Q City Bus (libre)", "mode.uv_express": "UV Express", "mode.tricycle": "Tricycle", "mode.mrt3": "MRT-3", "mode.lrt1": "LRT-1",
    "mode.lrt2": "LRT-2", "mode.taxi": "Taxi", "mode.tnvs": "Grab", "mode.mc_taxi": "Motorcycle taxi",

    "route.failed": "Hindi ma-load ang daan. Puwede pa ring buksan ang Google Maps.", "route.needPoints": "Pumili ng lugar sa listahan (o pin) para makita ang daan.",
    "route.openGoogle": "Buksan sa Google Maps", "route.googleMaps": "Google Maps", "route.share": "I-share", "route.copied": "Nakopya ang link",
    "route.arriveAt": "Darating mga {t}", "route.fastest": "Pinakamabilis na daan", "route.alt": "Ibang daan",
    "route.noTraffic": "Hindi kasama ang traffic.", "route.tapAlt": "I-tap ang light-blue na daan sa mapa para lumipat.", "route.steps": "Direksyon bawat liko",

    "turn.depart": "Magsimula", "turn.departOn": "Magsimula sa {n}", "turn.arrive": "Nakarating ka na",
    "turn.roundabout": "Pumasok sa rotonda", "turn.roundaboutOnto": "Pumasok sa rotonda papunta sa {n}",
    "turn.left": "Kumaliwa", "turn.right": "Kumanan", "turn.slightLeft": "Bahagyang kumaliwa", "turn.slightRight": "Bahagyang kumanan",
    "turn.sharpLeft": "Kumaliwa nang matalas", "turn.sharpRight": "Kumanan nang matalas", "turn.straight": "Dumiretso", "turn.uturn": "Mag-U-turn", "turn.continue": "Magpatuloy",
    "turn.leftOnto": "Kumaliwa sa {n}", "turn.rightOnto": "Kumanan sa {n}", "turn.slightLeftOnto": "Bahagyang kumaliwa sa {n}", "turn.slightRightOnto": "Bahagyang kumanan sa {n}",
    "turn.sharpLeftOnto": "Kumaliwa nang matalas sa {n}", "turn.sharpRightOnto": "Kumanan nang matalas sa {n}", "turn.straightOnto": "Dumiretso sa {n}",
    "turn.uturnOnto": "Mag-U-turn sa {n}", "turn.continueOnto": "Magpatuloy sa {n}",

    "nav.start": "Simulan ang nabigasyon", "nav.exit": "Tapusin", "nav.recenter": "Ibalik sa akin", "nav.voice": "Boses na direksyon", "nav.voiceOn": "Naka-on ang boses na direksyon.",
    "nav.reroute": "Lumihis ka. Naghahanap ng bagong daan…", "nav.findingYou": "Hinahanap ang lokasyon mo…", "nav.noGps": "I-on ang location (GPS) para sa nabigasyon.",
    "nav.arrived": "Nakarating ka na", "nav.arrivedShort": "Nakarating", "nav.then": "Tapos: {x}", "nav.eta": "Darating {t}", "nav.inDist": "Pagkalipas ng {d},",
    "nav.compassBtn": "I-on ang compass", "nav.compassOff": "I-tap para gamitin ang compass", "nav.followArrow": "Lumakad kung saan nakaturo ang arrow",
    "nav.compassDenied": "Walang compass sa phone na ito",

    "dir.title": "Saan ako pupunta?", "dir.toDest": "Pupuntahan", "dir.toStation": "Pinakamalapit na istasyon",
    "dir.tapStart": "Pindutin ang button. Ituturo ng arrow kung saan ka dapat pumunta, parang compass.",
    "dir.start": "Ipakita ang direksyon", "dir.on": "Naka-on ang compass", "dir.noCompass": "GPS lang (walang compass)",
    "dir.noGps": "I-on ang location (GPS) para makita ang direksyon.", "dir.noDest": "Pumili muna ng pupuntahan mula sa listahan o pin.",
    "dir.line": "{d} pa-{c} · {n}.", "dir.northUp": "(Hawakan ang phone na nakaharap sa north ang itaas.)",
    "card.N": "hilaga", "card.NE": "hilagang-silangan", "card.E": "silangan", "card.SE": "timog-silangan", "card.S": "timog", "card.SW": "timog-kanluran", "card.W": "kanluran", "card.NW": "hilagang-kanluran",

    "saved.title": "Mga naka-save na lugar", "saved.sub": "Piliin ang Simula o Pupuntahan para gamitin ang lugar. Para magdagdag, i-tap ang ☆ sa tabi ng kahon sa Plano.",
    "saved.start": "Simula", "saved.dest": "Pupuntahan", "saved.remove": "Alisin", "saved.empty": "Walang naka-save. I-tap ang ☆ sa Plano para magdagdag.",
    "guide.title": "Gabay sa pag-commute", "guide.sub": "I-tap ang paksa para buksan. Simulan sa “Paano gamitin ang Komute”.", "guide.good": "Dapat malaman",

    "fares.title": "Pamasahe", "fares.sub": "Opisyal na pamasahe sa jeep, bus, tren, at iba pang sasakyan. Gamitin bilang gabay, tapos siguraduhin bago sumakay.",
    "fares.road": "Jeep, bus, at iba pang sasakyan sa kalsada", "fares.qcbus": "Q City Bus: mga libreng ruta", "fares.qcbusLink": "Opisyal na ruta at schedule",
    "fares.mrt3": "MRT-3 (mga istasyon sa at malapit sa Quezon City)", "fares.mrt3Sub": "Malaking numero = babayaran mo ngayon (50% off). May guhit = regular na pamasahe.",
    "fares.lrt1": "LRT-1 (mga istasyon sa Quezon City)", "fares.lrt2": "LRT-2 (Gilmore, Betty Go-Belmonte, Cubao, Anonas, Katipunan, at iba pa)",
    "fares.trip": "Biyahe", "fares.sjt": "Single ticket", "fares.now50": "Ngayon, may 50% off:", "fares.regular": "Regular:", "fares.discounts": "Mga discount",
    "fares.warn": "Opisyal na pamasahe na huling na-check noong {d}. Nagbabago ang pamasahe at puwedeng iba ang aktwal. Siguraduhin sa nakapaskil na fare matrix o sa konduktor bago sumakay."
  };

  K.STR = { en, tl };
  const saved = K.store.get("lang", null);
  const browser = (navigator.language || "").toLowerCase();
  K.lang = saved === "tl" || saved === "en" ? saved : (/^(fil|tl)/.test(browser) ? "tl" : "en");

  K.t = (key, vars) => {
    let s = K.STR[K.lang][key] ?? K.STR.en[key] ?? key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
    return s;
  };
  K.L = (o) => (o && typeof o === "object" && !Array.isArray(o) ? (o[K.lang] ?? o.en) : o);

  K.applyI18n = (root = document) => {
    document.documentElement.lang = K.lang === "tl" ? "fil" : "en";
    root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = K.t(el.dataset.i18n); });
    root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = K.t(el.dataset.i18nPh); });
    root.querySelectorAll("[data-i18n-aria]").forEach((el) => { const v = K.t(el.dataset.i18nAria); el.setAttribute("aria-label", v); el.title = v; });
  };
  K.setLang = (lang) => {
    K.lang = lang === "tl" ? "tl" : "en";
    K.store.set("lang", K.lang);
    K.applyI18n();
  };
})(window.Komute);
