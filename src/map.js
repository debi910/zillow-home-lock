// Results map: Leaflet (vendored) with CARTO Voyager tiles, price pills as
// markers, and a hand-drawn vector map of central Austin underneath that
// shows through when tiles can't load (offline demo, blocked network).

/* global L */

const BOUNDS = { south: 30.07, west: -98.02, north: 30.46, east: -97.54 };

// [lat, lng] polylines, simplified by hand.
const WATER = [
  [[30.352, -97.812], [30.333, -97.802], [30.318, -97.797], [30.302, -97.808], [30.29, -97.802], [30.278, -97.792], [30.271, -97.786], [30.2685, -97.772], [30.2645, -97.757], [30.2615, -97.748], [30.259, -97.738], [30.254, -97.728], [30.249, -97.718], [30.246, -97.706], [30.241, -97.692], [30.232, -97.676], [30.226, -97.66]],
];
const HIGHWAYS = [
  { name: "I-35", pts: [[30.17, -97.778], [30.215, -97.758], [30.245, -97.743], [30.267, -97.736], [30.285, -97.729], [30.305, -97.716], [30.33, -97.705], [30.36, -97.694]] },
  { name: "MoPac", pts: [[30.17, -97.842], [30.215, -97.812], [30.25, -97.785], [30.272, -97.774], [30.295, -97.769], [30.322, -97.761], [30.36, -97.748]] },
  { name: "US-290 / TX-71", pts: [[30.232, -97.9], [30.226, -97.84], [30.218, -97.8], [30.215, -97.758], [30.212, -97.72], [30.205, -97.66]] },
  { name: "US-183", pts: [[30.36, -97.79], [30.348, -97.745], [30.333, -97.706], [30.31, -97.684], [30.29, -97.66]] },
];
const ROADS = [
  [[30.2, -97.794], [30.236, -97.776], [30.255, -97.765], [30.268, -97.756], [30.3, -97.745], [30.335, -97.734]],
  [[30.2, -97.775], [30.235, -97.762], [30.256, -97.749], [30.275, -97.741], [30.3, -97.735]],
  [[30.255, -97.79], [30.262, -97.745], [30.262, -97.7], [30.258, -97.66]],
  [[30.283, -97.8], [30.287, -97.745], [30.29, -97.7], [30.295, -97.66]],
  [[30.31, -97.79], [30.312, -97.74], [30.318, -97.7], [30.322, -97.66]],
  [[30.2, -97.88], [30.21, -97.84], [30.245, -97.81], [30.268, -97.79]],
  [[30.235, -97.76], [30.24, -97.72], [30.238, -97.68]],
  [[30.18, -97.86], [30.2, -97.84], [30.23, -97.835], [30.26, -97.83]],
];
const PARKS = [
  [[30.2725, -97.781], [30.2715, -97.765], [30.263, -97.765], [30.2625, -97.778]],
  [[30.287, -97.756], [30.29, -97.752], [30.278, -97.749], [30.276, -97.753]],
  [[30.305, -97.71], [30.303, -97.698], [30.293, -97.698], [30.294, -97.71]],
  [[30.205, -97.875], [30.2, -97.84], [30.18, -97.84], [30.183, -97.88]],
];
const LABELS = [
  { t: "DOWNTOWN", at: [30.2695, -97.745], big: true },
  { t: "Lady Bird Lake", at: [30.2595, -97.758], water: true },
  { t: "Bouldin Creek", at: [30.2485, -97.7575] },
  { t: "Zilker", at: [30.2675, -97.7725] },
  { t: "Hyde Park", at: [30.3105, -97.729] },
  { t: "East Austin", at: [30.266, -97.722] },
  { t: "West Campus", at: [30.2885, -97.7505] },
  { t: "Clarksville", at: [30.2815, -97.765] },
  { t: "Circle C", at: [30.208, -97.865] },
  { t: "Mueller", at: [30.298, -97.704] },
];

