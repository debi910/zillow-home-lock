import { runChecks, nameMatchScore, maskName, addressKey, scanText, holdReason, fingerprint, extractContacts } from "./checks.js";
import { lookupParcel } from "./county.js";
import { DEMO_LISTINGS, DEMO_PARCELS, PHOTO_ARCHIVE } from "./fixtures.js";
import { fmrFor } from "./fmr.js";
import { indexArchive, loadImage, thumbnail, bestMatch, MATCH_THRESHOLD } from "./phash.js";
import { store } from "./store.js";
import { createMap } from "./map.js";
import { esc, money, shortMoney, icon, STATUS_ICON, toast, countUp, ringSvg, fillRing, compareSlider } from "./ui.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $("#app");

const lockFor = (address) => {
  const locks = store.locks();
  const key = Object.keys(locks).find((a) => addressKey(a) === addressKey(address));
  return key ? locks[key] : null;
};

const VERDICT = {
  ok: { text: "Owner verified", cls: "ok", icon: () => icon.shield(14) },
  caution: { text: "Caution", cls: "caution", icon: () => icon.alert(14) },
  danger: { text: "Likely scam", cls: "danger", icon: () => icon.alert(14) },
  blocked: { text: "Held by Home Lock", cls: "blocked", icon: () => icon.lock(14) },
};

// ---------- evaluation ----------

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
    if (best && best.score >= MATCH_THRESHOLD) {
      matches.push({ src, match: best.src, score: best.score, from: archive.label, short: archive.short });
    }
  }
  return matches;
}

// How many of a listing's photos match each removed scam listing's photos.
const fpIndexCache = new Map();
async function relistPhotoHits(listing, blocklist) {
  const hits = {};
  for (const fp of blocklist) {
    if (fp.listingId === listing.id || !fp.photos.length) continue;
    if (!fpIndexCache.has(fp.id)) fpIndexCache.set(fp.id, indexArchive(fp.photos));
    const index = await fpIndexCache.get(fp.id);
    let n = 0;
    for (const src of listing.photos || []) {
      const best = bestMatch(thumbnail(await loadImage(src)), index);
      if (best && best.score >= MATCH_THRESHOLD) n++;
    }
    if (n) hits[fp.id] = n;
  }
  return hits;
}

const resultCache = new Map();
function evaluate(listing) {
  const blocklist = store.blocklist();
  const key = JSON.stringify([listing.id, listing.ownerApproved, listing.hold, !!lockFor(listing.address), blocklist.length]);
  if (!resultCache.has(key)) {
    resultCache.set(key, (async () => {
      let parcel = null;
      let mode = "none";
      let lookupError = null;
      try {
        ({ parcel, mode } = await lookupParcel(listing.address));
      } catch (err) {
        lookupError = err.message;
      }
      const matches = await photoMatches(listing).catch(() => []);
      const hits = await relistPhotoHits(listing, blocklist).catch(() => ({}));
      const result = runChecks({ listing, parcel, lock: lockFor(listing.address), photoMatches: matches, lookupFailed: !!lookupError, blocklist, relistPhotoHits: hits });
      return { ...result, parcel, mode, lookupError, matches, score: trustScore(result) };
    })());
  }
  return resultCache.get(key);
}

function trustScore({ checks, verdict }) {
  if (verdict.level === "blocked") return 0;
  let s = 100;
  for (const c of checks) s -= c.status === "fail" ? 24 : c.status === "warn" ? 10 : 0;
  return Math.max(4, Math.min(98, s));
}

function allListings() {
  const posted = store.listings();
  const ids = new Set(posted.map((l) => l.id));
  return [...posted, ...DEMO_LISTINGS.filter((l) => !ids.has(l.id))].filter((l) => !l.removed);
}

// ---------- router ----------

const routes = {
  "": search, rent: search, homedetails: search, listing: search,
  "rental-manager": post, "home-lock": owner, check, "how-it-works": about, letter,
};
let current = null;

async function render() {
  const [route, arg] = location.hash.replace(/^#\/?/, "").split("/");
  const view = routes[route] ?? search;
  const navKey = view === search ? "rent" : route;
  $$("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === navKey));
  if (view === search) {
    if (current !== "search") { current = "search"; await search(); }
    const id = (route === "homedetails" || route === "listing") && arg ? decodeURIComponent(arg) : null;
    if (id) openDetail(id);
    else closeDetail();
    return;
  }
  closeDetail(true);
  current = route;
  window.scrollTo(0, 0);
  app.classList.remove("page-in");
  void app.offsetWidth;
  app.classList.add("page-in");
  await view(arg ? decodeURIComponent(arg) : undefined);
}
window.addEventListener("hashchange", render);

// ---------- search results (map + list) ----------

const filters = { maxRent: null, minBeds: 0, verifiedOnly: false };
let mapApi = null;

async function search() {
  document.body.dataset.view = "search";
  app.innerHTML = `
    <div class="search-bar">
      <label class="search-input">
        <input value="Austin, TX" aria-label="Search location">
        ${icon.search(18)}
      </label>
      <div class="filter-row">
        <button class="filter-btn selected" data-pop="type">For Rent ${icon.chevron(16)}</button>
        <button class="filter-btn" data-pop="price"><span data-label="price">Price</span> ${icon.chevron(16)}</button>
        <button class="filter-btn" data-pop="beds"><span data-label="beds">Beds &amp; Baths</span> ${icon.chevron(16)}</button>
        <button class="filter-btn" data-pop="home">Home Type ${icon.chevron(16)}</button>
        <button class="filter-btn lock-filter ${filters.verifiedOnly ? "selected" : ""}" data-toggle="verified">${icon.shield(16)} Owner verified only</button>
        <button class="btn btn-primary save-search" type="button">Save search</button>
      </div>
      <div class="popover" id="popover" role="dialog" hidden></div>
    </div>
    <div class="results">
      <div class="map-pane"><div id="map"></div></div>
      <section class="list-pane">
        <header class="list-head">
          <h1>Austin TX Rental Listings</h1>
          <div class="list-sub">
            <span id="count"></span>
            <span class="sort">Sort: <b>Home Lock verified first</b> ${icon.chevron(14)}</span>
          </div>
          <div class="today-toggle">
            <label class="switch small"><input type="checkbox" id="before"><span></span></label>
            <label for="before">Show today's Zillow (without Home Lock)</label>
          </div>
        </header>
        <ul class="cards" id="cards"></ul>
        <div class="list-foot">
          <p>Home Lock checks every rental against county property records, the home's earlier listing photos, HUD area rents and known scam patterns.</p>
          <a href="#/how-it-works">How Home Lock works →</a>
        </div>
      </section>
    </div>
    <button class="map-toggle btn btn-dark" id="mapToggle">${icon.map(16)} Map</button>
    <div id="detailRoot"></div>`;

  mapApi = createMap($("#map"), { onSelect: (id) => (location.hash = `#/homedetails/${encodeURIComponent(id)}`) });
  setTimeout(() => mapApi.invalidate && mapApi.invalidate(), 50);

  const before = $("#before");
  before.checked = sessionStorage.getItem("hl.before") === "1";
  document.body.classList.toggle("before-mode", before.checked);
  before.addEventListener("change", () => {
    sessionStorage.setItem("hl.before", before.checked ? "1" : "0");
    document.body.classList.toggle("before-mode", before.checked);
    toast(before.checked ? "Showing today's Zillow" : "Home Lock is on", {
      description: before.checked ? "Every listing gets the same generic scam warning." : "Each listing shows its evidence-backed verdict.",
      tone: before.checked ? "default" : "success",
    });
  });

  $("[data-toggle=verified]").addEventListener("click", (e) => {
    filters.verifiedOnly = !filters.verifiedOnly;
    e.currentTarget.classList.toggle("selected", filters.verifiedOnly);
    drawCards();
  });
  $(".save-search").addEventListener("click", () => toast("Search saved", { description: "We'll email you new owner-verified rentals in Austin.", tone: "success" }));
  $("#mapToggle").addEventListener("click", () => {
    document.body.classList.toggle("show-map");
    $("#mapToggle").innerHTML = document.body.classList.contains("show-map") ? `${icon.list(16)} List` : `${icon.map(16)} Map`;
    setTimeout(() => mapApi.invalidate && mapApi.invalidate(), 60);
  });
  setupPopovers();
  await drawCards(true);
}

function popoverHtml(kind) {
  if (kind === "price") {
    const opts = [null, 1500, 2000, 2500, 3000];
    return `<h3>Max monthly rent</h3><div class="seg">${opts.map((o) => `<button data-set="maxRent" data-val="${o ?? ""}" class="${filters.maxRent === o ? "on" : ""}">${o ? money(o) : "Any"}</button>`).join("")}</div>`;
  }
  if (kind === "beds") {
    return `<h3>Bedrooms</h3><div class="seg">${[0, 1, 2, 3, 4].map((b) => `<button data-set="minBeds" data-val="${b}" class="${filters.minBeds === b ? "on" : ""}">${b ? `${b}+` : "Any"}</button>`).join("")}</div>`;
  }
  if (kind === "home") return `<h3>Home type</h3><label class="check"><input type="checkbox" checked disabled> Houses</label><p class="muted small">Demo listings are all houses.</p>`;
  return `<h3>Listing type</h3><label class="check"><input type="radio" checked disabled> For rent</label>`;
}

function setupPopovers() {
  const pop = $("#popover");
  let openFor = null;
  const close = () => {
    if (!openFor) return;
    openFor.classList.remove("open");
    pop.dataset.state = "closed";
    openFor = null;
    setTimeout(() => { if (!openFor) pop.hidden = true; }, 160);
  };
  $$("[data-pop]").forEach((btn) => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (openFor === btn) return close();
    if (openFor) openFor.classList.remove("open");
    openFor = btn;
    btn.classList.add("open");
    pop.innerHTML = popoverHtml(btn.dataset.pop);
    const r = btn.getBoundingClientRect();
    const host = $(".search-bar").getBoundingClientRect();
    pop.style.left = `${Math.min(r.left - host.left, host.width - 300)}px`;
    pop.style.top = `${r.bottom - host.top + 8}px`;
    pop.style.transformOrigin = "top left";
    pop.hidden = false;
    pop.dataset.state = "closed";
    requestAnimationFrame(() => (pop.dataset.state = "open"));
  }));
  pop.addEventListener("click", (e) => {
    e.stopPropagation();
    const b = e.target.closest("[data-set]");
    if (!b) return;
    const v = b.dataset.val;
    filters[b.dataset.set] = b.dataset.set === "maxRent" ? (v ? Number(v) : null) : Number(v);
    $("[data-label=price]").textContent = filters.maxRent ? `Up to ${money(filters.maxRent)}` : "Price";
    $("[data-label=beds]").textContent = filters.minBeds ? `${filters.minBeds}+ bds` : "Beds & Baths";
    $$("[data-pop=price],[data-pop=beds]").forEach((x) => x.classList.toggle("selected", x.dataset.pop === "price" ? !!filters.maxRent : !!filters.minBeds));
    close();
    drawCards();
  });
  document.addEventListener("click", close);
  document.addEventListener("keydown", (e) => e.key === "Escape" && close());
}

