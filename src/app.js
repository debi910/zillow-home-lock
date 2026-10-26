import { runChecks, nameMatchScore, maskName, addressKey } from "./checks.js";
import { lookupParcel } from "./county.js";
import { DEMO_LISTINGS, DEMO_PARCELS, PHOTO_ARCHIVE } from "./fixtures.js";
import { indexArchive, loadImage, thumbnail, bestMatch, MATCH_THRESHOLD } from "./phash.js";
import { store } from "./store.js";

const $ = (sel, root = document) => root.querySelector(sel);
const app = $("#app");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => `$${Number(n).toLocaleString()}`;
const lockFor = (address) => {
  const locks = store.locks();
  const key = Object.keys(locks).find((a) => addressKey(a) === addressKey(address));
  return key ? locks[key] : null;
};

const BADGE = {
  ok: { text: "Owner verified", cls: "ok" },
  caution: { text: "Caution", cls: "caution" },
  danger: { text: "Likely scam", cls: "danger" },
  blocked: { text: "Held by owner's Home Lock", cls: "blocked" },
  pending: { text: "Checking…", cls: "pending" },
};
const ICON = { pass: "✓", warn: "!", fail: "✕", info: "i" };

// ---------- checks with photos ----------

const archiveCache = new Map();
async function photoMatches(listing) {
  const entry = Object.entries(PHOTO_ARCHIVE).find(([a]) => addressKey(a) === addressKey(listing.address));
  if (!entry) return [];
  const [address, archive] = entry;
  if (!archiveCache.has(address)) archiveCache.set(address, indexArchive(archive.photos));
  const index = await archiveCache.get(address);
  const matches = [];
  for (const src of listing.photos || []) {
    const img = await loadImage(src);
    const best = bestMatch(thumbnail(img), index);
    if (best && best.score >= MATCH_THRESHOLD) matches.push({ src, match: best.src, score: best.score, from: archive.label });
  }
  return matches;
}

const resultCache = new Map();
async function evaluate(listing) {
  const cacheKey = JSON.stringify([listing.id, listing.ownerApproved, !!lockFor(listing.address)]);
  if (resultCache.has(cacheKey)) return resultCache.get(cacheKey);
  const promise = (async () => {
    let parcel = null;
    let mode = "none";
    let lookupError = null;
    try {
      ({ parcel, mode } = await lookupParcel(listing.address));
    } catch (err) {
      lookupError = err.message;
    }
    const matches = await photoMatches(listing).catch(() => []);
    const result = runChecks({ listing, parcel, lock: lockFor(listing.address), photoMatches: matches, lookupFailed: !!lookupError });
    return { ...result, parcel, mode, lookupError, matches };
  })();
  resultCache.set(cacheKey, promise);
  return promise;
}

function allListings() {
  const posted = store.listings();
  const ids = new Set(posted.map((l) => l.id));
  // Listings the owner blocked are taken down.
  return [...posted, ...DEMO_LISTINGS.filter((l) => !ids.has(l.id))].filter((l) => !l.removed);
}

// ---------- router ----------

const routes = { browse, listing: listingDetail, post, owner, check, about };
function go(hash) {
  location.hash = hash;
}
async function render() {
  const [route, arg] = location.hash.replace(/^#\/?/, "").split("/");
  const view = routes[route] || browse;
  document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === (routes[route] ? route : "browse")));
  window.scrollTo(0, 0);
  await view(arg ? decodeURIComponent(arg) : undefined);
}
window.addEventListener("hashchange", render);

// ---------- browse ----------

async function browse() {
  const listings = allListings();
  const alerts = store.alerts().filter((a) => a.status === "held");
  app.innerHTML = `
    <section class="hero">
      <div>
        <h1>Austin, TX rentals</h1>
        <p>Every listing is checked against county property records, the home's past listing photos, area rents and known scam patterns.</p>
      </div>
      <label class="toggle"><input type="checkbox" id="before"> Show today's Zillow (no Home Lock)</label>
    </section>
    ${alerts.length ? `<div class="notice">${alerts.length} listing${alerts.length > 1 ? "s are" : " is"} held because the owner turned on Home Lock. <a href="#/owner">Owner view</a></div>` : ""}
    <div class="grid" id="grid">
      ${listings.map((l) => cardHtml(l)).join("")}
    </div>`;
  const before = $("#before");
  before.checked = sessionStorage.getItem("hl.before") === "1";
  before.addEventListener("change", () => {
    sessionStorage.setItem("hl.before", before.checked ? "1" : "0");
    browse();
  });
  for (const l of listings) {
    evaluate(l).then((r) => {
      const el = $(`[data-badge="${CSS.escape(l.id)}"]`);
      if (!el || before.checked) return;
      const b = BADGE[r.verdict.level];
      el.className = `badge ${b.cls}`;
      el.textContent = b.text;
    });
  }
}