function project([lat, lng], w, h) {
  return [((lng - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * w, ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * h];
}

// Stretch a line's end segments so roads run off the edge of the drawing.
function extend(pts, by = 0.14) {
  const out = (a, b) => {
    const dl = a[0] - b[0], dg = a[1] - b[1], n = Math.hypot(dl, dg) || 1;
    return [a[0] + (dl / n) * by, a[1] + (dg / n) * by];
  };
  return [out(pts[0], pts[1]), ...pts, out(pts[pts.length - 1], pts[pts.length - 2])];
}

export function austinSvg(w = 4800, h = 4600) {
  const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${project(p, w, h).map((n) => n.toFixed(1)).join(",")}`).join(" ");
  const smooth = (pts) => path(extend(pts));
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <rect width="${w}" height="${h}" fill="#f2efe9"/>
    <g fill="#e3ecd6">${PARKS.map((p) => `<path d="${path(p)} Z"/>`).join("")}</g>
    <g fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">${ROADS.map((r) => `<path d="${smooth(r)}"/>`).join("")}</g>
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">${WATER.map((r) => `<path d="${smooth(r)}" stroke="#aad3f2" stroke-width="26"/>`).join("")}</g>
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      ${HIGHWAYS.map((r) => `<path d="${smooth(r.pts)}" stroke="#f3c96b" stroke-width="16"/><path d="${smooth(r.pts)}" stroke="#fbe3a3" stroke-width="9"/>`).join("")}
    </g>
    <g font-family="Open Sans, system-ui, sans-serif" text-anchor="middle">
      ${LABELS.map((l) => {
        const [x, y] = project(l.at, w, h);
        return `<text x="${x}" y="${y}" font-size="${l.big ? 40 : 34}" font-weight="${l.big ? 700 : 600}" fill="${l.water ? "#5b8fb9" : "#7a7a80"}" ${l.water ? 'font-style="italic"' : ""} letter-spacing="${l.big ? 4 : 0}">${l.t}</text>`;
      }).join("")}
    </g>
  </svg>`;
}

export function createMap(el, { onSelect } = {}) {
  if (typeof L === "undefined") {
    el.innerHTML = `<div class="map-fallback">${austinSvg()}</div>`;
    return { setListings() {}, highlight() {}, fallback: true };
  }
  const map = L.map(el, { zoomControl: false, attributionControl: true, scrollWheelZoom: true })
    .setView([30.272, -97.765], 12);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  // Hand-drawn base underneath the tiles.
  const svgEl = new DOMParser().parseFromString(austinSvg(), "image/svg+xml").documentElement;
  L.svgOverlay(svgEl, [[BOUNDS.south, BOUNDS.west], [BOUNDS.north, BOUNDS.east]], { interactive: false }).addTo(map);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 19,
  }).addTo(map);

  let markers = new Map();
  return {
    map,
    setListings(items) {
      for (const m of markers.values()) m.remove();
      markers = new Map();
      for (const it of items) {
        const icon = L.divIcon({
          className: "pin-wrap",
          html: `<button class="pin ${it.level || "pending"}" data-pin="${it.id}" aria-label="${it.label}">${it.lock ? '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>' : ""}${it.price}</button>`,
          iconSize: null,
        });
        const m = L.marker([it.lat, it.lng], { icon, riseOnHover: true }).addTo(map);
        m.on("click", () => onSelect && onSelect(it.id));
        markers.set(it.id, m);
      }
    },
    highlight(id) {
      document.querySelectorAll(".pin.active").forEach((p) => p.classList.remove("active"));
      const m = markers.get(id);
      if (!m) return;
      m.setZIndexOffset(1000);
      const el = m.getElement()?.querySelector(".pin");
      if (el) el.classList.add("active");
    },
    unhighlight(id) {
      const m = markers.get(id);
      if (!m) return;
      m.setZIndexOffset(0);
      m.getElement()?.querySelector(".pin")?.classList.remove("active");
    },
    invalidate() {
      map.invalidateSize();
    },
  };
}
