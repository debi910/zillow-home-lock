// Synthetic demo homes. The addresses, owners and photos are made up so the
// demo never accuses a real person; they use the same shape as live county
// records. Live lookups of real Austin addresses go to the county instead.

const DEMO_SOURCE = {
  name: "Synthetic demo record (same fields as Travis CAD parcel data)",
  url: "https://www.traviscad.org/property-search/",
};

const photos = (home, kind) => [1, 2, 3, 4].map((i) => `demo/photos/${home}-${kind}-${i}.jpg`);

const parcel = (p) => ({ landUse: "SINGLE FAMILY RESIDENCE", source: DEMO_SOURCE, ...p });

export const DEMO_PARCELS = [
  parcel({ propId: "DEMO-1001", ownerName: "GARCIA ELENA M", address: "2104 Maple Bend Dr, Austin TX 78704", zip: "78704",
    ownerMailingAddress: "2104 MAPLE BEND DR", deedDate: Date.UTC(2025, 2, 14), marketValue: 684000, yearBuilt: 1998 }),
  parcel({ propId: "DEMO-1002", ownerName: "NGUYEN DAVID & LINH T", address: "4710 Oak Shadow Ln, Austin TX 78751", zip: "78751",
    ownerMailingAddress: "PO BOX 4471 ROUND ROCK TX", deedDate: Date.UTC(2016, 7, 2), marketValue: 612000, yearBuilt: 1962 }),
  parcel({ propId: "DEMO-1003", ownerName: "PATEL ANJALI R", address: "905 Cedar Ridge Cv, Austin TX 78702", zip: "78702",
    ownerMailingAddress: "905 CEDAR RIDGE CV", deedDate: Date.UTC(2024, 9, 30), marketValue: 739000, yearBuilt: 2008 }),
  parcel({ propId: "DEMO-1004", ownerName: "WEST CAMPUS HOMES LLC", address: "2310 Elm Terrace St, Austin TX 78705", zip: "78705",
    ownerMailingAddress: "600 CONGRESS AVE STE 1400", deedDate: Date.UTC(2019, 4, 21), marketValue: 828000, yearBuilt: 1984 }),
  parcel({ propId: "DEMO-1005", ownerName: "OKAFOR CHIDI A", address: "1207 Pecan Grove Rd, Austin TX 78703", zip: "78703",
    ownerMailingAddress: "88 LAKE SHORE DR CHICAGO IL", deedDate: Date.UTC(2014, 1, 7), marketValue: 1240000, yearBuilt: 1948 }),
  parcel({ propId: "DEMO-1006", ownerName: "MILLER RYAN J & SARAH K", address: "8816 Willow Creek Dr, Austin TX 78749", zip: "78749",
    ownerMailingAddress: "3301 BEE CAVES RD", deedDate: Date.UTC(2012, 10, 19), marketValue: 571000, yearBuilt: 1996 }),
];

// Zillow's own archive of earlier listing photos, keyed by address.
export const PHOTO_ARCHIVE = {
  "2104 Maple Bend Dr, Austin TX 78704": { label: "March 2025 sale listing of this home", short: "Sale listing, Mar 2025", photos: photos("maple", "original") },
  "905 Cedar Ridge Cv, Austin TX 78702": { label: "October 2024 sale listing of this home", short: "Sale listing, Oct 2024", photos: photos("cedar", "original") },
};