function cardHtml(l) {
  const beforeMode = sessionStorage.getItem("hl.before") === "1";
  return `
    <a class="card" href="#/listing/${encodeURIComponent(l.id)}">
      <div class="thumb" style="background-image:url('${esc(l.photos[0])}')">
        ${beforeMode ? "" : `<span class="badge pending" data-badge="${esc(l.id)}">${BADGE.pending.text}</span>`}
      </div>
      <div class="card-body">
        <div class="price">${money(l.rent)}<span>/mo</span></div>
        <div class="facts"><b>${l.beds}</b> bd · <b>${l.baths}</b> ba · <b>${Number(l.sqft).toLocaleString()}</b> sqft</div>
        <div class="addr">${esc(l.address)}</div>
        <div class="muted">Listed by ${esc(l.listerName)}${l.postedDaysAgo === 0 ? " · New today" : ` · ${l.postedDaysAgo}d ago`}</div>
      </div>
    </a>`;
}

// ---------- listing detail ----------

async function listingDetail(id) {
  const l = allListings().find((x) => x.id === id);
  if (!l) return go("#/browse");
  const beforeMode = sessionStorage.getItem("hl.before") === "1";
  app.innerHTML = `
    <a class="back" href="#/browse">← All rentals</a>
    <div class="detail">
      <div>
        <div class="gallery">
          ${l.photos.map((p, i) => `<img src="${esc(p)}" alt="Listing photo ${i + 1}" class="${i === 0 ? "hero-img" : ""}">`).join("")}
        </div>
        <div class="price big">${money(l.rent)}<span>/mo</span></div>
        <div class="facts"><b>${l.beds}</b> bd · <b>${l.baths}</b> ba · <b>${Number(l.sqft).toLocaleString()}</b> sqft</div>
        <h2 class="addr">${esc(l.address)}</h2>
        <h3>What the lister says</h3>
        <p>${esc(l.description)}</p>
        ${(l.messages || []).length ? `<h3>Messages from the lister</h3>${l.messages.map((m) => `<p class="bubble">${esc(m)}</p>`).join("")}` : ""}
        <p class="muted">Listed by ${esc(l.listerName)}</p>
      </div>
      <aside id="panel">
        ${beforeMode ? beforePanel() : `<div class="panel"><div class="spinner"></div><p>Checking county records, photos and price…</p></div>`}
      </aside>
    </div>`;
  if (beforeMode) return;
  const r = await evaluate(l);
  if (location.hash !== `#/listing/${encodeURIComponent(id)}`) return;
  $("#panel").innerHTML = panelHtml(r, l);
}

function beforePanel() {
  return `
    <div class="panel before">
      <h3>Contact this lister</h3>
      <button class="btn" disabled>Request a tour</button>
      <div class="generic-warning"><b>Beware of rental scams.</b> Never wire money or pay before seeing a home.</div>
      <p class="muted">This is all a renter sees today: a generic warning on every listing.</p>
    </div>`;
}

function panelHtml(r, l) {
  const v = r.verdict;
  const b = BADGE[v.level];
  const modeNote = {
    live: "Owner data pulled live from Travis County records.",
    proxy: "Owner data pulled live from Travis County records (via this app's proxy).",
    demo: "Demo home: synthetic owner record in the county's format.",
    none: r.lookupError ? `County lookup failed: ${esc(r.lookupError)}` : "",
  }[r.mode];
  const pair = (m) => `
        <figure><img src="${esc(m.src)}" alt="Photo in this listing"><figcaption>This listing</figcaption></figure>
        <span class="eq">≈ ${Math.round(m.score * 100)}%</span>
        <figure><img src="${esc(m.match)}" alt="Photo from the earlier listing"><figcaption>${esc(m.from)}</figcaption></figure>`;
  const photoEvidence = r.matches.length
    ? `<div class="evidence">${pair(r.matches[0])}</div>${r.matches.length > 1
      ? `<details><summary class="small">Show all ${r.matches.length} matching photos</summary><div class="evidence">${r.matches.slice(1).map(pair).join("")}</div></details>`
      : ""}`
    : "";
  return `
    <div class="panel">
      <div class="verdict ${b.cls}">
        <div class="verdict-title">${esc(v.title)}</div>
        <div>${esc(v.advice)}</div>
      </div>
      <h3>Home Lock check</h3>
      <ul class="checks">
        ${r.checks.map((c) => `
          <li class="${c.status}">
            <span class="dot">${ICON[c.status]}</span>
            <div><b>${esc(c.label)}</b><div>${esc(c.detail)}</div>
            ${c.source ? `<a class="src" href="${esc(c.source.url)}" target="_blank" rel="noopener">${esc(c.source.name)}</a>` : ""}</div>
          </li>`).join("")}
      </ul>
      ${photoEvidence}
      <p class="muted small">${modeNote}</p>
      ${v.level === "danger" || v.level === "blocked" ? `<button class="btn danger-btn" id="report">Report this listing</button>` : `<button class="btn">Request a tour</button>`}
      <p class="muted small">Are you the owner of this home? <a href="#/owner">Turn on Home Lock</a>.</p>
    </div>`;
}

