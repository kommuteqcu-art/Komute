// Schools with checked locations (shown first when you type). Each campus is a separate entry.
// Sources: Quezon City government QCU page, Wikipedia coordinates. "lookup" = find the exact spot by search when picked.
window.KOMUTE_DATA = window.KOMUTE_DATA || {};
window.KOMUTE_DATA.schools = [
  { name: "Quezon City University – San Bartolome (Main) Campus", aliases: ["qcu", "qcpu", "quezon city university", "quezon city polytechnic university", "qc poly", "qcu main", "san bartolome"],
    address: "673 Quirino Highway, San Bartolome, Novaliches, Quezon City", lat: 14.7000917, lng: 121.0343250 },
  { name: "Quezon City University – Batasan Campus", aliases: ["qcu", "qcpu", "quezon city university", "quezon city polytechnic university", "qc poly", "qcu batasan", "batasan"],
    address: "IBP Road (Batasan Road), beside Batasan Hills National High School, Batasan Hills, Quezon City", lat: 14.6893, lng: 121.0950, approx: true },
  { name: "Quezon City University – San Francisco Campus", aliases: ["qcu", "qcpu", "quezon city university", "quezon city polytechnic university", "qc poly", "qcu san francisco", "qcu sf", "bago bantay"],
    address: "Inside San Francisco High School, Sto. Cristo, Bago Bantay, Quezon City (near SM North EDSA)", lookup: "San Francisco High School, Bago Bantay, Quezon City", lat: 14.6600, lng: 121.0270, approx: true },
  { name: "Quezon City Science High School", aliases: ["qcshs", "quesci", "kisay", "qc science"],
    address: "Golden Acres Road cor. Misamis Street, Bago Bantay, Quezon City", lat: 14.6584528, lng: 121.0304694 },
  { name: "Philippine Science High School – Main Campus", aliases: ["pshs", "pisay", "philippine science"],
    address: "Agham Road, Diliman, Quezon City", lat: 14.6503806, lng: 121.0409611 },
  { name: "Batasan Hills National High School", aliases: ["bhnhs", "batasan hills national"],
    address: "IBP Road, Batasan Hills, Quezon City", lat: 14.6891722, lng: 121.0952722 }
];
