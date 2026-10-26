import test from "node:test";
import assert from "node:assert/strict";
import { addressKey, sameAddress, nameMatchScore, maskName, scanText, runChecks, extractContacts, textSimilarity, fingerprint, holdReason } from "../src/checks.js";
import { fmrFor } from "../src/fmr.js";
import { buildWhere, pickParcel } from "../src/county.js";
import { DEMO_LISTINGS, DEMO_PARCELS } from "../src/fixtures.js";

test("county and listing address formats normalize to the same key", () => {
  assert.equal(addressKey("S 1006 8 ST TX 78704"), "1006 S 8 ST");
  assert.equal(addressKey("1006 South 8th Street, Austin TX 78704"), "1006 S 8 ST");
  assert.equal(addressKey("W 1103 MONROE ST AUSTIN TX 78704"), addressKey("1103 W. Monroe St"));
  assert.ok(sameAddress("2104 MAPLE BEND DR", "2104 Maple Bend Dr, Austin TX 78704"));
  assert.ok(!sameAddress("2104 Maple Bend Dr", "2106 Maple Bend Dr"));
});

test("name matching ignores order, initials and trust/LLC words", () => {
  assert.equal(nameMatchScore("Elena Garcia", "GARCIA ELENA M"), 1);
  assert.equal(nameMatchScore("David Nguyen", "NGUYEN DAVID & LINH T"), 1);
  assert.equal(nameMatchScore("Linh Nguyen", "NGUYEN DAVID & LINH T"), 1);
  assert.equal(nameMatchScore("Michael Brown", "GARCIA ELENA M"), 0);
  assert.equal(nameMatchScore("Jane Smith", "SMITH FAMILY TRUST"), 0.5);
  assert.equal(maskName("GARCIA ELENA M"), "G••••• E••••");
});

test("scam language is caught", () => {
  const hits = scanText("I'm out of the country, send the deposit via Zelle and keys will be mailed. Text me on WhatsApp");
  assert.equal(hits.length, 4);
  assert.equal(scanText("Open house Saturday, apply online, no payment until you've seen the home").length, 0);
  assert.equal(scanText("Application fee and deposit required before showing").length, 1);
});

test("HUD rents", () => {
  assert.equal(fmrFor("78704", 3).rent, 2590);
  assert.equal(fmrFor("78701", 2).rent, 2730);
  assert.equal(fmrFor("99999", 2), null);
});

test("county query and record picking", () => {
  assert.equal(buildWhere("1105 W Monroe St, Austin TX 78704"), "situs_address LIKE '%1105%MONROE%'");
  assert.throws(() => buildWhere("Monroe St"));
  const features = [
    { attributes: { PROP_ID: 1, situs_address: "W 1105 MONROE ST TX 78704", py_owner_name: "A B" } },
    { attributes: { PROP_ID: 2, situs_address: "E 1105 MONROE ST TX 78704", py_owner_name: "C D" } },
  ];
  assert.equal(pickParcel(features, "1105 W Monroe St").propId, 1);
  assert.equal(pickParcel(features, "1105 N Monroe St"), null);
});

const now = Date.UTC(2026, 9, 26);
const parcelFor = (l) => DEMO_PARCELS.find((p) => p.address === l.address);
const listing = (id) => DEMO_LISTINGS.find((l) => l.id === id);

test("scam demo listing is flagged as a likely scam", () => {
  const l = listing("maple");
  const r = runChecks({ listing: l, parcel: parcelFor(l), lock: null, photoMatches: [{ score: 0.95, from: "sale listing" }], now });
  assert.equal(r.verdict.level, "danger");
  const status = Object.fromEntries(r.checks.map((c) => [c.id, c.status]));
  assert.deepEqual(status, { lock: "info", relist: "pass", owner: "fail", occupancy: "fail", photos: "fail", sale: "warn", price: "fail", language: "fail" });
});

test("legit demo listing looks legitimate", () => {
  const l = listing("oak");
  const r = runChecks({ listing: l, parcel: parcelFor(l), lock: null, photoMatches: [], now });
  assert.equal(r.verdict.level, "ok");
  assert.ok(r.checks.every((c) => c.status === "pass" || c.status === "info"));
});

test("a locked home holds the listing until the owner approves", () => {
  const l = listing("cedar");
  const locked = runChecks({ listing: l, parcel: parcelFor(l), lock: { since: now }, photoMatches: [], now });
  assert.equal(locked.verdict.level, "blocked");
  const approved = runChecks({ listing: { ...l, ownerApproved: true }, parcel: parcelFor(l), lock: { since: now }, photoMatches: [], now });
  assert.notEqual(approved.verdict.level, "blocked");
  assert.equal(approved.checks.find((c) => c.id === "owner").status, "pass");
});

test("missing county record is a warning, not a crash", () => {
  const l = listing("oak");
  const r = runChecks({ listing: l, parcel: null, lock: null, photoMatches: [], now });
  assert.equal(r.checks.find((c) => c.id === "owner").status, "warn");
});

test("contacts and payment handles are pulled out of listing text", () => {
  assert.deepEqual(extractContacts("Text (512) 555-0147 or 512.555.0147, email Rent.Home@gmail.com, pay $homekeys not $1,200"),
    ["phone:5125550147", "email:rent.home@gmail.com", "cashtag:homekeys"]);
  assert.deepEqual(extractContacts("Open house Saturday at 2pm"), []);
});

test("a relist with a new name and swapped photo is linked to the removed scam", () => {
  const removed = fingerprint(listing("maple"), "reported", now);
  const relist = { ...listing("maple"), id: "relist-1", listerName: "Mike Bowen",
    description: "Beautiful 3 bed home, freshly painted, pets welcome. I'm out of the country on a mission trip so I can't show it. Many people are interested, so send the deposit to hold it.",
    messages: ["WhatsApp me at 512-555-0147, deposit by Zelle."] };
  const r = runChecks({ listing: relist, parcel: parcelFor(relist), lock: null, photoMatches: [], now, blocklist: [removed], relistPhotoHits: { [removed.id]: 3 } });
  const c = r.checks.find((x) => x.id === "relist");
  assert.equal(c.status, "fail");
  assert.deepEqual(c.signals.contacts, ["phone:5125550147"]);
  assert.equal(c.signals.photos, 3);
  assert.ok(c.signals.similarity > 0.2);
  assert.equal(holdReason(r.checks, null, relist), "relist");
  // An unrelated honest listing doesn't match.
  const oak = runChecks({ listing: listing("oak"), parcel: parcelFor(listing("oak")), lock: null, photoMatches: [], now, blocklist: [removed] });
  assert.equal(oak.checks.find((x) => x.id === "relist").status, "pass");
  assert.ok(textSimilarity("the quick brown fox jumps", "the quick brown fox jumps") === 1);
});

test("a stranger renting out an owner-occupied home waits for the owner of record", () => {
  const l = { ...listing("maple"), id: "new" };
  const r = runChecks({ listing: l, parcel: parcelFor(l), lock: null, photoMatches: [], now });
  assert.equal(holdReason(r.checks, null, l), "notice");
  const held = runChecks({ listing: { ...l, hold: "notice" }, parcel: parcelFor(l), lock: null, photoMatches: [], now });
  assert.equal(held.verdict.level, "blocked");
  assert.equal(held.verdict.reason, "notice");
  // The real owner listing their own home goes straight through.
  const own = listing("oak");
  assert.equal(holdReason(runChecks({ listing: own, parcel: parcelFor(own), lock: null, photoMatches: [], now }).checks, null, own), null);
  // A lock takes priority.
  assert.equal(holdReason(r.checks, { since: now }, l), "lock");
});