// ---------- post a rental (lister side) ----------

async function post() {
  const addresses = DEMO_PARCELS.map((p) => p.address);
  app.innerHTML = `
    <h1>Post a rental</h1>
    <p class="muted">This is the lister's side. Try posting a home you don't own and see what Home Lock does.</p>
    <form class="form" id="postForm">
      <label>Address
        <input name="address" list="addrs" required placeholder="2104 Maple Bend Dr, Austin TX 78704">
        <datalist id="addrs">${addresses.map((a) => `<option value="${esc(a)}">`).join("")}</datalist>
      </label>
      <div class="row">
        <label>Your name<input name="listerName" required placeholder="Michael Brown"></label>
        <label>Monthly rent<input name="rent" type="number" min="100" required value="1200"></label>
      </div>
      <div class="row">
        <label>Bedrooms<input name="beds" type="number" min="0" max="8" required value="3"></label>
        <label>Bathrooms<input name="baths" type="number" min="1" max="8" step="0.5" required value="2"></label>
        <label>Square feet<input name="sqft" type="number" min="200" required value="1600"></label>
      </div>
      <label>Description<textarea name="description" rows="4" required>Lovely home, available now. I'm out of the country so I can't show it, but send the deposit to hold it and I'll mail the keys.</textarea></label>
      <fieldset>
        <legend>Photos</legend>
        <label class="radio"><input type="radio" name="photoSet" value="maple" checked> Use the photos from this home's old sale listing (what scammers do)</label>
        <label class="radio"><input type="radio" name="photoSet" value="oak"> Use my own new photos</label>
        <label class="radio"><input type="radio" name="photoSet" value="upload"> Upload photos <input type="file" name="files" accept="image/*" multiple></label>
      </fieldset>
      <button class="btn primary" type="submit">Publish listing</button>
    </form>
    <div id="postResult"></div>`;
  $("#postForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const address = f.get("address").trim();
    const parcelZip = (address.match(/\b(\d{5})\b(?!.*\d{5})/) || [])[1] || "";
    let photos;
    const set = f.get("photoSet");
    if (set === "upload") {
      const files = [...e.target.files.files].slice(0, 6);
      if (!files.length) return alert("Pick at least one photo to upload.");
      photos = await Promise.all(files.map(fileToDataUrl));
    } else {
      const home = set === "maple" ? photoHomeFor(address) : "oak";
      photos = [1, 2, 3, 4].map((i) => `demo/photos/${home}-${set === "maple" ? "copied" : "original"}-${i}.jpg`);
    }
    const listing = {
      id: `posted-${Date.now()}`,
      address,
      zip: parcelZip,
      listerName: f.get("listerName").trim(),
      rent: Number(f.get("rent")),
      beds: Number(f.get("beds")),
      baths: Number(f.get("baths")),
      sqft: Number(f.get("sqft")),
      description: f.get("description").trim(),
      messages: [],
      photos,
      postedDaysAgo: 0,
      ownerApproved: false,
    };
    $("#postResult").innerHTML = `<div class="panel"><div class="spinner"></div><p>Running Home Lock checks…</p></div>`;
    const r = await evaluate(listing);
    store.saveListing(listing);
    if (r.verdict.level === "blocked") {
      store.addAlert({
        id: `alert-${Date.now()}`, listingId: listing.id, address: listing.address,
        listerName: listing.listerName, rent: listing.rent, at: Date.now(), status: "held",
      });
      $("#postResult").innerHTML = `
        <div class="verdict blocked"><div class="verdict-title">Your listing is on hold</div>
        <div>The owner of this home has turned on Home Lock, so they need to approve it before it goes live. We've notified them.</div></div>
        <p><a href="#/owner">See what the owner sees →</a></p>`;
    } else {
      $("#postResult").innerHTML = `
        <div class="verdict ${BADGE[r.verdict.level].cls}"><div class="verdict-title">Published with the label "${BADGE[r.verdict.level].text}"</div>
        <div>Renters will see the Home Lock check next to your listing.</div></div>
        <p><a href="#/listing/${encodeURIComponent(listing.id)}">View your listing as a renter →</a></p>`;
    }
  });
}