async function drawCards(first = false) {
  const all = allListings();
  const results = await Promise.all(all.map((l) => evaluate(l).then((r) => [l, r])));
  const rank = { ok: 0, caution: 1, danger: 2, blocked: 3 };
  let rows = results
    .filter(([l]) => (!filters.maxRent || l.rent <= filters.maxRent) && l.beds >= filters.minBeds)
    .sort((a, b) => rank[a[1].verdict.level] - rank[b[1].verdict.level] || b[1].score - a[1].score);
  if (filters.verifiedOnly) rows = rows.filter(([, r]) => r.verdict.level === "ok");
  $("#count").textContent = `${rows.length} rental${rows.length === 1 ? "" : "s"} available`;
  $("#cards").innerHTML = rows.length
    ? rows.map(([l, r], i) => cardHtml(l, r, first ? i : -1)).join("")
    : `<li class="empty">${icon.search(28)}<p>No rentals match these filters.</p></li>`;
  mapApi.setListings(rows.map(([l, r]) => ({
    id: l.id, lat: l.lat ?? 30.27, lng: l.lng ?? -97.74, price: shortMoney(l.rent), level: r.verdict.level,
    lock: r.verdict.level === "blocked", label: `${money(l.rent)} at ${l.address}`,
  })));
  $$(".card").forEach((card) => {
    const id = card.dataset.id;
    card.addEventListener("mouseenter", () => mapApi.highlight(id));
    card.addEventListener("mouseleave", () => mapApi.unhighlight(id));
    setupCarousel(card);
    card.querySelector(".heart").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const on = e.currentTarget.classList.toggle("on");
      toast(on ? "Saved to your homes" : "Removed from saved homes", { tone: on ? "success" : "default", duration: 2500 });
    });
  });
}

function cardHtml(l, r, stagger) {
  const v = VERDICT[r.verdict.level];
  return `
    <li class="card ${stagger >= 0 ? "stagger" : ""}" style="${stagger >= 0 ? `--i:${stagger}` : ""}" data-id="${esc(l.id)}">
      <a href="#/homedetails/${encodeURIComponent(l.id)}" class="card-link" aria-label="${esc(l.address)}">
        <div class="card-photo">
          <div class="slides" data-n="${l.photos.length}">
            ${l.photos.map((p, i) => `<img src="${esc(p)}" alt="" loading="${i ? "lazy" : "eager"}" draggable="false">`).join("")}
          </div>
          <span class="card-badge ${v.cls}">${v.icon()} ${v.text}</span>
          <span class="card-badge generic">${icon.alert(13)} Beware of rental scams</span>
          <button class="heart" aria-label="Save">${icon.heart(22)}</button>
          <button class="nav prev" aria-label="Previous photo">${icon.left(18)}</button>
          <button class="nav next" aria-label="Next photo">${icon.right(18)}</button>
          <div class="dots">${l.photos.map((_, i) => `<i class="${i ? "" : "on"}"></i>`).join("")}</div>
        </div>
        <div class="card-body">
          <div class="card-price">${money(l.rent)}<span>/mo</span></div>
          <div class="card-facts"><b>${l.beds}</b> bds <span class="sep"></span> <b>${l.baths}</b> ba <span class="sep"></span> <b>${Number(l.sqft).toLocaleString()}</b> sqft <span class="dash">-</span> ${esc(l.homeType || "House")} for rent</div>
          <address>${esc(l.address)}</address>
          <div class="card-meta">${esc(l.listerName)}${l.postedDaysAgo === 0 ? " · New today" : ` · ${l.postedDaysAgo} day${l.postedDaysAgo > 1 ? "s" : ""} on Zillow`}</div>
        </div>
      </a>
    </li>`;
}

function setupCarousel(root) {
  const slides = root.querySelector(".slides");
  if (!slides) return;
  const n = Number(slides.dataset.n);
  let i = 0;
  const go = (d) => {
    i = (i + d + n) % n;
    slides.style.transform = `translateX(${-i * 100}%)`;
    root.querySelectorAll(".dots i").forEach((dot, k) => dot.classList.toggle("on", k === i));
  };
  root.querySelector(".prev")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); go(-1); });
  root.querySelector(".next")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); go(1); });
}

