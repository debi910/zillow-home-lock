// Looks up the owner of record for an Austin-area address in the Travis
// Central Appraisal District parcel layer (public ArcGIS REST service).
//
// Tries the county API directly, then this app's own proxy (server.mjs, for
// browsers that block the cross-origin call), then the synthetic demo records.

import { addressKey } from "./checks.js";
import { DEMO_PARCELS } from "./fixtures.js";

export const COUNTY_LAYER =
  "https://taxmaps.traviscountytx.gov/arcgis/rest/services/Parcels/FeatureServer/0/query";

export const COUNTY_SOURCE = {
  name: "Travis Central Appraisal District parcel records (live)",
  url: "https://www.traviscad.org/property-search/",
};

const FIELDS = [
  "PROP_ID", "py_owner_name", "situs_address", "situs_zip", "py_address",
  "deed_date", "market_value", "land_type_desc", "F1year_imprv",
];

export function buildWhere(address) {
  const key = addressKey(address);
  const [number, ...rest] = key.split(" ");
  if (!/^\d+$/.test(number || "")) throw new Error("Start the address with a house number.");
  // The longest remaining word is usually the street name ("MONROE", "LAMAR", "8").
  const street = rest
    .filter((t) => !/^(N|S|E|W|ST|AVE|DR|RD|LN|BLVD|CT|CIR|PL|TRL|WAY|PKWY|CV)$/.test(t))
    .sort((a, b) => b.length - a.length)[0] || "";
  const safe = (s) => s.replace(/'/g, "''");
  return `situs_address LIKE '%${safe(number)}%${safe(street)}%'`;
}

export function queryParams(address) {
  return new URLSearchParams({
    where: buildWhere(address),
    outFields: FIELDS.join(","),
    returnGeometry: "false",
    resultRecordCount: "50",
    f: "json",
  });
}

export function toParcel(attrs, source = COUNTY_SOURCE) {
  return {
    propId: attrs.PROP_ID,
    ownerName: (attrs.py_owner_name || "").trim(),
    address: (attrs.situs_address || "").trim(),
    zip: attrs.situs_zip ? String(attrs.situs_zip).trim() : null,
    ownerMailingAddress: (attrs.py_address || "").trim(),
    deedDate: attrs.deed_date || null,
    marketValue: attrs.market_value || null,
    landUse: attrs.land_type_desc || null,
    yearBuilt: attrs.F1year_imprv || null,
    source,
  };
}

// Picks the record whose normalized address equals the one asked for.
export function pickParcel(features, address) {
  const want = addressKey(address);
  const hit = (features || []).find((f) => addressKey(f.attributes.situs_address) === want);
  return hit ? toParcel(hit.attributes) : null;
}

async function getJson(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(body.error.message || "County API error");
    return body;
  } finally {
    clearTimeout(timer);
  }
}

// Returns { parcel, mode } where mode is "live", "proxy" or "demo".
export async function lookupParcel(address) {
  const demo = DEMO_PARCELS.find((p) => addressKey(p.address) === addressKey(address));
  if (demo) return { parcel: demo, mode: "demo" };

  const qs = queryParams(address).toString();
  const attempts = [
    { mode: "live", url: `${COUNTY_LAYER}?${qs}` },
    { mode: "proxy", url: `/api/parcels?${qs}` },
  ];
  let lastError = null;
  for (const a of attempts) {
    try {
      const body = await getJson(a.url);
      return { parcel: pickParcel(body.features, address), mode: a.mode };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Couldn't reach the county records (${lastError?.message || "network error"}).`);
}
