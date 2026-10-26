// Demo persistence. In production these would be Zillow's servers; here they
// live in the browser so the whole flow works offline and on a static host.

const memory = {};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return memory[key] ?? fallback;
  }
}

function write(key, value) {
  memory[key] = value;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // private mode or storage blocked: the in-memory copy still works for this visit
  }
}

export const store = {
  locks: () => read("hl.locks", {}),
  setLock(address, lock) {
    const all = store.locks();
    if (lock) all[address] = lock;
    else delete all[address];
    write("hl.locks", all);
  },
  alerts: () => read("hl.alerts", []),
  addAlert(alert) {
    write("hl.alerts", [alert, ...store.alerts()]);
  },
  updateAlert(id, patch) {
    write("hl.alerts", store.alerts().map((a) => (a.id === id ? { ...a, ...patch } : a)));
  },
  listings: () => read("hl.listings", []),
  saveListing(listing) {
    write("hl.listings", [listing, ...store.listings().filter((l) => l.id !== listing.id)]);
  },
  claims: () => read("hl.claims", {}),
  setClaim(address, claim) {
    write("hl.claims", { ...store.claims(), [address]: claim });
  },
  // Fingerprints of listings removed for fraud, used to catch relists.
  blocklist: () => read("hl.blocklist", []),
  addFingerprint(fp) {
    write("hl.blocklist", [fp, ...store.blocklist().filter((x) => x.id !== fp.id)]);
  },
  // Letters mailed to owners of record who haven't joined Home Lock.
  notices: () => read("hl.notices", []),
  addNotice(notice) {
    write("hl.notices", [notice, ...store.notices()]);
  },
  updateNotice(id, patch) {
    write("hl.notices", store.notices().map((n) => (n.id === id ? { ...n, ...patch } : n)));
  },
  reset() {
    for (const k of ["hl.locks", "hl.alerts", "hl.listings", "hl.claims", "hl.blocklist", "hl.notices"]) {
      delete memory[k];
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    }
  },
};