// ---------- home details (modal over the results, like Zillow) ----------

let openId = null;

function closeDetail(immediate = false) {
  const root = $("#detailRoot");
  if (!root || !openId) return;
  openId = null;
  document.body.classList.remove("modal-open");
  const modal = root.querySelector(".modal-wrap");
  if (!modal) return;
  if (immediate) { root.innerHTML = ""; return; }
  modal.dataset.state = "closing";
  setTimeout(() => { if (!openId) root.innerHTML = ""; }, 200);
}

async function openDetail(id) {
  const l = allListings().find((x) => x.id === id);
  const root = $("#detailRoot");
  if (!l || !root) { location.hash = "#/rent"; return; }
  if (openId === id) return;
  openId = id;
  document.body.classList.add("modal-open");
  const beforeMode = sessionStorage.getItem("hl.before") === "1";
  const extra = Math.max(0, l.photos.length - 5);
  root.innerHTML = `
    <div class="modal-wrap" data-state="opening">
      <div class="backdrop" data-close></div>
      <article class="modal" role="dialog" aria-modal="true" aria-label="${esc(l.address)}">
        <header class="modal-bar">
          <button class="icon-btn" data-close aria-label="Back to search">${icon.back(20)} <span>Back to search</span></button>
          <div class="modal-brand">${brandMark(22)} <b>Home Lock</b></div>
          <div class="modal-actions">
            <button class="icon-btn" data-act="save">${icon.heart(18)} <span>Save</span></button>
            <button class="icon-btn" data-act="share">${icon.share(18)} <span>Share</span></button>
            <button class="icon-btn" data-act="hide">${icon.hide(18)} <span>Hide</span></button>
          </div>
        </header>
        <div class="photo-grid">
          ${l.photos.slice(0, 5).map((p, i) => `<img src="${esc(p)}" alt="Photo ${i + 1} of ${esc(l.address)}" class="pg-${i}">`).join("")}
          <button class="see-all btn btn-light">${icon.camera(16)} See all ${l.photos.length} photos${extra ? ` (+${extra})` : ""}</button>
        </div>
        <div class="detail-cols">
          <div class="detail-main">
            <div class="price-row">
              <div class="d-price">${money(l.rent)}<span>/mo</span></div>
              <div class="stats">
                <div><b>${l.beds}</b><span>beds</span></div>
                <div><b>${l.baths}</b><span>baths</span></div>
                <div><b>${Number(l.sqft).toLocaleString()}</b><span>sqft</span></div>
              </div>
            </div>
            <h1 class="d-address">${esc(l.address)}</h1>
            <div class="chips">
              <span class="chip">${icon.home(16)} ${esc(l.homeType || "House")}</span>
              ${l.facts ? Object.entries(l.facts).slice(0, 4).map(([k, v]) => `<span class="chip">${k === "Year built" ? icon.calendar(16) : k === "Pets" ? icon.heart(16) : k === "Parking" ? icon.tag(16) : icon.check(16)} ${esc(k === "Available" ? `Available ${v}` : k === "Year built" ? `Built in ${v}` : v)}</span>`).join("") : ""}
            </div>
            <section id="lockSection" class="lock-section">
              ${beforeMode ? beforeBlock() : skeletonBlock()}
            </section>
            <section>
              <h2>What's special</h2>
              <p class="desc" id="desc">${esc(l.description)}</p>
              ${(l.messages || []).length ? `<h3 class="sub">Messages from the lister</h3>${l.messages.map((m) => `<div class="bubble msg">${esc(m)}</div>`).join("")}` : ""}
            </section>
            ${l.facts ? `<section><h2>Facts &amp; features</h2><dl class="facts">${Object.entries(l.facts).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></section>` : ""}
          </div>
          <aside class="detail-side">
            <div class="contact-card" id="contactCard">
              <div class="contact-head">${icon.user(18)} <div><b>${esc(l.listerName)}</b><div class="muted small">Listed ${l.postedDaysAgo === 0 ? "today" : `${l.postedDaysAgo} day${l.postedDaysAgo === 1 ? "" : "s"} ago`}</div></div></div>
              <button class="btn btn-primary block" data-act="tour">Request a tour</button>
              <button class="btn btn-outline block" data-act="contact">Contact lister</button>
              <div class="contact-note">${beforeMode ? `<div class="generic-warning">${icon.alert(16)} <span><b>Beware of rental scams.</b> Never wire money or pay before seeing a home.</span></div>` : `<div class="mini-verdict pending"><span class="spinner"></span> Running Home Lock checks…</div>`}</div>
            </div>
          </aside>
        </div>
      </article>
    </div>`;
  requestAnimationFrame(() => root.querySelector(".modal-wrap").dataset.state = "open");
  root.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", () => (location.hash = "#/rent")));
  root.querySelector(".modal").addEventListener("click", onModalAction(l));
  document.addEventListener("keydown", escClose);
  if (beforeMode) return;

  const r = await evaluate(l);
  if (openId !== id) return;
  $("#lockSection").innerHTML = lockBlock(r, l);
  $("#contactCard .contact-note").innerHTML = miniVerdict(r);
  if (r.verdict.level === "danger" || r.verdict.level === "blocked") {
    $$("#contactCard [data-act=tour], #contactCard [data-act=contact]").forEach((b) => b.classList.add("muted-btn"));
  }
  highlightPhrases($("#desc"), l.description);
  $$(".msg").forEach((m, i) => highlightPhrases(m, l.messages[i]));
  const ringHost = $("#lockSection .score");
  if (ringHost) {
    fillRing(ringHost, r.score / 100);
    countUp(ringHost.querySelector(".score-num"), r.score);
  }
  $$("#lockSection .cmp").forEach(compareSlider);
}

function escClose(e) {
  if (e.key === "Escape" && openId) {
    document.removeEventListener("keydown", escClose);
    location.hash = "#/rent";
  }
}

function onModalAction(l) {
  return (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "save") { b.classList.toggle("on"); toast(b.classList.contains("on") ? "Saved to your homes" : "Removed from saved homes", { duration: 2500 }); }
    if (act === "share") { navigator.clipboard?.writeText(location.href).catch(() => {}); toast("Link copied", { duration: 2500 }); }
    if (act === "hide") toast("We'll hide this home from your search", { duration: 2500 });
    if (act === "tour" || act === "contact") {
      if (b.classList.contains("muted-btn")) toast("Home Lock paused contact", { description: "This listing failed its checks. Don't send money or personal details.", tone: "danger" });
      else toast(act === "tour" ? "Tour requested" : "Message sent", { description: `${l.listerName} will reply through Zillow.`, tone: "success" });
    }
    if (act === "report") {
      // In production trust and safety confirms the report first. The demo confirms it right away.
      store.addFingerprint(fingerprint(l, "Reported by a renter and removed"));
      store.saveListing({ ...l, removed: true });
      resultCache.clear();
      toast("Reported and removed", { description: "Home Lock saved its fingerprint, so a relist under a new name gets caught.", tone: "success" });
      current = null;
      location.hash = "#/rent";
    }
  };
}

function brandMark(size = 28) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3 3 13.5V29h26V13.5Z" fill="#006AFF"/><rect x="11" y="16" width="10" height="8" rx="1.6" fill="#fff"/><path d="M13 16v-2.4a3 3 0 0 1 6 0V16" stroke="#fff" stroke-width="2" fill="none"/></svg>`;
}

function beforeBlock() {
  return `<div class="today-box">${icon.alert(18)}<div><b>Beware of rental scams.</b> Never wire money or pay before seeing a home. <span class="muted">This same warning appears on every listing today.</span></div></div>`;
}

