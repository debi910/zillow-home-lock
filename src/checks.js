// Home Lock authenticity checks. Pure functions: no DOM, no network.
// Every check returns { id, label, status: "pass" | "warn" | "fail" | "info", detail, source? }.

import { fmrFor } from "./fmr.js";

const DAY = 24 * 60 * 60 * 1000;

// ---------- names ----------

const ENTITY_WORDS = new Set([
  "LLC", "L", "C", "INC", "LP", "LTD", "CO", "CORP", "TRUST", "TRUSTEE", "TR", "TRS",
  "FAMILY", "LIVING", "REVOCABLE", "REV", "ETAL", "ET", "AL", "THE", "AND", "OF", "&",
]);

export function nameTokens(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !ENTITY_WORDS.has(t));
}

// County rolls store names as "LAST FIRST MIDDLE" or "LAST FIRST & SPOUSE",
// listings use "First Last". Compare as token sets so order does not matter.
export function nameMatchScore(listerName, ownerName) {
  const a = new Set(nameTokens(listerName));
  const b = new Set(nameTokens(ownerName));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  // Score against the lister's tokens: "Jane Smith" fully inside
  // "SMITH JOHN & JANE" is a match even though the owner has more names.
  return shared / a.size;
}

export function maskName(ownerName) {
  return nameTokens(ownerName)
    .map((t) => t[0] + "•".repeat(Math.max(2, t.length - 1)))
    .join(" ");
}

// ---------- addresses ----------

