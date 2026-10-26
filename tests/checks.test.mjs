import test from "node:test";
import assert from "node:assert/strict";
import { addressKey, sameAddress, nameMatchScore, maskName, scanText, runChecks } from "../src/checks.js";
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
  assert.deepEqual(status, { lock: "info", owner: "fail", occupancy: "fail", photos: "fail", sale: "warn", price: "fail", language: "fail" });
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