function skeletonBlock() {
  return `<div class="lock-card skeleton"><div class="sk sk-ring"></div><div class="sk-lines"><div class="sk"></div><div class="sk"></div><div class="sk short"></div></div></div>`;
}

function miniVerdict(r) {
  const v = VERDICT[r.verdict.level];
  return `<div class="mini-verdict ${v.cls}">${v.icon()} <div><b>${esc(r.verdict.title)}</b><div>${esc(r.verdict.advice)}</div></div></div>
    ${r.verdict.level === "danger" || r.verdict.level === "blocked" ? `<button class="btn btn-danger-ghost block" data-act="report">Report this listing</button>` : ""}`;
}

function lockBlock(r, l) {
  const v = VERDICT[r.verdict.level];
  const modeNote = {
    live: "Owner data pulled live from Travis County records.",
    proxy: "Owner data pulled live from Travis County records.",
    demo: "Demo home: synthetic owner record in the county's format.",
    none: r.lookupError ? `County lookup failed: ${r.lookupError}` : "",
  }[r.mode];
  return `
    <div class="lock-card ${v.cls}">
      <div class="lock-top">
        <div class="score ${v.cls}">
          ${ringSvg(104, 9)}
          <div class="score-inner"><span class="score-num">0</span><span class="score-of">/100</span></div>
        </div>
        <div class="lock-headline">
          <div class="eyebrow">${icon.shield(14)} Home Lock check</div>
          <h2>${esc(r.verdict.title)}</h2>
          <p>${esc(r.verdict.advice)}</p>
        </div>
      </div>
      <ul class="checks">
        ${r.checks.map((c, i) => `
          <li class="check ${c.status}" style="--i:${i}">
            <span class="status">${STATUS_ICON[c.status]}</span>
            <div class="check-body">
              <div class="check-title">${esc(c.label)}</div>
              <div class="check-detail">${esc(c.detail)}</div>
              ${evidenceFor(c, r, l)}
              ${c.source ? `<a class="src" href="${esc(c.source.url)}" target="_blank" rel="noopener">${esc(c.source.name)} ↗</a>` : ""}
            </div>
          </li>`).join("")}
      </ul>
      <p class="mode-note">${esc(modeNote)}</p>
    </div>`;
}

const contactText = (c) => {
  const [kind, v] = c.split(":");
  if (kind === "phone") return `(${v.slice(0, 3)}) ${v.slice(3, 6)}-${v.slice(6)}`;
  return kind === "cashtag" ? `$${v}` : v;
};

function evidenceFor(c, r, l) {
  if (c.id === "relist" && c.status === "fail") {
    const fp = store.blocklist().find((x) => x.id === c.fingerprint);
    const sig = c.signals;
    return `<div class="relist-ev">
      ${sig.contacts.map((x) => `<span class="ev-chip">${x.startsWith("phone") ? icon.chat(14) : icon.mail(14)} Same ${esc(x.split(":")[0] === "cashtag" ? "Cash App" : x.split(":")[0])} <b>${esc(contactText(x))}</b></span>`).join("")}
      ${sig.photos ? `<span class="ev-chip">${icon.camera(14)} <b>${sig.photos}</b> same photo${sig.photos > 1 ? "s" : ""}</span>` : ""}
      ${sig.similarity >= 0.35 ? `<span class="ev-chip">${icon.list(14)} <b>${Math.round(sig.similarity * 100)}%</b> same wording</span>` : ""}
      ${fp ? `<div class="ev-was">${icon.x(13)} Removed listing: "${esc(fp.listerName)}", ${esc(fp.reason.toLowerCase())}</div>` : ""}
    </div>`;
  }
  if (c.id === "owner" && r.parcel && c.status !== "info") {
    const ok = c.status === "pass";
    return `<div class="id-compare">
      <div class="id-card">${icon.user(16)}<div><span>Listed by</span><b>${esc(l.listerName)}</b></div></div>
      <div class="id-vs ${ok ? "ok" : "bad"}">${ok ? icon.check(16) : "≠"}</div>
      <div class="id-card">${icon.building(16)}<div><span>Owner of record</span><b>${esc(maskName(r.parcel.ownerName))}</b></div></div>
    </div>`;
  }
  if (c.id === "occupancy" && (c.status === "fail" || c.status === "warn")) {
    return `<div class="mail-flow"><span>${icon.mail(16)} County tax mail</span><i class="flow-line"></i><span>${icon.home(16)} This house</span></div>`;
  }
  if (c.id === "photos" && r.matches.length) {
    const m = r.matches[0];
    return `<div class="cmp" tabindex="0" role="slider" aria-label="Compare this listing's photo with the earlier listing" aria-valuemin="0" aria-valuemax="100">
        <img src="${esc(m.match)}" alt="" class="cmp-bottom" draggable="false">
        <img src="${esc(m.src)}" alt="" class="cmp-top" draggable="false">
        <span class="cmp-label left">This listing</span>
        <span class="cmp-label right">${esc(m.short || m.from)}</span>
        <span class="cmp-handle"><span>${icon.left(14)}${icon.right(14)}</span></span>
      </div>
      <div class="match-strip">${r.matches.map((x) => `<figure><img src="${esc(x.src)}" alt=""><figcaption>${Math.round(x.score * 100)}% match</figcaption></figure>`).join("")}</div>`;
  }
  if (c.id === "price") {
    const fmr = fmrFor(l.zip, l.beds);
    if (!fmr) return "";
    const max = Math.max(fmr.rent, l.rent) * 1.25;
    const pos = (n) => Math.min(100, (n / max) * 100).toFixed(1);
    return `<div class="price-gauge" style="--you:${pos(l.rent)}%;--fmr:${pos(fmr.rent)}%">
      <div class="gauge-track"><span class="gauge-fill ${c.status}"></span><span class="gauge-mark"></span></div>
      <div class="gauge-labels"><span class="you">This listing ${money(l.rent)}</span><span class="fmr">Area rent ${money(fmr.rent)}</span></div>
    </div>`;
  }
  return "";
}