function photoHomeFor(address) {
  if (/cedar/i.test(address)) return "cedar";
  return "maple";
}

async function fileToDataUrl(file) {
  const img = await loadImage(URL.createObjectURL(file));
  const scale = Math.min(1, 800 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

// ---------- owner: claim + lock ----------

async function owner() {
  const claims = store.claims();
  const claimed = Object.keys(claims);
  app.innerHTML = `
    <h1>Home Lock for owners</h1>
    <p class="muted">Claim your home once, then lock it as <b>not for rent</b>. Any rental listing of a locked home is held until you approve it.</p>
    <div class="owner-grid">
      <section class="panel">
        <h3>Claim a home</h3>
        <form id="claimForm" class="form">
          <label>Home address<input name="address" list="addrs" required placeholder="905 Cedar Ridge Cv, Austin TX 78702">
            <datalist id="addrs">${DEMO_PARCELS.map((p) => `<option value="${esc(p.address)}">`).join("")}</datalist></label>
          <label>Your full name<input name="name" required placeholder="Anjali Patel"></label>
          <button class="btn primary" type="submit">Find my home in county records</button>
        </form>
        <div id="claimStep"></div>
      </section>
      <section>
        ${claimed.length ? claimed.map((a) => ownerHomeHtml(a, claims[a])).join("") : `<div class="panel muted">No claimed homes yet.</div>`}
      </section>
    </div>`;
  $("#claimForm").addEventListener("submit", onClaim);
  app.querySelectorAll("[data-lock]").forEach((el) => el.addEventListener("change", () => {
    store.setLock(el.dataset.lock, el.checked ? { since: Date.now() } : null);
    resultCache.clear();
    owner();
  }));
  app.querySelectorAll("[data-approve]").forEach((el) => el.addEventListener("click", () => decide(el.dataset.approve, true)));
  app.querySelectorAll("[data-deny]").forEach((el) => el.addEventListener("click", () => decide(el.dataset.deny, false)));
}

function ownerHomeHtml(address, claim) {
  const lock = lockFor(address);
  const alerts = store.alerts().filter((a) => addressKey(a.address) === addressKey(address));
  return `
    <div class="panel home">
      <div class="home-head">
        <div><b>${esc(address)}</b><div class="muted small">Verified owner: ${esc(claim.name)} · matches ${esc(claim.masked)} in county records</div></div>
        <label class="switch"><input type="checkbox" data-lock="${esc(address)}" ${lock ? "checked" : ""}><span></span> Not for rent</label>
      </div>
      <p class="small">${lock ? "Locked. Rental listings for this address are held until you approve them." : "Unlocked. Anyone can list this address for rent."}</p>
      <h4>Alerts</h4>
      ${alerts.length ? `<ul class="alerts">${alerts.map((a) => `
        <li class="${a.status}">
          <div><b>${esc(a.listerName)}</b> tried to list your home for ${money(a.rent)}/mo
          <div class="muted small">${new Date(a.at).toLocaleString()} · ${a.status === "held" ? "Held, waiting for you" : a.status === "approved" ? "You approved it" : "You blocked it and reported the lister"}</div></div>
          ${a.status === "held" ? `<div class="actions"><button class="btn small" data-approve="${esc(a.id)}">It's my manager, approve</button><button class="btn small danger-btn" data-deny="${esc(a.id)}">Not me, block and report</button></div>` : ""}
        </li>`).join("")}</ul>` : `<p class="muted small">No one has tried to list this home.</p>`}
    </div>`;
}

async function onClaim(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const address = f.get("address").trim();
  const name = f.get("name").trim();
  const step = $("#claimStep");
  step.innerHTML = `<div class="spinner"></div>`;
  let parcel;
  let mode;
  try {
    ({ parcel, mode } = await lookupParcel(address));
  } catch (err) {
    step.innerHTML = `<p class="fail-text">${esc(err.message)}</p>`;
    return;
  }
  if (!parcel) {
    step.innerHTML = `<p class="fail-text">We couldn't find that address in Travis County records. Check the house number and street.</p>`;
    return;
  }
  const masked = maskName(parcel.ownerName);
  if (nameMatchScore(name, parcel.ownerName) < 0.99) {
    step.innerHTML = `<p class="fail-text">County records list the owner as ${esc(masked)}, which doesn't match "${esc(name)}". Only the owner of record can lock a home.</p>`;
    return;
  }
  // A real rollout would mail this code to the property address, the same way
  // Zillow already verifies home claims. The demo shows it on screen.
  const code = String(1000 + Math.floor(Math.random() * 9000));
  step.innerHTML = `
    <p class="ok-text">Match: ${esc(masked)} owns this home in county records${mode === "demo" ? " (demo record)" : ""}.</p>
    <p class="small">We've mailed a 4-digit code to the property address. <span class="muted">(Demo: the code is <b>${code}</b>.)</span></p>
    <form id="codeForm" class="form inline"><input name="code" inputmode="numeric" maxlength="4" placeholder="Code" required><button class="btn primary">Verify</button></form>`;
  $("#codeForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (new FormData(ev.target).get("code") !== code) {
      ev.target.insertAdjacentHTML("afterend", `<p class="fail-text">That code doesn't match.</p>`);
      return;
    }
    store.setClaim(parcel.address || address, { name, masked, at: Date.now() });
    owner();
  });
}

