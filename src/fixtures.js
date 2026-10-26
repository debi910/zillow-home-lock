// Synthetic demo homes. The addresses, owners and photos are made up so the
// demo never accuses a real person; they use the same shape as live county
// records. Live lookups of real Austin addresses go to the county instead.

const DEMO_SOURCE = {
  name: "Synthetic demo record (same fields as Travis CAD parcel data)",
  url: "https://www.traviscad.org/property-search/",
};

const photos = (home, kind) => [1, 2, 3, 4].map((i) => `demo/photos/${home}-${kind}-${i}.jpg`);

export const DEMO_PARCELS = [
  {
    propId: "DEMO-1001",
    ownerName: "GARCIA ELENA M",
    address: "2104 Maple Bend Dr, Austin TX 78704",
    zip: "78704",
    ownerMailingAddress: "2104 MAPLE BEND DR",
    deedDate: Date.UTC(2025, 2, 14),
    marketValue: 684000,
    landUse: "SINGLE FAMILY RESIDENCE",
    yearBuilt: 1998,
    source: DEMO_SOURCE,
  },
  {
    propId: "DEMO-1002",
    ownerName: "NGUYEN DAVID & LINH T",
    address: "4710 Oak Shadow Ln, Austin TX 78751",
    zip: "78751",
    ownerMailingAddress: "PO BOX 4471 ROUND ROCK TX",
    deedDate: Date.UTC(2016, 7, 2),
    marketValue: 612000,
    landUse: "SINGLE FAMILY RESIDENCE",
    yearBuilt: 1962,
    source: DEMO_SOURCE,
  },
  {
    propId: "DEMO-1003",
    ownerName: "PATEL ANJALI R",
    address: "905 Cedar Ridge Cv, Austin TX 78702",
    zip: "78702",
    ownerMailingAddress: "905 CEDAR RIDGE CV",
    deedDate: Date.UTC(2024, 9, 30),
    marketValue: 739000,
    landUse: "SINGLE FAMILY RESIDENCE",
    yearBuilt: 2008,
    source: DEMO_SOURCE,
  },
];

// Zillow's own archive of earlier listing photos, keyed by address.
export const PHOTO_ARCHIVE = {
  "2104 Maple Bend Dr, Austin TX 78704": { label: "March 2025 sale listing of this home", photos: photos("maple", "original") },
  "905 Cedar Ridge Cv, Austin TX 78702": { label: "October 2024 sale listing of this home", photos: photos("cedar", "original") },
};

export const DEMO_LISTINGS = [
  {
    id: "maple",
    address: "2104 Maple Bend Dr, Austin TX 78704",
    zip: "78704",
    beds: 3,
    baths: 2,
    sqft: 1640,
    rent: 1200,
    listerName: "Michael Brown",
    postedDaysAgo: 1,
    photos: photos("maple", "copied"),
    description:
      "Beautiful 3 bed home, newly painted, pets ok. I'm currently out of the country on a missionary assignment so I can't show the home, but you can drive by anytime. Many people are interested, so send the deposit to hold the house and the keys will be mailed to you.",
    messages: ["Please text me on WhatsApp at (512) 555-0147. Deposit is $1,200 via Zelle."],
  },
  {
    id: "oak",
    address: "4710 Oak Shadow Ln, Austin TX 78751",
    zip: "78751",
    beds: 3,
    baths: 2,
    sqft: 1520,
    rent: 2450,
    listerName: "David Nguyen",
    postedDaysAgo: 3,
    photos: photos("oak", "original"),
    description:
      "Updated 1960s ranch near Hyde Park. Fenced yard, washer/dryer, 12-month lease. Open house Saturday 10am to noon, or request a tour through this page. Apply online here; no payment until you've seen the home and signed the lease.",
    messages: [],
  },
  {
    id: "cedar",
    address: "905 Cedar Ridge Cv, Austin TX 78702",
    zip: "78702",
    beds: 3,
    baths: 2.5,
    sqft: 1880,
    rent: 1650,
    listerName: "Property Rentals Group",
    postedDaysAgo: 0,
    photos: photos("cedar", "copied"),
    description:
      "Modern East Austin home, quiet cove, available now. Contact me directly at rentals.austin.homes@gmail.com to apply. Application fee and deposit required before showing.",
    messages: [],
  },
];