function highlightPhrases(el, text) {
  if (!el || !text) return;
  const hits = scanText(text);
  let html = esc(text);
  for (const h of hits) {
    const re = new RegExp(esc(h.phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    html = html.replace(re, (m) => `<mark title="${esc(h.why)}">${m}</mark>`);
  }
  el.innerHTML = html;
}

// ---------- Rental Manager: post a rental ----------

const SCAM_TEXT = "Lovely home, available now. I'm out of the country so I can't show it, but send the deposit to hold it and I'll mail the keys.";
const PRESETS = {
  scam: { label: "Scammer", icon: () => icon.alert(14), photoSet: "copied",
    fields: { address: "905 Cedar Ridge Cv, Austin TX 78702", beds: 3, baths: 2.5, sqft: 1880, listerName: "Michael Brown", contact: "(512) 555-0147", rent: 1200, description: SCAM_TEXT } },
  relist: { label: "Same scammer, new name", icon: () => icon.user(14), photoSet: "copied",
    fields: { address: "8816 Willow Creek Dr, Austin TX 78749", beds: 4, baths: 2.5, sqft: 2240, listerName: "James Carter", contact: "512-555-0147", rent: 1450,
      description: "Lovely 4 bed home, available now. I'm out of the country for work so I can't show it, but send the deposit to hold it and I'll mail the keys to you." } },
  owner: { label: "Real owner", icon: () => icon.shield(14), photoSet: "own",
    fields: { address: "4710 Oak Shadow Ln, Austin TX 78751", beds: 3, baths: 2, sqft: 1520, listerName: "David Nguyen", contact: "(512) 555-0199", rent: 2450,
      description: "Updated 1960s ranch near the Triangle with a big shaded yard. Tours most evenings; apply on Zillow. Small dogs OK." } },
};

// Scammers copy photos from the home's old sale listing, or from its current real listing.
function copiedPhotos(address) {
  const key = addressKey(address || "");
  const sale = Object.entries(PHOTO_ARCHIVE).find(([a]) => addressKey(a) === key);
  if (sale) return sale[1].photos.map((p) => p.replace("-original-", "-copied-"));
  const demo = DEMO_LISTINGS.find((d) => addressKey(d.address) === key);
  return demo ? demo.photos : [1, 2, 3, 4].map((i) => `demo/photos/maple-copied-${i}.jpg`);
}

async function post() {
  document.body.dataset.view = "page";
  app.innerHTML = `
    <div class="page rm">
      <aside class="rm-steps">
        <div class="rm-title">${icon.building(18)} Rental Manager</div>
        <ol>
          <li class="done"><span>1</span> Property</li>
          <li class="done"><span>2</span> Details</li>
          <li class="done"><span>3</span> Photos</li>
          <li class="active"><span>4</span> Review &amp; publish</li>
        </ol>
        <p class="muted small">This is the lister's side. Try listing a home you don't own and see what Home Lock does.</p>
      </aside>
      <form class="rm-form card-surface" id="postForm">
        <div class="presets" role="group" aria-label="Demo presets">
          <span class="muted small">Try it as:</span>
          ${Object.entries(PRESETS).map(([k, p], i) => `<button type="button" class="preset ${i ? "" : "on"}" data-preset="${k}">${p.icon()} ${esc(p.label)}</button>`).join("")}
        </div>
        <h1>List a rental</h1>
        <fieldset>
          <legend>Property</legend>
          <label class="field">Address
            <input name="address" list="addrs" required placeholder="905 Cedar Ridge Cv, Austin TX 78702" autocomplete="off">
            <datalist id="addrs">${DEMO_PARCELS.map((p) => `<option value="${esc(p.address)}">`).join("")}</datalist>
          </label>
          <div class="grid-3">
            <label class="field">Bedrooms<input name="beds" type="number" min="0" max="8" required value="3"></label>
            <label class="field">Bathrooms<input name="baths" type="number" min="1" max="8" step="0.5" required value="2"></label>
            <label class="field">Square feet<input name="sqft" type="number" min="200" required value="1640"></label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Listing</legend>
          <div class="grid-3">
            <label class="field">Your name<input name="listerName" required placeholder="Michael Brown"></label>
            <label class="field">Contact phone<input name="contact" type="tel" placeholder="(512) 555-0147"></label>
            <label class="field">Monthly rent<span class="prefix-input"><i>$</i><input name="rent" type="number" min="100" required value="1200"></span></label>
          </div>
          <label class="field">Description<textarea name="description" rows="4" required>Lovely home, available now. I'm out of the country so I can't show it, but send the deposit to hold it and I'll mail the keys.</textarea></label>
        </fieldset>
        <fieldset>
          <legend>Photos</legend>
          <div class="photo-choices">
            <label class="photo-choice"><input type="radio" name="photoSet" value="copied" checked>
              <span class="pc-img" id="copiedPreview" style="background-image:url('demo/photos/cedar-copied-1.jpg')"></span>
              <span><b>Photos copied from another listing</b><small>What scammers do</small></span></label>
            <label class="photo-choice"><input type="radio" name="photoSet" value="own">
              <span class="pc-img" style="background-image:url('demo/photos/oak-original-1.jpg')"></span>
              <span><b>My own new photos</b><small>Taken this week</small></span></label>
            <label class="photo-choice"><input type="radio" name="photoSet" value="upload">
              <span class="pc-img upload">${icon.upload(22)}</span>
              <span><b>Upload photos</b><small data-upload-note>JPG or PNG, up to 6</small></span>
              <input class="sr-only" type="file" name="files" accept="image/*" multiple tabindex="-1"></label>
          </div>
        </fieldset>
        <div class="form-foot">
          <span class="muted small">${icon.shield(14)} Every new listing runs through Home Lock before renters see it.</span>
          <button class="btn btn-primary" type="submit">Publish listing</button>
        </div>
      </form>
      <div id="postResult" class="rm-result"></div>
    </div>`;
  const form = $("#postForm");
  form.addEventListener("submit", onPost);
  const applyPreset = (key) => {
    const p = PRESETS[key];
    for (const [name, value] of Object.entries(p.fields)) form.elements[name].value = value;
    form.querySelector(`input[name=photoSet][value=${p.photoSet}]`).checked = true;
    $$(".preset", form).forEach((b) => b.classList.toggle("on", b.dataset.preset === key));
    $("#copiedPreview").style.backgroundImage = `url('${copiedPhotos(p.fields.address)[0]}')`;
    $("#postResult").innerHTML = "";
  };
  $$(".preset", form).forEach((b) => b.addEventListener("click", () => applyPreset(b.dataset.preset)));
  form.elements.address.addEventListener("change", () => { $("#copiedPreview").style.backgroundImage = `url('${copiedPhotos(form.elements.address.value)[0]}')`; });
  applyPreset("scam");
  // The upload card is one target: picking it opens the file dialog.
  form.querySelector('input[value="upload"]').addEventListener("click", () => form.files.click());
  form.files.addEventListener("change", () => {
    const n = form.files.files.length;
    form.querySelector("[data-upload-note]").textContent = n ? `${n} photo${n === 1 ? "" : "s"} selected` : "JPG or PNG, up to 6";
  });
}

async function onPost(e) {
  e.preventDefault();
  const form = e.target;
  const f = new FormData(form);
  const address = f.get("address").trim();
  const zip = (address.match(/\b(\d{5})\b(?!.*\d{5})/) || [])[1] || "";
  const set = f.get("photoSet");
  let photos;
  if (set === "upload") {
    const files = [...form.files.files].slice(0, 6);
    if (!files.length) { toast("Pick at least one photo to upload", { tone: "danger" }); return; }
    photos = await Promise.all(files.map(fileToDataUrl));
  } else if (set === "copied") {
    photos = copiedPhotos(address);
  } else {
    photos = [1, 2, 3, 4].map((i) => `demo/photos/oak-original-${i}.jpg`);
  }
  const demo = DEMO_LISTINGS.find((d) => addressKey(d.address) === addressKey(address));
  const listing = {
    id: `posted-${Date.now()}`, address, zip, lat: demo?.lat, lng: demo?.lng,
    listerName: f.get("listerName").trim(), rent: Number(f.get("rent")), beds: Number(f.get("beds")),
    baths: Number(f.get("baths")), sqft: Number(f.get("sqft")), homeType: "House",
    description: f.get("description").trim(), contact: (f.get("contact") || "").trim(),
    messages: f.get("contact") ? [`Text me at ${f.get("contact").trim()}.`] : [], photos, postedDaysAgo: 0, ownerApproved: false,
  };

  const steps = [
    ["Matching the address to county property records", icon.building(16)],
    ["Comparing your name with the owner of record", icon.user(16)],
    ["Checking photos against earlier listings of this home", icon.camera(16)],
    ["Comparing rent with HUD area rents", icon.tag(16)],
    ["Comparing with listings removed for fraud", icon.list(16)],
    ["Checking the owner's Home Lock", icon.lock(16)],
  ];
  const out = $("#postResult");
  out.innerHTML = `<div class="card-surface run"><h2>Running Home Lock</h2><ul class="run-steps">${steps.map(([t, ic], i) => `<li style="--i:${i}"><span class="run-ic">${ic}</span>${t}<span class="run-state"><span class="spinner"></span></span></li>`).join("")}</ul></div>`;
  out.scrollIntoView({ behavior: "smooth", block: "start" });
  const [r] = await Promise.all([evaluate(listing), wait(350)]);
  for (const li of $$(".run-steps li", out)) {
    await wait(260);
    li.classList.add("done");
    li.querySelector(".run-state").innerHTML = icon.check(16);
  }
  await wait(250);
  const reason = holdReason(r.checks, lockFor(listing.address), listing);
  if (reason === "notice" || reason === "relist") listing.hold = reason;
  store.saveListing(listing);
  resultCache.clear();
  const v = VERDICT[r.verdict.level];
  if (reason === "lock") {
    store.addAlert({ id: `alert-${Date.now()}`, kind: "lock", listingId: listing.id, address: listing.address, listerName: listing.listerName, rent: listing.rent, at: Date.now(), status: "held" });
    out.innerHTML = heldCard(lockArt(true), "Held by Home Lock", "Your listing is on hold",
      `The owner of this home has locked it as <b>not for rent</b>. They need to approve your listing before any renter can see it, and we've notified them.`,
      `<a class="btn btn-outline" href="#/home-lock">See what the owner sees →</a>`);
    toast("Listing held for owner approval", { description: listing.address, tone: "lock" });
  } else if (reason === "notice") {
    const notice = {
      id: `notice-${Date.now()}`, code: String(100000 + Math.floor(Math.random() * 900000)), address: r.parcel?.address || listing.address,
      ownerMasked: maskName(r.parcel?.ownerName || ""), mailTo: r.parcel?.ownerMailingAddress || "", listingId: listing.id,
      listerName: listing.listerName, rent: listing.rent, at: Date.now(), status: "mailed",
    };
    store.addNotice(notice);
    store.addAlert({ id: `alert-${Date.now()}`, kind: "notice", listingId: listing.id, address: notice.address, listerName: listing.listerName, rent: listing.rent, at: Date.now(), status: "held" });
    out.innerHTML = heldCard(letterArt(), "Waiting for the owner", "Held while we check with the owner",
      `County records list a different owner, and their tax mail goes to this house, so they appear to live here. We mailed them a letter. Your listing goes live only if they confirm it.`,
      `<a class="btn btn-outline" href="#/letter/${encodeURIComponent(notice.id)}">See the letter we mailed →</a>`);
    toast("Owner of record notified by mail", { description: notice.address, tone: "lock" });
  } else if (reason === "relist") {
    const c = r.checks.find((x) => x.id === "relist");
    out.innerHTML = heldCard(`<div class="relist-art">${icon.x(40)}</div>`, "Linked to a removed scam", "Your listing is on hold",
      esc(c.detail), `<div class="relist-ev">${c.signals.contacts.map((x) => `<span class="ev-chip">${icon.chat(14)} Same phone <b>${esc(contactText(x))}</b></span>`).join("")}${c.signals.similarity >= 0.35 ? `<span class="ev-chip">${icon.list(14)} <b>${Math.round(c.signals.similarity * 100)}%</b> same wording</span>` : ""}${c.signals.photos ? `<span class="ev-chip">${icon.camera(14)} <b>${c.signals.photos}</b> same photos</span>` : ""}</div>`, "relist");
    toast("Relist caught", { description: "Matches a listing removed for fraud.", tone: "danger" });
  } else {
    out.innerHTML = `<div class="card-surface result ${v.cls}">
        <div class="result-badge ${v.cls}">${v.icon()} ${v.text}</div>
        <h2>Published with Home Lock score ${r.score}/100</h2>
        <p>${esc(r.verdict.advice)}</p>
        <a class="btn btn-primary" href="#/homedetails/${encodeURIComponent(listing.id)}">View as a renter →</a></div>`;
    toast("Listing published", { description: `Labeled "${v.text}"`, tone: r.verdict.level === "ok" ? "success" : "danger" });
  }
  out.scrollIntoView({ behavior: "smooth", block: "start" });
}

function heldCard(art, eyebrow, title, body, action, cls = "blocked") {
  return `<div class="card-surface result ${cls}">
      <div class="result-art">${art}</div>
      <div><div class="eyebrow">${icon.lock(14)} ${esc(eyebrow)}</div>
      <h2>${esc(title)}</h2>
      <p>${body}</p>
      ${action}</div></div>`;
}

function letterArt() {
  return `<svg class="letter-art" viewBox="0 0 220 170" aria-hidden="true">
    <rect x="30" y="40" width="160" height="104" rx="10" fill="#fff" stroke="#c9d6ee" stroke-width="2"/>
    <path d="M30 50 110 104 190 50" fill="none" stroke="#c9d6ee" stroke-width="2"/>
    <g class="letter-sheet"><rect x="52" y="14" width="116" height="80" rx="6" fill="#f2f7ff" stroke="#bcd3ff" stroke-width="2"/>
    <rect x="66" y="30" width="60" height="7" rx="3.5" fill="#006aff"/><rect x="66" y="46" width="86" height="6" rx="3" fill="#bcd3ff"/><rect x="66" y="58" width="72" height="6" rx="3" fill="#bcd3ff"/></g>
    <circle cx="168" cy="122" r="14" fill="#006aff"/><path d="m161 122 5 5 9-10" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
  </svg>`;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function fileToDataUrl(file) {
  const img = await loadImage(URL.createObjectURL(file));
  const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

// ---------- Home Lock for owners ----------

function lockArt(locked) {
  return `<svg class="lock-art ${locked ? "locked" : ""}" viewBox="0 0 220 170" aria-hidden="true">
    <defs><linearGradient id="la-roof" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2f6fff"/><stop offset="1" stop-color="#0041d9"/></linearGradient></defs>
    <ellipse cx="110" cy="158" rx="88" ry="8" fill="#000" opacity=".07"/>
    <path d="M30 78 110 18l80 60v76H30Z" fill="#eef4ff"/>
    <path d="M18 84 110 14l92 70" fill="none" stroke="url(#la-roof)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="52" y="96" width="30" height="28" rx="3" fill="#cfe0ff"/><rect x="138" y="96" width="30" height="28" rx="3" fill="#cfe0ff"/>
    <g class="lock-g">
      <path class="shackle" d="M95 98V86a15 15 0 0 1 30 0v12" fill="none" stroke="#1a1d24" stroke-width="7" stroke-linecap="round"/>
      <rect x="86" y="96" width="48" height="40" rx="8" fill="#1a1d24"/>
      <circle cx="110" cy="113" r="5" fill="#fff"/><rect x="108" y="114" width="4" height="10" rx="2" fill="#fff"/>
    </g>
  </svg>`;
}

async function owner() {
  document.body.dataset.view = "page";
  const claims = store.claims();
  const homes = Object.keys(claims);
  const anyLocked = homes.some((a) => lockFor(a));
  app.innerHTML = `
    <div class="page owner">
      <section class="owner-hero">
        <div>
          <div class="eyebrow">${icon.shield(14)} New for homeowners</div>
          <h1>Lock your home against rental scams</h1>
          <p>Scammers copy photos of homes they don't own and "rent" them to strangers. Claim your home once, switch on <b>Not for rent</b>, and any rental listing of your address is held until you approve it.</p>
          <ul class="hero-points">
            <li>${icon.building(16)} Verified against county owner records</li>
            <li>${icon.bell(16)} Instant alert if someone tries to list it</li>
            <li>${icon.check(16)} Approve your own property manager in one tap</li>
          </ul>
        </div>
        <div class="hero-art">${lockArt(anyLocked)}</div>
      </section>
      <div class="owner-grid">
        <section class="card-surface claim">
          <h2>Claim a home</h2>
          <div class="stepper"><span class="on">1 Find home</span><span>2 Verify owner</span><span>3 Mailed code</span></div>
          <form id="claimForm" class="claim-form">
            <label class="field">Home address<input name="address" list="addrs" required placeholder="905 Cedar Ridge Cv, Austin TX 78702" autocomplete="off">
              <datalist id="addrs">${DEMO_PARCELS.map((p) => `<option value="${esc(p.address)}">`).join("")}</datalist></label>
            <label class="field">Your full legal name<input name="name" required placeholder="Anjali Patel" autocomplete="name"></label>
            <button class="btn btn-primary block" type="submit">Find my home in county records</button>
          </form>
          <div id="claimStep" class="claim-step"></div>
          <div class="letter-claim">
            <div class="or"><span>Got a letter from Home Lock?</span></div>
            <form id="letterForm" class="claim-form">
              <div class="grid-2">
                <label class="field">Code from the letter<input name="code" inputmode="numeric" maxlength="7" required placeholder="000000" autocomplete="one-time-code"></label>
                <label class="field">Your full legal name<input name="name" required placeholder="Anjali Patel" autocomplete="name"></label>
              </div>
              <button class="btn btn-outline block" type="submit">${icon.mail(16)} Respond to the letter</button>
            </form>
          </div>
        </section>
        <section class="homes">
          ${homes.length ? homes.map((a) => ownerHomeHtml(a, claims[a])).join("") : `<div class="card-surface empty-home">${icon.home(28)}<p>Homes you claim show up here.</p></div>`}
        </section>
      </div>
    </div>`;
  $("#claimForm").addEventListener("submit", onClaim);
  $("#letterForm").addEventListener("submit", onLetterClaim);
  $$("[data-lock]").forEach((el) => el.addEventListener("change", () => {
    store.setLock(el.dataset.lock, el.checked ? { since: Date.now() } : null);
    resultCache.clear();
    const art = $(".hero-art .lock-art");
    art?.classList.toggle("locked", Object.keys(store.claims()).some((a) => lockFor(a)));
    const card = el.closest(".home-card");
    card.classList.toggle("is-locked", el.checked);
    card.querySelector(".lock-state").textContent = el.checked
      ? "Locked. Rental listings for this address are held until you approve them."
      : "Unlocked. Anyone can list this address for rent.";
    toast(el.checked ? "Home Lock is on" : "Home Lock is off", {
      description: el.checked ? "We'll hold any rental listing of this home for you." : "Rental listings of this home won't be held.",
      tone: el.checked ? "lock" : "default",
    });
  }));
  $$("[data-approve]").forEach((el) => el.addEventListener("click", () => decide(el.dataset.approve, true)));
  $$("[data-deny]").forEach((el) => el.addEventListener("click", () => decide(el.dataset.deny, false)));
}

function ownerHomeHtml(address, claim) {
  const lock = lockFor(address);
  const alerts = store.alerts().filter((a) => addressKey(a.address) === addressKey(address));
  const demo = DEMO_LISTINGS.find((d) => addressKey(d.address) === addressKey(address));
  const photo = demo ? demo.photos[0].replace("copied", "original") : "";
  return `
    <article class="card-surface home-card ${lock ? "is-locked" : ""}">
      <div class="home-top">
        ${photo ? `<div class="home-thumb" style="background-image:url('${esc(photo)}')"></div>` : `<div class="home-thumb blank">${icon.home(24)}</div>`}
        <div class="home-info">
          <b>${esc(address)}</b>
          <div class="muted small">${icon.check(13)} Verified owner: ${esc(claim.name)} (county record ${esc(claim.masked)})</div>
        </div>
        <label class="switch big" title="Not for rent"><input type="checkbox" data-lock="${esc(address)}" ${lock ? "checked" : ""}><span></span></label>
      </div>
      <div class="lock-row"><b>Not for rent</b><span class="lock-state">${lock ? "Locked. Rental listings for this address are held until you approve them." : "Unlocked. Anyone can list this address for rent."}</span></div>
      <h3 class="sub">${icon.bell(16)} Activity</h3>
      ${alerts.length ? `<ul class="alerts">${alerts.map((a) => `
        <li class="alert ${a.status}">
          <span class="alert-ic">${a.status === "held" ? icon.lock(16) : a.status === "approved" ? icon.check(16) : icon.x(16)}</span>
          <div class="alert-body"><b>${esc(a.listerName)}</b> tried to list your home for ${money(a.rent)}/mo${a.kind === "notice" ? `. We held it and mailed you a letter.` : ""}
            <div class="muted small">${new Date(a.at).toLocaleString()} · ${a.status === "held" ? "Held, waiting for you" : a.status === "approved" ? "You approved it" : "You blocked it and reported the lister"}</div>
            ${a.status === "held" ? `<div class="alert-actions"><button class="btn btn-outline sm" data-approve="${esc(a.id)}">It's my manager, approve</button><button class="btn btn-danger sm" data-deny="${esc(a.id)}">Not me, block and report</button></div>` : ""}
          </div>
        </li>`).join("")}</ul>` : `<p class="muted small quiet">No one has tried to list this home. We'll alert you the moment someone does.</p>`}
    </article>`;
}

async function onClaim(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const address = f.get("address").trim();
  const name = f.get("name").trim();
  const step = $("#claimStep");
  const stepper = $$(".stepper span");
  step.innerHTML = `<div class="claim-loading"><span class="spinner"></span> Searching Travis County records…</div>`;
  let parcel;
  let mode;
  try {
    ({ parcel, mode } = await lookupParcel(address));
  } catch (err) {
    step.innerHTML = `<div class="claim-msg bad">${icon.alert(16)} ${esc(err.message)}</div>`;
    return;
  }
  if (!parcel) {
    step.innerHTML = `<div class="claim-msg bad">${icon.alert(16)} We couldn't find that address in Travis County records. Check the house number and street.</div>`;
    return;
  }
  const masked = maskName(parcel.ownerName);
  stepper[1].classList.add("on");
  if (nameMatchScore(name, parcel.ownerName) < 0.99) {
    step.innerHTML = `<div class="claim-msg bad shake">${icon.x(16)} <div>County records list the owner as <b>${esc(masked)}</b>, which doesn't match "${esc(name)}". Only the owner of record can lock a home.</div></div>`;
    return;
  }
  stepper[2].classList.add("on");
  // A real rollout mails this code to the property address, the way Zillow
  // already verifies home claims. The demo shows it on screen.
  const code = String(1000 + Math.floor(Math.random() * 9000));
  step.innerHTML = `
    <div class="claim-msg good">${icon.check(16)} <div><b>${esc(masked)}</b> owns this home in county records${mode === "demo" ? " (demo record)" : ""}.</div></div>
    <p class="small">We mailed a 4-digit code to the property address. <span class="muted">Demo code: <b class="code">${code}</b></span></p>
    <form id="codeForm" class="code-form">
      ${[0, 1, 2, 3].map((i) => `<input class="otp" inputmode="numeric" maxlength="1" aria-label="Digit ${i + 1}" required>`).join("")}
      <button class="btn btn-primary">Verify</button>
    </form>`;
  const otps = $$(".otp", step);
  otps[0].focus();
  otps.forEach((inp, i) => {
    inp.addEventListener("input", () => { inp.value = inp.value.replace(/\D/g, ""); if (inp.value && otps[i + 1]) otps[i + 1].focus(); });
    inp.addEventListener("keydown", (ev) => { if (ev.key === "Backspace" && !inp.value && otps[i - 1]) otps[i - 1].focus(); });
    inp.addEventListener("paste", (ev) => {
      const t = (ev.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 4);
      if (t.length === 4) { ev.preventDefault(); otps.forEach((o, k) => (o.value = t[k])); }
    });
  });
  $("#codeForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const entered = otps.map((o) => o.value).join("");
    if (entered !== code) {
      ev.target.classList.remove("shake");
      void ev.target.offsetWidth;
      ev.target.classList.add("shake");
      toast("That code doesn't match", { tone: "danger", duration: 2500 });
      return;
    }
    store.setClaim(parcel.address || address, { name, masked, at: Date.now() });
    toast("Home claimed", { description: "Now switch on Not for rent.", tone: "success" });
    owner();
  });
}

// The letter goes to the owner's tax mailing address, so its code proves the
// same thing the claim flow's mailed code does.
async function onLetterClaim(e) {
  e.preventDefault();
  const form = e.target;
  const f = new FormData(form);
  const code = f.get("code").replace(/\D/g, "");
  const name = f.get("name").trim();
  const fail = (msg) => {
    form.classList.remove("shake");
    void form.offsetWidth;
    form.classList.add("shake");
    toast(msg, { tone: "danger", duration: 3000 });
  };
  const notice = store.notices().find((n) => n.code === code);
  if (!notice) return fail("That code doesn't match any letter");
  let parcel;
  try { ({ parcel } = await lookupParcel(notice.address)); } catch { parcel = null; }
  if (!parcel || nameMatchScore(name, parcel.ownerName) < 0.99) return fail("That name doesn't match the owner of record");
  store.setClaim(parcel.address, { name, masked: maskName(parcel.ownerName), at: Date.now(), via: "letter" });
  store.updateNotice(notice.id, { status: "answered" });
  toast("Home claimed with your letter", { description: "Review the held listing below.", tone: "success" });
  owner();
}

// ---------- the letter mailed to an owner of record ----------

async function letter(id) {
  document.body.dataset.view = "page";
  const n = store.notices().find((x) => x.id === id) || store.notices()[0];
  if (!n) { location.hash = "#/rental-manager"; return; }
  const date = new Date(n.at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  app.innerHTML = `
    <div class="page letter-page">
      <div class="letter-intro">
        <div class="eyebrow">${icon.mail(14)} Sent by mail to the owner of record</div>
        <h1>The owner hears about it even if they never signed up</h1>
        <p class="muted">Most owners will never have heard of Home Lock. When someone else lists a home its owner appears to live in, Home Lock holds the listing and mails the owner at the address on their tax record.</p>
      </div>
      <article class="paper">
        <header class="paper-head">${brandMark(26)} <b>Home Lock</b> <span class="muted">for Zillow Rentals</span><span class="paper-date">${esc(date)}</span></header>
        <div class="paper-to">
          <div>Owner of record (${esc(n.ownerMasked)})</div>
          <div>${esc(titleCase(n.mailTo))}</div>
          <div>Austin, TX</div>
        </div>
        <h2>Did you list your home for rent?</h2>
        <p>On ${esc(date)}, someone named <b>${esc(n.listerName)}</b> tried to list <b>${esc(n.address)}</b> for rent at <b>${money(n.rent)}/month</b>. County records show you as the owner, and that you live there.</p>
        <p>We've held the listing, so no renter can see it until you answer.</p>
        <div class="paper-code"><span>Your code</span><b>${esc(n.code.slice(0, 3))} ${esc(n.code.slice(3))}</b></div>
        <ol>
          <li>Go to Home Lock, then <b>For Owners</b>, then <b>Got a letter from Home Lock?</b></li>
          <li>Enter this code and your name as it appears on your tax record.</li>
          <li>Approve the listing if it's yours or your manager's. If not, we'll remove it and block the lister.</li>
        </ol>
        <p class="paper-fine">If we don't hear from you in 7 days, the lister can only publish after verifying their ID and uploading a lease or management agreement signed by you.</p>
      </article>
      <div class="letter-cta"><a class="btn btn-primary" href="#/home-lock">${icon.home(16)} Open Home Lock as the owner →</a></div>
    </div>`;
}

const titleCase = (s) => String(s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function decide(alertId, approve) {
  const alert = store.alerts().find((a) => a.id === alertId);
  if (!alert) return;
  store.updateAlert(alertId, { status: approve ? "approved" : "blocked" });
  const listing = store.listings().find((l) => l.id === alert.listingId);
  if (listing) store.saveListing(approve ? { ...listing, ownerApproved: true } : { ...listing, removed: true });
  if (listing && !approve) store.addFingerprint(fingerprint(listing, "Blocked by the owner of record"));
  resultCache.clear();
  toast(approve ? "Listing approved" : "Listing blocked and reported", {
    description: approve ? `${alert.listerName}'s listing is now live with an owner-approved label.` : `${alert.listerName} can't list your home again.`,
    tone: approve ? "success" : "lock",
  });
  owner();
}

// ---------- check any listing (live county data) ----------

async function check() {
  document.body.dataset.view = "page";
  app.innerHTML = `
    <div class="page check">
      <header class="page-head">
        <div class="eyebrow">${icon.search(14)} Live county records</div>
        <h1>Check a rental you found anywhere</h1>
        <p>Paste the details from a Zillow, Craigslist or Facebook listing. We check them against live Travis County property records and HUD area rents.</p>
      </header>
      <form class="card-surface check-form" id="checkForm">
        <label class="field">Address<input name="address" required placeholder="1105 W Monroe St, Austin TX 78704"></label>
        <div class="grid-3">
          <label class="field">Lister's name<input name="listerName" required placeholder="Name on the listing"></label>
          <label class="field">Monthly rent<span class="prefix-input"><i>$</i><input name="rent" type="number" min="100" required></span></label>
          <label class="field">Bedrooms<input name="beds" type="number" min="0" max="8" required value="2"></label>
        </div>
        <label class="field">Listing text or messages <span class="muted">(optional)</span><textarea name="description" rows="3" placeholder="Paste what the lister wrote"></textarea></label>
        <div class="form-foot"><span class="muted small">The photo check needs Zillow's archive of past listing photos, so it only runs on listings inside Zillow.</span><button class="btn btn-primary">Check it</button></div>
      </form>
      <div id="checkResult" class="lock-section"></div>
    </div>`;
  $("#checkForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const address = f.get("address").trim();
    const zip = (address.match(/\b(\d{5})\b(?!.*\d{5})/) || [])[1] || "";
    const listing = { id: `check-${Date.now()}`, address, zip, listerName: f.get("listerName").trim(), rent: Number(f.get("rent")),
      beds: Number(f.get("beds")), description: f.get("description") || "", messages: [], photos: [] };
    const out = $("#checkResult");
    out.innerHTML = skeletonBlock();
    const r = await evaluate(listing);
    if (!listing.zip && r.parcel?.zip) {
      listing.zip = r.parcel.zip;
      Object.assign(r, runChecks({ listing, parcel: r.parcel, lock: lockFor(address), photoMatches: [], lookupFailed: !!r.lookupError }));
      r.score = trustScore(r);
    }
    r.checks = r.checks.filter((c) => c.id !== "photos");
    out.innerHTML = lockBlock(r, listing);
    const host = $(".score", out);
    fillRing(host, r.score / 100);
    countUp(host.querySelector(".score-num"), r.score);
  });
}

// ---------- how it works ----------

function about() {
  document.body.dataset.view = "page";
  app.innerHTML = $("#aboutTemplate").innerHTML;
  $$("[data-icon]").forEach((el) => (el.innerHTML = icon[el.dataset.icon](22)));
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.dataset.visible = ""; io.unobserve(en.target); }
  }), { rootMargin: "0px 0px -80px 0px" });
  $$(".reveal").forEach((el) => io.observe(el));
}

// ---------- boot ----------

$("#resetDemo").addEventListener("click", (e) => {
  e.preventDefault();
  store.reset();
  resultCache.clear();
  fpIndexCache.clear();
  sessionStorage.removeItem("hl.before");
  toast("Demo reset", { description: "Claims, locks, alerts and posted listings were cleared." });
  current = null;
  if (location.hash === "#/rent") render();
  else location.hash = "#/rent";
});

render();