export const DEMO_LISTINGS = [
  {
    id: "maple",
    address: "2104 Maple Bend Dr, Austin TX 78704",
    zip: "78704",
    lat: 30.2502, lng: -97.7601,
    beds: 3, baths: 2, sqft: 1640,
    rent: 1200,
    listerName: "Michael Brown",
    postedDaysAgo: 1,
    homeType: "House",
    photos: photos("maple", "copied"),
    facts: { "Year built": "1998", Laundry: "In unit", Parking: "Driveway", Pets: "Cats and dogs OK", "Available": "Now", Lease: "Flexible" },
    description:
      "Beautiful 3 bed home, newly painted, pets ok. I'm currently out of the country on a missionary assignment so I can't show the home, but you can drive by anytime. Many people are interested, so send the deposit to hold the house and the keys will be mailed to you.",
    messages: ["Please text me on WhatsApp at (512) 555-0147. Deposit is $1,200 via Zelle."],
  },
  {
    id: "oak",
    address: "4710 Oak Shadow Ln, Austin TX 78751",
    zip: "78751",
    lat: 30.3071, lng: -97.7266,
    beds: 3, baths: 2, sqft: 1520,
    rent: 2450,
    listerName: "David Nguyen",
    postedDaysAgo: 3,
    homeType: "House",
    photos: photos("oak", "original"),
    facts: { "Year built": "1962", Laundry: "Washer and dryer", Parking: "Carport", Pets: "Small dogs OK", "Available": "Dec 1", Lease: "12 months" },
    description:
      "Updated 1960s ranch near Hyde Park. Fenced yard, washer/dryer, 12-month lease. Open house Saturday 10am to noon, or request a tour through this page. Apply online here; no payment until you've seen the home and signed the lease.",
    messages: [],
  },
  {
    id: "cedar",
    address: "905 Cedar Ridge Cv, Austin TX 78702",
    zip: "78702",
    lat: 30.2611, lng: -97.7243,
    beds: 3, baths: 2.5, sqft: 1880,
    rent: 1650,
    listerName: "Property Rentals Group",
    postedDaysAgo: 0,
    homeType: "House",
    photos: photos("cedar", "copied"),
    facts: { "Year built": "2008", Laundry: "Hookups", Parking: "Garage", Pets: "Ask", "Available": "Now", Lease: "Month to month" },
    description:
      "Modern East Austin home, quiet cove, available now. Contact me directly at rentals.austin.homes@gmail.com to apply. Application fee and deposit required before showing.",
    messages: [],
  },
  {
    id: "elm",
    address: "2310 Elm Terrace St, Austin TX 78705",
    zip: "78705",
    lat: 30.2889, lng: -97.7451,
    beds: 2, baths: 1, sqft: 980,
    rent: 1950,
    listerName: "West Campus Homes LLC",
    postedDaysAgo: 2,
    homeType: "House",
    photos: photos("elm", "original"),
    facts: { "Year built": "1984", Laundry: "In unit", Parking: "Street", Pets: "No pets", "Available": "Jan 5", Lease: "12 months" },
    description:
      "Two blocks from campus. Remodeled kitchen, new floors, walk to Guadalupe. Professionally managed by West Campus Homes. Self-guided tours available; apply online through this page.",
    messages: [],
  },
  {
    id: "pecan",
    address: "1207 Pecan Grove Rd, Austin TX 78703",
    zip: "78703",
    lat: 30.2828, lng: -97.7609,
    beds: 3, baths: 2, sqft: 1710,
    rent: 3300,
    listerName: "Chidi Okafor",
    postedDaysAgo: 5,
    homeType: "House",
    photos: photos("pecan", "original"),
    facts: { "Year built": "1948", Laundry: "In unit", Parking: "Garage", Pets: "Dogs OK", "Available": "Dec 15", Lease: "12 months" },
    description:
      "Classic Clarksville bungalow on a tree-lined street. Original hardwoods, screened porch, detached garage. I'll be in town for showings the first two weekends of December; request a time here.",
    messages: [],
  },
  {
    id: "willow",
    address: "8816 Willow Creek Dr, Austin TX 78749",
    zip: "78749",
    lat: 30.219, lng: -97.853,
    beds: 4, baths: 2.5, sqft: 2240,
    rent: 2950,
    listerName: "Sarah Miller",
    postedDaysAgo: 4,
    homeType: "House",
    photos: photos("willow", "original"),
    facts: { "Year built": "1996", Laundry: "In unit", Parking: "2-car garage", Pets: "Cats and dogs OK", "Available": "Now", Lease: "12 months" },
    description:
      "Family home in Southwest Austin near Circle C, top-rated schools. Big backyard with a pecan tree, new HVAC. Tours most weekday evenings; book through this page.",
    messages: [],
  },
];