const STREET_SUFFIX = {
  STREET: "ST", ST: "ST", AVENUE: "AVE", AVE: "AVE", AV: "AVE", DRIVE: "DR", DR: "DR",
  ROAD: "RD", RD: "RD", LANE: "LN", LN: "LN", BOULEVARD: "BLVD", BLVD: "BLVD",
  COURT: "CT", CT: "CT", CIRCLE: "CIR", CIR: "CIR", PLACE: "PL", PL: "PL",
  TRAIL: "TRL", TRL: "TRL", WAY: "WAY", PARKWAY: "PKWY", PKWY: "PKWY", COVE: "CV", CV: "CV",
};
const DIRECTIONS = { NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W", N: "N", S: "S", E: "E", W: "W" };
const NOISE = new Set(["AUSTIN", "TX", "TEXAS", "UNIT", "APT"]);

// Normalizes "1006 South 8th Street, Austin TX" and the county's
// "S 1006 8 ST TX 78704" to the same key: "1006 S 8 ST".
export function addressKey(address) {
  const tokens = String(address || "")
    .toUpperCase()
    .replace(/[.,#]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !NOISE.has(t) && !/^\d{5}(-\d{4})?$/.test(t));
  let number = null;
  let dir = null;
  const rest = [];
  for (const t of tokens) {
    if (number === null && /^\d+$/.test(t)) { number = t; continue; }
    if (dir === null && DIRECTIONS[t] && rest.length === 0) { dir = DIRECTIONS[t]; continue; }
    const ordinal = t.match(/^(\d+)(ST|ND|RD|TH)$/);
    if (ordinal) { rest.push(ordinal[1]); continue; }
    rest.push(STREET_SUFFIX[t] || t);
  }
  return [number, dir, ...rest].filter(Boolean).join(" ");
}

export function sameAddress(a, b) {
  const ka = addressKey(a);
  const kb = addressKey(b);
  return ka.length > 0 && ka === kb;
}

// ---------- listing text ----------

const RED_FLAGS = [
  { re: /\b(wire|western union|moneygram|zelle|cash ?app|venmo|gift ?cards?|bitcoin|crypto|usdt)\b/i,
    why: "asks for a payment method that can't be reversed" },
  { re: /\b(out of (the )?(country|state|town)|overseas|abroad|missionary|deployed|deployment|relocated for work)\b/i,
    why: "says the landlord is away and can't meet in person" },
  { re: /\b(lock ?box|drive by|can'?t show|cannot show|no showings?|keys? (will be )?(mailed|shipped|sent))\b/i,
    why: "avoids an in-person showing" },
  { re: /\b(whatsapp|telegram|signal app|text me at|email me at|contact me (directly|off))\b/i,
    why: "moves the conversation off the platform" },
  { re: /\b((fee|deposit)s? (is |are )?(required |due )?before (a |the |any )?(showing|tour|viewing)|deposit (before|to hold)|hold (it|the (home|house|unit)) (for you|with)|first come,? first served|many (people|applicants) (are )?interested)\b/i,
    why: "pressures you to pay before seeing the home" },
];

export function scanText(text) {
  const hits = [];
  for (const flag of RED_FLAGS) {
    const m = String(text || "").match(flag.re);
    if (m) hits.push({ phrase: m[0], why: flag.why });
  }
  return hits;
}

// ---------- the checks ----------

export function checkOwnerMatch(listing, parcel, lookupFailed = false) {
  if (lookupFailed) {
    return { id: "owner", label: "Lister vs. owner of record", status: "info",
      detail: "County property records couldn't be reached just now, so ownership wasn't checked." };
  }
  if (!parcel) {
    return { id: "owner", label: "Lister vs. owner of record", status: "warn",
      detail: "We couldn't find this address in county property records." };
  }
  const score = nameMatchScore(listing.listerName, parcel.ownerName);
  const masked = maskName(parcel.ownerName);
  if (listing.ownerApproved) {
    return { id: "owner", label: "Lister vs. owner of record", status: "pass",
      detail: `The verified owner (${masked}) approved this lister.`, source: parcel.source };
  }
  if (score >= 0.99) {
    return { id: "owner", label: "Lister vs. owner of record", status: "pass",
      detail: `The lister's name matches the owner in county records (${masked}).`, source: parcel.source };
  }
  if (score >= 0.5) {
    return { id: "owner", label: "Lister vs. owner of record", status: "warn",
      detail: `Partial name match with the owner of record (${masked}). Ask for proof of ownership.`,
      source: parcel.source };
  }
  return { id: "owner", label: "Lister vs. owner of record", status: "fail",
    detail: `The lister isn't the owner in county records (${masked}), and the owner hasn't approved them.`,
    source: parcel.source };
}

export function checkOwnerLivesThere(listing, parcel) {
  const label = "Is the owner living there?";
  if (!parcel || !parcel.ownerMailingAddress) {
    return { id: "occupancy", label, status: "info", detail: "No mailing address on file." };
  }
  if (!sameAddress(parcel.ownerMailingAddress, parcel.address)) {
    return { id: "occupancy", label, status: "pass",
      detail: "The owner's tax mail goes elsewhere, which is normal for a rental.", source: parcel.source };
  }
  const awayClaim = scanText(listing.description + " " + (listing.messages || []).join(" "))
    .some((h) => /away/.test(h.why));
  return { id: "occupancy", label, status: awayClaim ? "fail" : "warn",
    detail: awayClaim
      ? "County tax mail goes to this very house, so the owner appears to live here, yet the lister says they're away."
      : "County tax mail goes to this very house, so the owner appears to live here. Rentals of occupied homes are a common scam pattern.",
    source: parcel.source };
}

export function checkRecentSale(listing, parcel, now = Date.now()) {
  const label = "Recent sale photos";
  if (!parcel || !parcel.deedDate) {
    return { id: "sale", label, status: "info", detail: "No deed date on file." };
  }
  const days = Math.round((now - parcel.deedDate) / DAY);
  const when = new Date(parcel.deedDate).toISOString().slice(0, 10);
  if (days <= 730) {
    return { id: "sale", label, status: "warn",
      detail: `The home changed hands on ${when}. Its sale listing photos are probably still online, which is where scammers copy them from.`,
      source: parcel.source };
  }
  return { id: "sale", label, status: "pass", detail: `Last sold ${when}.`, source: parcel.source };
}

export function checkPhotoReuse(matches) {
  const label = "Photos reused from another listing";
  if (!matches || !matches.length) {
    return { id: "photos", label, status: "pass", detail: "No photo matches an earlier listing of this home." };
  }
  const best = matches.reduce((a, b) => (a.score >= b.score ? a : b));
  return { id: "photos", label, status: "fail",
    detail: `${matches.length} photo${matches.length > 1 ? "s" : ""} match the ${best.from} (up to ${Math.round(best.score * 100)}% similar), even though they were cropped, recolored or stamped.` };
}

export function checkPrice(listing) {
  const label = "Price vs. area rent";
  const fmr = fmrFor(listing.zip, listing.beds);
  if (!fmr) return { id: "price", label, status: "info", detail: "No HUD rent benchmark for this ZIP." };
  const ratio = listing.rent / fmr.rent;
  const pct = Math.round((1 - ratio) * 100);
  const detail = `$${listing.rent.toLocaleString()} vs. HUD fair market rent of $${fmr.rent.toLocaleString()} for a ${listing.beds}-bed in ${listing.zip}`;
  if (ratio < 0.65) return { id: "price", label, status: "fail", detail: `${pct}% below normal: ${detail}.`, source: fmr.source };
  if (ratio < 0.8) return { id: "price", label, status: "warn", detail: `${pct}% below normal: ${detail}.`, source: fmr.source };
  return { id: "price", label, status: "pass", detail: `In the normal range: ${detail}.`, source: fmr.source };
}

export function checkLanguage(listing) {
  const label = "Scam language";
  const hits = scanText(listing.description + " " + (listing.messages || []).join(" "));
  if (!hits.length) return { id: "language", label, status: "pass", detail: "No known scam phrases." };
  return { id: "language", label, status: hits.length >= 2 ? "fail" : "warn",
    detail: hits.map((h) => `"${h.phrase}" ${h.why}`).join("; ") + "." };
}

export function checkLock(listing, lock) {
  const label = "Home Lock";
  if (!lock) return { id: "lock", label, status: "info", detail: "The owner hasn't turned on Home Lock." };
  if (listing.ownerApproved) {
    return { id: "lock", label, status: "pass", detail: "Home Lock is on and the owner approved this listing." };
  }
  return { id: "lock", label, status: "fail",
    detail: "The owner has locked this home as NOT for rent. The listing is held and the owner has been alerted." };
}

// ---------- relist fingerprints ----------
// When a listing is removed for fraud, Home Lock keeps a fingerprint of it:
// contact details, payment handles, wording and photos. Scammers relist with a
// new name and one photo swapped, but they rarely change all of these at once.

export function extractContacts(text) {
  const out = new Set();
  const t = String(text || "");
  for (const m of t.matchAll(/(?:\+?1[\s.-]*)?\(?(\d{3})\)?[\s.-]*(\d{3})[\s.-]*(\d{4})\b/g)) out.add(`phone:${m[1]}${m[2]}${m[3]}`);
  for (const m of t.matchAll(/[\w.+-]+@[\w-]+\.[\w.]+/g)) out.add(`email:${m[0].toLowerCase()}`);
  for (const m of t.matchAll(/(?:^|\s)\$([A-Za-z][\w]{2,})/g)) out.add(`cashtag:${m[1].toLowerCase()}`);
  return [...out];
}

const words = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
function shingles(text, n = 3) {
  const w = words(text);
  const set = new Set();
  for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(" "));
  return set;
}

// Share of three-word phrases the two texts have in common (Jaccard).
export function textSimilarity(a, b) {
  const A = shingles(a), B = shingles(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const x of A) if (B.has(x)) both++;
  return both / (A.size + B.size - both);
}

export const listingText = (l) => [l.description, ...(l.messages || []), l.contact || ""].join(" ");

export function fingerprint(listing, reason, now = Date.now()) {
  return {
    id: `fp-${listing.id}`, listingId: listing.id, address: listing.address, listerName: listing.listerName,
    contacts: extractContacts(listingText(listing)), text: listingText(listing), photos: listing.photos || [],
    reason, removedAt: now,
  };
}

const CONTACT_LABEL = { phone: "phone number", email: "email address", cashtag: "Cash App handle" };

// photoHits: { [fingerprintId]: number of this listing's photos matching that removed listing }
export function checkRelist(listing, blocklist = [], photoHits = {}) {
  const label = "Matches a listing removed for fraud";
  const mine = new Set(extractContacts(listingText(listing)));
  let best = null;
  for (const fp of blocklist) {
    if (fp.listingId === listing.id) continue;
    const shared = fp.contacts.filter((c) => mine.has(c));
    const sim = textSimilarity(listingText(listing), fp.text);
    const photos = photoHits[fp.id] || 0;
    const signals = [];
    if (shared.length) signals.push(`the same ${shared.map((c) => CONTACT_LABEL[c.split(":")[0]]).join(" and ")}`);
    if (photos) signals.push(`${photos} of the same photo${photos > 1 ? "s" : ""}`);
    if (sim >= 0.35) signals.push(`${Math.round(sim * 100)}% of the same wording`);
    if (signals.length && (!best || signals.length > best.signals.length)) best = { fp, signals, shared, sim, photos };
  }
  if (!best) return { id: "relist", label, status: "pass", detail: "No link to any listing removed for fraud." };
  const when = new Date(best.fp.removedAt).toISOString().slice(0, 10);
  const where = addressKey(best.fp.address) === addressKey(listing.address) ? "this home" : best.fp.address;
  return { id: "relist", label, status: "fail", fingerprint: best.fp.id,
    signals: { contacts: best.shared, similarity: best.sim, photos: best.photos },
    detail: `It uses ${best.signals.join(", ")} as a listing of ${where} that was removed for fraud on ${when} (listed then as "${best.fp.listerName}").` };
}

// Decides at posting time whether a new listing goes live or waits.
export function holdReason(checks, lock, listing) {
  if (listing.ownerApproved) return null;
  if (lock) return "lock";
  const by = Object.fromEntries(checks.map((c) => [c.id, c.status]));
  if (by.relist === "fail") return "relist";
  // Someone other than the owner is renting out a home the owner appears to live in.
  if (by.owner === "fail" && (by.occupancy === "fail" || by.occupancy === "warn")) return "notice";
  return null;
}

// ---------- verdict ----------

export function runChecks({ listing, parcel, lock, photoMatches, now, lookupFailed = false, blocklist = [], relistPhotoHits = {} }) {
  const checks = [
    checkLock(listing, lock),
    checkRelist(listing, blocklist, relistPhotoHits),
    checkOwnerMatch(listing, parcel, lookupFailed),
    checkOwnerLivesThere(listing, parcel),
    checkPhotoReuse(photoMatches),
    checkRecentSale(listing, parcel, now),
    checkPrice(listing),
    checkLanguage(listing),
  ];
  return { checks, verdict: verdict(checks, lock, listing) };
}

const HELD = {
  lock: { title: "Held: the owner says this home is not for rent", advice: "Don't send money. The real owner has been notified." },
  relist: { title: "Held: linked to a listing removed for fraud", advice: "Don't send money. This lister matches a scam that was already taken down." },
  notice: { title: "Held: waiting for the owner of record", advice: "We mailed the owner. This listing goes live only if they confirm it." },
};

export function verdict(checks, lock, listing) {
  if (lock && !listing.ownerApproved) return { level: "blocked", reason: "lock", ...HELD.lock };
  if (listing.hold && !listing.ownerApproved) return { level: "blocked", reason: listing.hold, ...HELD[listing.hold] };
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  if (fails >= 2 || (fails === 1 && warns >= 2)) {
    return { level: "danger", title: "Likely scam",
      advice: "Don't send money or personal details. Report this listing." };
  }
  if (fails === 1 || warns >= 2) {
    return { level: "caution", title: "Proceed with caution",
      advice: "Tour the home in person and ask for proof of ownership before paying anything." };
  }
  return { level: "ok", title: "Looks legitimate",
    advice: "Still tour in person and pay only through the platform." };
}
