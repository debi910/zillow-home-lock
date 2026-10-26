// Small UI kit: icons, toasts, number and ring animations, comparison slider.
// Motion follows Emil Kowalski's design-engineering rules: custom ease-out
// curves, transform/opacity only, under 300ms for UI, interruptible
// transitions, and reduced motion respected.

export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const money = (n) => `$${Number(n).toLocaleString()}`;
export const shortMoney = (n) => (n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : `$${n}`);

const P = (d, extra = "") => `<path d="${d}" ${extra}/>`;
const svg = (body, size = 20, vb = 24) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icon = {
  search: (s) => svg(`<circle cx="11" cy="11" r="7"/>${P("m20 20-3.5-3.5")}`, s),
  heart: (s) => svg(P("M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"), s),
  share: (s) => svg(`${P("M12 3v12")}${P("m7 8 5-5 5 5")}${P("M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6")}`, s),
  hide: (s) => svg(`${P("M3 3l18 18")}${P("M10.6 6.1A9.5 9.5 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.6 3.2M6.6 6.6C4.4 8.1 3 12 3 12s4 6 9 6a8.7 8.7 0 0 0 4.3-1.1")}`, s),
  back: (s) => svg(P("m15 18-6-6 6-6"), s),
  close: (s) => svg(`${P("M18 6 6 18")}${P("m6 6 12 12")}`, s),
  chevron: (s) => svg(P("m6 9 6 6 6-6"), s),
  left: (s) => svg(P("m15 18-6-6 6-6"), s),
  right: (s) => svg(P("m9 18 6-6-6-6"), s),
  check: (s) => svg(P("M20 6 9 17l-5-5"), s),
  x: (s) => svg(`${P("M18 6 6 18")}${P("m6 6 12 12")}`, s),
  alert: (s) => svg(`${P("M12 9v4")}${P("M12 17h.01")}${P("M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z")}`, s),
  info: (s) => svg(`<circle cx="12" cy="12" r="9"/>${P("M12 16v-4")}${P("M12 8h.01")}`, s),
  lock: (s) => svg(`<rect x="4" y="11" width="16" height="10" rx="2"/>${P("M8 11V7a4 4 0 0 1 8 0v4")}`, s),
  shield: (s) => svg(`${P("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z")}${P("m9 12 2 2 4-4")}`, s),
  home: (s) => svg(`${P("M3 10.5 12 3l9 7.5")}${P("M5 9.5V21h14V9.5")}`, s),
  bed: (s) => svg(`${P("M3 18V7")}${P("M3 14h18v4")}${P("M21 14v-3a3 3 0 0 0-3-3h-7v6")}<circle cx="7" cy="11" r="2"/>`, s),
  bath: (s) => svg(`${P("M4 12h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3Z")}${P("M6 12V5a2 2 0 0 1 3.5-1.3")}`, s),
  ruler: (s) => svg(`<rect x="3" y="8" width="18" height="8" rx="1"/>${P("M7 8v3M11 8v4M15 8v3M19 8v4")}`, s),
  mail: (s) => svg(`<rect x="3" y="5" width="18" height="14" rx="2"/>${P("m3 7 9 6 9-6")}`, s),
  user: (s) => svg(`<circle cx="12" cy="8" r="4"/>${P("M4 21a8 8 0 0 1 16 0")}`, s),
  building: (s) => svg(`<rect x="4" y="3" width="16" height="18" rx="1"/>${P("M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1")}`, s),
  camera: (s) => svg(`${P("M4 8h3l2-3h6l2 3h3v11H4Z")}<circle cx="12" cy="13" r="3.5"/>`, s),
  tag: (s) => svg(`${P("M3 12V3h9l9 9-9 9Z")}<circle cx="7.5" cy="7.5" r="1.5"/>`, s),
  chat: (s) => svg(P("M21 12a8 8 0 0 1-11.8 7L3 21l2-6A8 8 0 1 1 21 12Z"), s),
  calendar: (s) => svg(`<rect x="3" y="5" width="18" height="16" rx="2"/>${P("M16 3v4M8 3v4M3 10h18")}`, s),
  bell: (s) => svg(`${P("M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9")}${P("M10 21a2 2 0 0 0 4 0")}`, s),
  map: (s) => svg(`${P("m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2Z")}${P("M9 4v14M15 6v14")}`, s),
  list: (s) => svg(P("M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"), s),
  upload: (s) => svg(`${P("M12 15V3")}${P("m7 8 5-5 5 5")}${P("M5 21h14")}`, s),
  sparkle: (s) => svg(P("M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"), s),
};

