// Records each scene of the demo video as a 1920x1080 frame sequence using
// the Chrome DevTools screencast, timed to that scene's narration length.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire(import.meta.url)("playwright");

const DIR = "/home/claude/video";
const BASE = "http://localhost:8090/";
const CARDS = "file://" + DIR + "/cards/";
const LEAD = 0.6, TAIL = 0.7;
const dur = JSON.parse(fs.readFileSync(`${DIR}/durations.json`));
dur.outro = Math.max(dur.outro, 5.6);
const only = process.argv[2] ? process.argv[2].split(",") : null;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
await ctx.addInitScript(() => {
  const install = () => {
    if (document.getElementById("__cur")) return;
    const st = document.createElement("style");
    st.textContent = `
      #__cur { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 26px; height: 26px; transform: translate(-100px,-100px); filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
      .__rip { position: fixed; z-index: 2147483646; pointer-events: none; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; background: rgba(0,106,255,.28); animation: __rip 520ms cubic-bezier(.23,1,.32,1) forwards; }
      @keyframes __rip { from { transform: scale(.2); opacity: 1 } to { transform: scale(1.4); opacity: 0 } }
      #__chap { position: fixed; left: 28px; bottom: 28px; z-index: 2147483645; pointer-events: none; display: flex; align-items: center; gap: 10px; padding: 10px 18px 10px 14px; border-radius: 999px; background: rgba(17,20,28,.88); color: #fff; font: 700 15px/1 "Open Sans", system-ui; letter-spacing: 1.6px; box-shadow: 0 10px 30px -8px rgba(0,0,0,.4); opacity: 0; transform: translateY(10px); transition: opacity 350ms cubic-bezier(.23,1,.32,1), transform 350ms cubic-bezier(.23,1,.32,1); }
      #__chap.on { opacity: 1; transform: none; }
      #__chap i { width: 10px; height: 10px; border-radius: 50%; background: var(--c, #3d8bff); }`;
    document.head.append(st);
    const c = document.createElement("div");
    c.id = "__cur";
    c.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5v17.2l4.7-4.4 3 6.6 3-1.4-3-6.4h6.4Z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
    document.body.append(c);
    const chap = document.createElement("div");
    chap.id = "__chap";
    document.body.append(chap);
    const xy = window.__xy || [-100, -100];
    c.style.transform = `translate(${xy[0] - 4}px,${xy[1] - 2}px)`;
    document.addEventListener("mousemove", (e) => { window.__xy = [e.clientX, e.clientY]; c.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`; }, true);
    document.addEventListener("mousedown", (e) => { const r = document.createElement("div"); r.className = "__rip"; r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px"; document.body.append(r); setTimeout(() => r.remove(), 600); }, true);
  };
  window.__chapter = (text, color) => {
    const el = document.getElementById("__chap");
    if (!el) return;
    if (!text) { el.classList.remove("on"); return; }
    el.innerHTML = `<i style="--c:${color || "#3d8bff"}"></i>${text}`;
    requestAnimationFrame(() => el.classList.add("on"));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
});
const pg = await ctx.newPage();
pg.on("pageerror", (e) => console.log("PAGEERR", e.message));
const cdp = await ctx.newCDPSession(pg);

// ---------- helpers ----------
let mouse = [640, 360];
const wait = (ms) => pg.waitForTimeout(ms);
async function moveTo(sel, { dx = 0.5, dy = 0.5, ms = 650 } = {}) {
  const el = typeof sel === "string" ? pg.locator(`${sel} >> visible=true`).first() : sel;
  let b = await el.boundingBox({ timeout: 8000 });
  if (b.y < 0 || b.y + b.height * dy > 715) {
    console.log("  jump-scroll to", sel);
    await el.scrollIntoViewIfNeeded();
    b = await el.boundingBox();
  }
  const to = [b.x + b.width * dx, b.y + b.height * dy];
  await moveXY(to, ms);
}
async function moveXY(to, ms = 650) {
  const steps = Math.max(8, Math.round(ms / 16));
  const from = mouse;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = 1 - Math.pow(1 - t, 3);
    await pg.mouse.move(from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e);
    await wait(ms / steps * 0.6);
  }
  mouse = to;
}
async function click(sel, opts) { await moveTo(sel, opts); await wait(120); await pg.mouse.down(); await wait(70); await pg.mouse.up(); }
async function scrollEl(sel, top, ms = 900) {
  await pg.evaluate(([sel, top, ms]) => new Promise((res) => {
    const el = sel === "window" ? document.scrollingElement : document.querySelector(sel);
    const from = el.scrollTop, start = performance.now();
    const step = (now) => { const t = Math.min(1, (now - start) / ms); const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; el.scrollTop = from + (top - from) * e; t < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  }), [sel, top, ms]);
}
// Scroll a container so the target sits `offset` px below the container's top.
async function scrollTo(container, target, offset = 120, ms = 900) {
  const top = await pg.evaluate(([c, t, off]) => {
    const el = c === "window" ? document.scrollingElement : document.querySelector(c);
    const tg = document.querySelector(t);
    const cTop = c === "window" ? 0 : el.getBoundingClientRect().top;
    return el.scrollTop + tg.getBoundingClientRect().top - cTop - off;
  }, [container, target, offset]);
  await scrollEl(container, Math.max(0, top), ms);
}
const chapter = (t, c) => pg.evaluate(([t, c]) => window.__chapter && window.__chapter(t, c), [t, c]);
async function type(sel, text, delay = 45) { await pg.fill(sel, ""); await pg.focus(sel); await pg.keyboard.type(text, { delay }); }

async function record(name, fn) {
  if (only && !only.includes(name)) return;
  const target = (dur[name] + LEAD + TAIL) * 1000;
  const out = `${DIR}/frames/${name}`;
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const frames = [];
  const onFrame = async (f) => {
    frames.push({ t: f.metadata.timestamp, data: f.data });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  };
  cdp.on("Page.screencastFrame", onFrame);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  await fn();
  const left = target - (Date.now() / 1000 - t0) * 1000;
  if (left > 0) await wait(left); else console.log(`  ${name} ran ${(-left / 1000).toFixed(2)}s long`);
  const t1 = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  cdp.off("Page.screencastFrame", onFrame);
  // Write frames and a concat list with real durations.
  let list = "ffconcat version 1.0\n";
  frames.forEach((f, i) => {
    const file = `${String(i).padStart(5, "0")}.jpg`;
    fs.writeFileSync(path.join(out, file), Buffer.from(f.data, "base64"));
    const start = i === 0 ? t0 : f.t;
    const end = i + 1 < frames.length ? frames[i + 1].t : t1;
    list += `file ${file}\nduration ${Math.max(0.001, end - start).toFixed(4)}\n`;
  });
  list += `file ${String(frames.length - 1).padStart(5, "0")}.jpg\n`;
  fs.writeFileSync(path.join(out, "list.txt"), list);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", `${out}/list.txt`,
    "-vf", "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "16",
    "-t", (target / 1000).toFixed(3), `${DIR}/clips/${name}.mp4`]);
  console.log(`${name}: ${frames.length} frames, ${(t1 - t0).toFixed(2)}s (target ${(target / 1000).toFixed(2)}s)`);
}
fs.mkdirSync(`${DIR}/clips`, { recursive: true });

// ---------- scenes ----------
const ms = (s) => s * 1000;
let sceneStart = 0;
const at = async (s) => { const left = sceneStart + ms(s + LEAD) - Date.now(); if (left > 0) await wait(left); };
const scene = (name, fn) => record(name, async () => { sceneStart = Date.now(); await fn(); });

async function card(name) {
  await pg.goto(CARDS + name + ".html");
  await pg.evaluate(() => document.fonts.ready);
}

// intro / news: animated title cards
if (!only || only.includes("intro")) { await pg.goto(CARDS + "intro.html"); await pg.evaluate(() => document.fonts.ready); }
await scene("intro", async () => { await pg.reload(); await pg.evaluate(() => document.fonts.ready); });
if (!only || only.includes("news")) { await card("news"); }
await scene("news", async () => { await pg.reload(); await pg.evaluate(() => document.fonts.ready); });

// fresh demo state, today's Zillow mode
await pg.goto(BASE + "#/rent");
await pg.evaluate(() => { localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem("hl.before", "1"); });
await pg.goto(BASE + "#/rent"); await pg.reload();
await pg.waitForSelector(".card"); await wait(1500);
await pg.mouse.move(...mouse);

await scene("before", async () => {
  await chapter("ZILLOW TODAY", "#e59b16");
  await at(0.6); await moveTo(".card[data-id=oak] .card-badge", { ms: 900 });
  await at(2.6); await moveTo(".card[data-id=elm] .card-badge", { ms: 700 });
  await at(4.0); await scrollTo(".list-pane", ".card[data-id=maple]", 140, 900);
  await click(".card[data-id=maple] .card-link", { dy: 0.3, ms: 700 });
  await pg.waitForSelector(".modal"); await wait(400);
  await at(6.0); await scrollEl(".modal", 420, 1400);
  await at(8.6); await pg.keyboard.press("Escape");
});

await scene("search", async () => {
  await chapter("WITH HOME LOCK", "#0a7a46");
  await scrollEl(".list-pane", 0, 700);
  await click(".today-toggle .switch", { ms: 600 });
  await at(3.0); await moveTo(".card[data-id=oak]", { dy: 0.35, ms: 700 });
  await at(4.4); await moveTo(".pin.ok", { ms: 900 });
  await at(6.6); await moveTo(".card[data-id=elm] .card-badge", { ms: 800 });
  await at(8.6); await scrollTo(".list-pane", ".card[data-id=maple]", 140, 1100);
  await moveTo(".card[data-id=maple] .card-badge", { ms: 700 });
});

await scene("scam", async () => {
  await chapter("RENTER VIEW", "#3d8bff");
  await at(0.1); await click(".card[data-id=maple] .card-link", { dy: 0.3, ms: 500 });
  await pg.waitForSelector(".lock-card .checks", { timeout: 20000 });
  await moveTo(".d-price", { ms: 700 });
  await at(3.9); await scrollTo(".modal", ".lock-card", 90, 1100);
  await moveTo(".score-num", { ms: 600 });
  await at(7.3); await scrollTo(".modal", ".id-compare", 260, 900);
  await moveTo(".id-compare", { dx: 0.18, ms: 600 }); await wait(700); await moveTo(".id-compare", { dx: 0.82, ms: 700 });
  await at(12.3); await scrollTo(".modal", ".mail-flow", 300, 900);
  await moveTo(".mail-flow", { dx: 0.1, ms: 600 }); await wait(400); await moveTo(".mail-flow", { dx: 0.7, ms: 1000 });
});

await scene("photos", async () => {
  await at(0.0); await scrollTo(".modal", ".cmp", 160, 1100);
  await moveTo(".cmp", { dx: 0.5, ms: 600 });
  await at(5.6);
  const b = await (await pg.$(".cmp")).boundingBox();
  await pg.mouse.down();
  await moveXY([b.x + b.width * 0.88, b.y + b.height * 0.5], 1300);
  await moveXY([b.x + b.width * 0.12, b.y + b.height * 0.5], 1800);
  await moveXY([b.x + b.width * 0.5, b.y + b.height * 0.5], 900);
  await pg.mouse.up();
  await at(10.0); await scrollTo(".modal", ".price-gauge", 260, 1000);
  await moveTo(".price-gauge", { dx: 0.2, ms: 600 });
  await at(13.4); await scrollTo(".modal", ".desc", 220, 1000);
  await moveTo(".desc mark", { ms: 600 });
});

await scene("legit", async () => {
  await at(0.0); await pg.keyboard.press("Escape"); await wait(350);
  await scrollEl(".list-pane", 0, 600);
  await click(".card[data-id=oak] .card-link", { dy: 0.3, ms: 600 });
  await pg.waitForSelector(".lock-card .checks", { timeout: 20000 });
  await at(2.6); await scrollTo(".modal", ".lock-card", 90, 1000);
  await moveTo(".id-compare", { dx: 0.5, ms: 700 });
  await at(5.6); await moveTo(".score-num", { ms: 700 });
});

await pg.keyboard.press("Escape"); await wait(300);
await pg.goto(BASE + "#/rental-manager"); await pg.waitForSelector("#postForm"); await wait(700);
await pg.mouse.move(...mouse);

await scene("scammer", async () => {
  await chapter("SCAMMER VIEW", "#d1263b");
  await at(0.2); await moveTo("#postForm [name=listerName]", { ms: 700 });
  await at(1.8); await scrollTo("window", ".photo-choices", 200, 1000);
  await moveTo(".photo-choice", { dy: 0.4, ms: 600 });
  await at(4.2); await click("#postForm button[type=submit]", { ms: 600 });
  await pg.waitForSelector(".result", { timeout: 20000 });
  await scrollTo("window", ".result", 160, 800);
  await moveTo(".result h2", { ms: 600 });
});

await scene("letter", async () => {
  await chapter("OWNER, BY MAIL", "#5a2ca0");
  await at(0.0); await click(".result a", { ms: 500 });
  await pg.waitForSelector(".paper"); await wait(500);
  await at(2.2); await scrollTo("window", ".paper-to", 120, 1400);
  await moveTo(".paper-to", { dx: 0.15, ms: 700 });
  await at(5.4); await moveTo(".paper-code b", { ms: 700 });
});

const letterCode = await pg.evaluate(() => JSON.parse(localStorage.getItem("hl.notices"))?.[0]?.code || "");
await pg.goto(BASE + "#/home-lock"); await pg.waitForSelector("#letterForm"); await wait(600);
await scrollTo("window", ".claim", 40, 10);
await pg.mouse.move(...mouse);

await scene("owner", async () => {
  await chapter("OWNER VIEW", "#5a2ca0");
  await at(0.0); await click("#letterForm [name=code]", { ms: 600 }); await pg.keyboard.type(letterCode, { delay: 70 });
  await click("#letterForm [name=name]", { ms: 400 }); await pg.keyboard.type("Anjali Patel", { delay: 40 });
  await click("#letterForm button", { ms: 400 });
  await pg.waitForSelector(".home-card [data-deny]");
  await moveTo(".home-card .alert", { dx: 0.3, dy: 0.3, ms: 500 });
  await at(5.6); await click("[data-deny]", { ms: 600 });
  await pg.waitForSelector(".alert.blocked"); await wait(300);
  await at(7.4); await click(".switch.big", { ms: 500 });
});

await pg.goto(BASE + "#/rental-manager"); await pg.waitForSelector("#postForm"); await wait(700);
await pg.mouse.move(...mouse);

await scene("relist", async () => {
  await chapter("SAME SCAMMER, NEW NAME", "#d1263b");
  await at(0.2); await click("[data-preset=relist]", { ms: 700 });
  await moveTo("#postForm [name=listerName]", { ms: 600 });
  await at(2.6); await moveTo("#postForm [name=address]", { dx: 0.3, ms: 600 });
  await at(4.4); await scrollTo("window", ".form-foot", 360, 900);
  await click("#postForm button[type=submit]", { ms: 600 });
  await pg.waitForSelector(".result", { timeout: 20000 });
  await scrollTo("window", ".result", 160, 800);
  await moveTo(".result .ev-chip", { ms: 600 });
  await at(10.0); await moveTo(".result .ev-chip:nth-child(2)", { ms: 600 });
});

await pg.goto(BASE + "#/how-it-works"); await wait(900);
await pg.mouse.move(...mouse);

await scene("ship", async () => {
  await chapter("WHY ZILLOW CAN SHIP IT", "#3d8bff");
  await at(0.2); await scrollTo("window", ".flow", 120, 1400);
  await moveTo(".flow", { dx: 0.35, dy: 0.4, ms: 900 });
  await at(5.0); await scrollTo("window", ".feature-grid", 120, 1400);
  await moveTo(".feature-grid", { dx: 0.5, dy: 0.25, ms: 800 });
  await at(9.4); await scrollTo("window", ".ship", 200, 1400);
  await moveTo(".ship .btn", { ms: 800 });
});

if (!only || only.includes("outro")) await card("outro");
await scene("outro", async () => { await pg.reload(); await pg.evaluate(() => document.fonts.ready); });

await browser.close();