function decide(alertId, approve) {
  const alert = store.alerts().find((a) => a.id === alertId);
  if (!alert) return;
  store.updateAlert(alertId, { status: approve ? "approved" : "blocked" });
  const listing = store.listings().find((l) => l.id === alert.listingId);
  if (listing) {
    if (approve) store.saveListing({ ...listing, ownerApproved: true });
    else store.saveListing({ ...listing, removed: true });
  }
  resultCache.clear();
  owner();
}

// ---------- check any address (live county data) ----------

async function check() {
  app.innerHTML = `
    <h1>Check a rental you found anywhere</h1>
    <p class="muted">Paste the details from a Zillow, Craigslist or Facebook listing. We check them against live Travis County property records and HUD area rents.</p>
    <form class="form" id="checkForm">
      <label>Address<input name="address" required placeholder="1105 W Monroe St, Austin TX 78704"></label>
      <div class="row">
        <label>Lister's name<input name="listerName" required placeholder="Name shown on the listing"></label>
        <label>Monthly rent<input name="rent" type="number" min="100" required></label>
        <label>Bedrooms<input name="beds" type="number" min="0" max="8" required value="2"></label>
      </div>
      <label>Listing text or messages (optional)<textarea name="description" rows="3"></textarea></label>
      <button class="btn primary">Check it</button>
    </form>
    <div id="checkResult"></div>`;
  $("#checkForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const address = f.get("address").trim();
    const zip = (address.match(/\b(\d{5})\b(?!.*\d{5})/) || [])[1] || "";
    const listing = {
      id: `check-${Date.now()}`, address, zip, listerName: f.get("listerName").trim(),
      rent: Number(f.get("rent")), beds: Number(f.get("beds")), description: f.get("description") || "",
      messages: [], photos: [],
    };
    $("#checkResult").innerHTML = `<div class="panel"><div class="spinner"></div><p>Looking up county records…</p></div>`;
    const r = await evaluate(listing);
    if (!listing.zip && r.parcel?.zip) {
      listing.zip = r.parcel.zip;
      Object.assign(r, runChecks({ listing, parcel: r.parcel, lock: lockFor(address), photoMatches: [], lookupFailed: !!r.lookupError }));
    }
    r.checks = r.checks.filter((c) => c.id !== "photos");
    $("#checkResult").innerHTML = panelHtml(r, listing) +
      `<p class="muted small">The photo check needs Zillow's archive of past listing photos, so it only runs on listings inside the app.</p>`;
  });
}

// ---------- about ----------

function about() {
  app.innerHTML = $("#aboutTemplate").innerHTML;
}

// ---------- boot ----------

$("#resetDemo").addEventListener("click", (e) => {
  e.preventDefault();
  if (!confirm("Clear claims, locks, alerts and posted listings?")) return;
  store.reset();
  resultCache.clear();
  go("#/browse");
  render();
});

render();