export const STATUS_ICON = { pass: icon.check(14), warn: icon.alert(14), fail: icon.x(14), info: icon.info(14) };

// ---------- toasts (Sonner-style: bottom-right stack, `ease`, swipe-free) ----------

let toaster;
export function toast(title, { description = "", tone = "default", duration = 4500 } = {}) {
  if (!toaster) {
    toaster = document.createElement("ol");
    toaster.className = "toaster";
    toaster.setAttribute("aria-live", "polite");
    document.body.append(toaster);
  }
  const li = document.createElement("li");
  li.className = `toast ${tone}`;
  const glyph = { success: icon.check(16), danger: icon.alert(16), lock: icon.lock(16), default: icon.info(16) }[tone] || icon.info(16);
  li.innerHTML = `<span class="toast-icon">${glyph}</span><div><div class="toast-title">${esc(title)}</div>${description ? `<div class="toast-desc">${esc(description)}</div>` : ""}</div>`;
  toaster.prepend(li);
  // Keep the stack short: the oldest toasts leave first.
  [...toaster.querySelectorAll(".toast:not(.leaving)")].slice(3).forEach((old) => old.click());
  let remaining = duration;
  let started = Date.now();
  let timer = setTimeout(close, remaining);
  // Pause while the tab is hidden, so a toast isn't missed.
  const onVis = () => {
    if (document.hidden) { clearTimeout(timer); remaining -= Date.now() - started; }
    else { started = Date.now(); timer = setTimeout(close, Math.max(800, remaining)); }
  };
  document.addEventListener("visibilitychange", onVis);
  function close() {
    document.removeEventListener("visibilitychange", onVis);
    li.classList.add("leaving");
    li.addEventListener("transitionend", () => li.remove(), { once: true });
    setTimeout(() => li.remove(), 400);
  }
  li.addEventListener("click", close);
}

// ---------- animated numbers and rings ----------

export function countUp(el, to, { duration = 900, format = (n) => String(Math.round(n)) } = {}) {
  if (reducedMotion()) { el.textContent = format(to); return; }
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = format(to * ease(t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function ringSvg(size = 112, stroke = 10) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="ring-track"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="ring-value" stroke-dasharray="${c}" stroke-dashoffset="${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

export function fillRing(root, fraction) {
  const ring = root.querySelector(".ring-value");
  if (!ring) return;
  const c = Number(ring.getAttribute("stroke-dasharray"));
  const target = c * (1 - Math.max(0, Math.min(1, fraction)));
  if (reducedMotion()) { ring.style.strokeDashoffset = target; return; }
  ring.animate([{ strokeDashoffset: c }, { strokeDashoffset: target }], { duration: 900, easing: EASE_OUT, fill: "forwards" });
}

// ---------- before/after comparison slider (clip-path, pointer capture) ----------

export function compareSlider(el) {
  const top = el.querySelector(".cmp-top");
  const handle = el.querySelector(".cmp-handle");
  let dragging = false;
  const set = (clientX) => {
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    top.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    handle.style.transform = `translateX(${(pct / 100) * rect.width}px)`;
    el.setAttribute("aria-valuenow", Math.round(pct));
  };
  el.addEventListener("pointerdown", (e) => {
    if (dragging) return; // ignore extra touch points
    dragging = true;
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    set(e.clientX);
  });
  el.addEventListener("pointermove", (e) => dragging && set(e.clientX));
  const end = () => { dragging = false; el.classList.remove("dragging"); };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("keydown", (e) => {
    const now = Number(el.getAttribute("aria-valuenow") || 50);
    const rect = el.getBoundingClientRect();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const pct = Math.max(0, Math.min(100, now + (e.key === "ArrowLeft" ? -5 : 5)));
      set(rect.left + (pct / 100) * rect.width);
    }
  });
  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    set(rect.left + rect.width / 2);
  });
}
