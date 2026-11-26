// Default saved places (you can add your own inside the app; those are stored on the phone/browser).
// Komute covers Quezon City only, so every address must include "Quezon City".
// Popular landmarks are quick starting points. Coordinates are approximate.
window.KOMUTE_DATA = window.KOMUTE_DATA || {};
window.KOMUTE_DATA.savedPlaces = [
  { name: "Home", address: "Diliman, Quezon City", type: "HOME" },
  { name: "School", address: "Quezon City Polytechnic University, Batasan Hills, Quezon City", type: "SCHOOL" },
  { name: "Work", address: "SM North EDSA, Quezon City", type: "WORK", lat: 14.6565, lng: 121.0294 }
];

window.KOMUTE_DATA.landmarks = [
  { name: "Quezon City Hall", area: "Diliman", lat: 14.6466, lng: 121.0496, icon: "bi-bank" },
  { name: "Quezon Memorial Circle", area: "Diliman", lat: 14.6516, lng: 121.0493, icon: "bi-tree" },
  { name: "SM North EDSA", area: "North Avenue", lat: 14.6565, lng: 121.0294, icon: "bi-bag" },
  { name: "TriNoma", area: "North Avenue", lat: 14.6537, lng: 121.0335, icon: "bi-bag" },
  { name: "Araneta City (Cubao)", area: "Cubao", lat: 14.6206, lng: 121.0530, icon: "bi-building" },
  { name: "UP Diliman", area: "Diliman", lat: 14.6549, lng: 121.0647, icon: "bi-mortarboard" },
  { name: "UP Town Center", area: "Katipunan", lat: 14.6505, lng: 121.0754, icon: "bi-bag" },
  { name: "Ateneo de Manila (Katipunan)", area: "Loyola Heights", lat: 14.6397, lng: 121.0781, icon: "bi-mortarboard" },
  { name: "Eastwood City", area: "Libis", lat: 14.6090, lng: 121.0800, icon: "bi-buildings" },
  { name: "Tomas Morato / Timog", area: "South Triangle", lat: 14.6336, lng: 121.0352, icon: "bi-cup-hot" },
  { name: "St. Luke's Medical Center QC", area: "E. Rodriguez Sr. Ave.", lat: 14.6226, lng: 121.0236, icon: "bi-hospital" },
  { name: "East Avenue Medical Center", area: "Diliman", lat: 14.6435, lng: 121.0466, icon: "bi-hospital" },
  { name: "Muñoz Market", area: "Muñoz", lat: 14.6575, lng: 121.0212, icon: "bi-basket" },
  { name: "SM Fairview", area: "Fairview", lat: 14.7342, lng: 121.0573, icon: "bi-bag" },
  { name: "Batasan Pambansa", area: "Batasan Hills", lat: 14.6920, lng: 121.0920, icon: "bi-bank" },
  { name: "Robinsons Magnolia", area: "New Manila", lat: 14.6155, lng: 121.0378, icon: "bi-bag" }
];
