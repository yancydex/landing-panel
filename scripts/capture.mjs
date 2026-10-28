#!/usr/bin/env node
// Capture a landing page the way seven different visitors will meet it.
//   node scripts/capture.mjs <url> <run-dir>
// Writes <run-dir>/capture/: desktop + mobile fold shots, full pages, readable tiles, a throttled "slow phone"
// filmstrip (what a mid-range phone on a weak connection shows at 1, 3, 6 and 10 seconds), page text and facts.
// One browser, one page at a time, closed at the end.
import { chromium, devices } from "playwright";
import fs from "node:fs";
import path from "node:path";

const [url, runDir] = process.argv.slice(2);
if (!url || !runDir) { console.error("usage: node scripts/capture.mjs <url> <run-dir>"); process.exit(2); }
const out = path.join(runDir, "capture");
fs.mkdirSync(out, { recursive: true });

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const MOBILE = { ...devices["iPhone 13"], deviceScaleFactor: 2 };
// A mid-range phone on a weak 4G/fast-3G connection (Lighthouse "slow 4G" numbers, 4x CPU slowdown).
const SLOW_NET = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const MAX_TILES = 8;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settle(page) {
  try { await page.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
  // Scroll the whole page once so lazy images and scroll animations load, then go back to the top.
  await page.evaluate(async () => {
    const step = Math.max(400, Math.floor(innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    scrollTo(0, 0);
  });
  await sleep(1200);
}

async function shots(page, prefix, vw, vh) {
  await page.screenshot({ path: path.join(out, `${prefix}_fold.png`) });
  const full = path.join(out, `${prefix}_full.jpg`);
  await page.screenshot({ path: full, fullPage: true, type: "jpeg", quality: 70 });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const tileH = vh * 2, tiles = [];
  for (let i = 0, y = 0; y < height && i < MAX_TILES; i++, y += tileH) {
    const f = `${prefix}_tile${i + 1}.jpg`;
    await page.screenshot({ path: path.join(out, f), fullPage: true, type: "jpeg", quality: 75, clip: { x: 0, y, width: vw, height: Math.min(tileH, height - y) } });
    tiles.push(f);
  }
  return { height, tiles, truncated: height > tileH * MAX_TILES };
}

// Everything a reader of the page needs, measured in the page itself.
function readPage() {
  const vh = innerHeight, vw = innerWidth;
  const vis = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05 && r.width > 2 && r.height > 2; };
  const sel = (el) => {
    if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== document.body; e = e.parentElement) {
      let p = e.tagName.toLowerCase();
      const sib = e.parentElement ? [...e.parentElement.children].filter((c) => c.tagName === e.tagName) : [];
      if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(e) + 1})`;
      parts.unshift(p);
      const s = "body > " + parts.join(" > ");
      if (document.querySelectorAll(s).length === 1 && parts.length > 2) return s;
    }
    return "body > " + parts.join(" > ");
  };
  const text = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; };

  const textEls = [...document.querySelectorAll("h1,h2,h3,h4,p,span,div,a,button,li")].filter((el) => vis(el) && el.getBoundingClientRect().top < vh && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1));
  const bySize = textEls.map((el) => ({ el, size: parseFloat(getComputedStyle(el).fontSize) })).sort((a, b) => b.size - a.size);
  const h1 = [...document.querySelectorAll("h1")].find(vis) || bySize[0]?.el;
  const heroBottom = h1 ? h1.getBoundingClientRect().bottom : 0;
  const sub = textEls.find((el) => el !== h1 && !h1?.contains(el) && el.getBoundingClientRect().top >= heroBottom - 4 && text(el).length > 30 && parseFloat(getComputedStyle(el).fontSize) >= 15);
  const clickable = [...document.querySelectorAll("a,button,[role=button]")].filter((el) => vis(el) && text(el).length > 1 && text(el).length < 60);
  const aboveFold = clickable.filter((el) => el.getBoundingClientRect().top < vh);
  const score = (el) => { const s = getComputedStyle(el); const bg = s.backgroundColor; const filled = bg && !/rgba?\(0, 0, 0, 0\)|transparent/.test(bg); const r = el.getBoundingClientRect(); return (filled ? 2 : 0) + (r.height >= 36 ? 1 : 0) + (r.top > heroBottom - 10 ? 1 : 0); };
  const inChrome = (el) => !!el.closest("nav,header,[role=navigation]");
  const pool = aboveFold.filter((el) => !inChrome(el)).length ? aboveFold.filter((el) => !inChrome(el)) : aboveFold;
  const cta = [...pool].sort((a, b) => score(b) - score(a))[0];

  const sections = [...document.querySelectorAll("main > section, main > div > section, body > section, section, [class*=section]")]
    .filter((el, i, a) => vis(el) && el.getBoundingClientRect().height > 200 && !a.some((o) => o !== el && o.contains(el)))
    .slice(0, 20).map((el) => ({ selector: sel(el), heading: text(el.querySelector("h1,h2,h3") || el).slice(0, 90), top: box(el).top, height: box(el).h }));

  const meta = (n) => document.querySelector(`meta[name="${n}"],meta[property="${n}"]`)?.content || null;
  const imgs = [...document.images];
  return {
    title: document.title, description: meta("description"), og_title: meta("og:title"), og_image: meta("og:image"), lang: document.documentElement.lang || null,
    viewport: { width: vw, height: vh }, page_height: document.documentElement.scrollHeight,
    hero: {
      headline: h1 ? { text: text(h1), selector: sel(h1), font_px: parseFloat(getComputedStyle(h1).fontSize), box: box(h1) } : null,
      subhead: sub ? { text: text(sub).slice(0, 400), selector: sel(sub), font_px: parseFloat(getComputedStyle(sub).fontSize), box: box(sub) } : null,
      primary_cta: cta ? { text: text(cta), selector: sel(cta), href: cta.href || null, box: box(cta) } : null,
    },
    above_fold_clickables: aboveFold.slice(0, 25).map((el) => ({ text: text(el), href: el.href || null })),
    headings: [...document.querySelectorAll("h1,h2,h3")].filter(vis).slice(0, 60).map((el) => ({ tag: el.tagName.toLowerCase(), text: text(el).slice(0, 140), top: box(el).top })),
    sections,
    ctas_total: clickable.filter((el) => /start|try|get|sign|join|book|buy|download|free|demo|contact|subscribe|apply/i.test(text(el))).length,
    links_total: document.querySelectorAll("a[href]").length,
    images: { count: imgs.length, missing_alt: imgs.filter((i) => !i.alt).length },
    forms: document.forms.length,
    fonts: [...new Set([...document.querySelectorAll("h1,h2,p,a,button")].slice(0, 80).map((el) => getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim()))].slice(0, 6),
    horizontal_overflow: document.documentElement.scrollWidth > vw + 1,
    small_tap_targets: clickable.filter((el) => { const r = el.getBoundingClientRect(); return r.height < 32 || r.width < 32; }).length,
    text: document.body.innerText.replace(/\n{3,}/g, "\n\n").slice(0, 20000),
  };
}

async function visit(browser, device, prefix) {
  const ctx = await browser.newContext({ ...device, locale: "en-US" });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  let bytes = 0, requests = 0;
  cdp.on("Network.loadingFinished", (e) => { requests++; bytes += e.encodedDataLength || 0; });
  const t0 = Date.now();
  const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await settle(page);
  const data = await page.evaluate(readPage);
  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    return { dom_content_loaded_ms: Math.round(nav?.domContentLoadedEventEnd || 0), load_ms: Math.round(nav?.loadEventEnd || 0) };
  });
  const s = await shots(page, prefix, device.viewport.width, device.viewport.height);
  await ctx.close();
  return { status: resp?.status() ?? null, final_url: page.url(), requests, transfer_kb: Math.round(bytes / 1024), ...perf, wall_ms: Date.now() - t0, ...s, page: data };
}

async function slowPhone(browser) {
  const ctx = await browser.newContext({ ...MOBILE, locale: "en-US" });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", SLOW_NET);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  let bytes = 0;
  cdp.on("Network.loadingFinished", (e) => { bytes += e.encodedDataLength || 0; });
  await page.addInitScript(() => {
    window.__lp = { fcp: null, lcp: null };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__lp.fcp = e.startTime; }).observe({ type: "paint", buffered: true });
    new PerformanceObserver((l) => { const e = l.getEntries().at(-1); if (e) window.__lp.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  const t0 = Date.now();
  const frames = [];
  const nav = page.goto(url, { waitUntil: "load", timeout: 60000 }).then(() => Date.now() - t0).catch(() => null);
  for (const t of [1, 3, 6, 10]) {
    const wait = t * 1000 - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
    const f = `slow_${t}s.png`;
    try { await page.screenshot({ path: path.join(out, f), timeout: 8000 }); frames.push({ at_s: t, file: f }); } catch { frames.push({ at_s: t, file: null, note: "page too busy to paint a frame" }); }
  }
  const loadMs = await Promise.race([nav, sleep(50000).then(() => null)]);
  const vitals = await page.evaluate(() => window.__lp).catch(() => ({}));
  await ctx.close();
  return {
    conditions: "iPhone 13 viewport, 4x CPU slowdown, 1.6 Mbps down / 750 kbps up, 150 ms latency, cold cache",
    first_contentful_paint_ms: vitals?.fcp ? Math.round(vitals.fcp) : null,
    largest_contentful_paint_ms: vitals?.lcp ? Math.round(vitals.lcp) : null,
    load_event_ms: loadMs, transferred_kb: Math.round(bytes / 1024), frames,
  };
}

const browser = await chromium.launch({ args: ["--disable-gpu"] });
const facts = { url, captured_at: new Date().toISOString(), tool: "landing-panel capture.mjs" };
try {
  facts.desktop = await visit(browser, DESKTOP, "desktop");
  facts.mobile = await visit(browser, MOBILE, "mobile");
  facts.slow_phone = await slowPhone(browser);
} catch (e) {
  facts.error = String(e?.message || e);
} finally {
  await browser.close();
}
// The text goes to its own file so a persona can read it without the JSON noise.
if (facts.desktop?.page?.text) { fs.writeFileSync(path.join(out, "page.txt"), facts.desktop.page.text); delete facts.desktop.page.text; }
if (facts.mobile?.page?.text) delete facts.mobile.page.text;
fs.writeFileSync(path.join(out, "page.json"), JSON.stringify(facts, null, 2));
const d = facts.desktop, m = facts.mobile, sp = facts.slow_phone;
console.log(facts.error ? `capture failed: ${facts.error}` : [
  `captured ${url} -> ${out}`,
  `desktop: ${d.page_height ?? d.height}px tall, ${d.tiles.length} tiles, ${d.transfer_kb} KB, hero: "${d.page.hero.headline?.text?.slice(0, 80) ?? "none found"}"`,
  `mobile: ${m.height}px tall, ${m.tiles.length} tiles, overflow=${m.page.horizontal_overflow}`,
  `slow phone: FCP ${sp.first_contentful_paint_ms} ms, LCP ${sp.largest_contentful_paint_ms} ms, load ${sp.load_event_ms ?? "not within 60 s"} ms, ${sp.transferred_kb} KB`,
].join("\n"));
process.exit(facts.error ? 1 : 0);
