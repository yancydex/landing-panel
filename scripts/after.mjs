#!/usr/bin/env node
// Render the panel's fix on the live page, without touching the site.
//   node scripts/after.mjs <run-dir>
// Loads the captured URL in a local browser, injects <run-dir>/patch.css and patch.js, and screenshots the first screen on
// desktop and mobile. Writes <run-dir>/after/: after_desktop_fold.png, after_mobile_fold.png and before_after.png
// (before on the left, after on the right). Nothing is deployed; the change exists only in this screenshot.
import { chromium, devices } from "playwright";
import fs from "node:fs";
import path from "node:path";

const runDir = process.argv[2];
if (!runDir) { console.error("usage: node scripts/after.mjs <run-dir>"); process.exit(2); }
const page0 = JSON.parse(fs.readFileSync(path.join(runDir, "capture", "page.json"), "utf8"));
const read = (f) => (fs.existsSync(path.join(runDir, f)) ? fs.readFileSync(path.join(runDir, f), "utf8") : "");
const css = read("patch.css"), js = read("patch.js");
if (!js && !css) { console.error("no patch.js or patch.css in the run dir"); process.exit(1); }
const out = path.join(runDir, "after");
fs.mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ args: ["--disable-gpu"] });
const errors = [];
try {
  for (const [name, device] of [["desktop", { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }], ["mobile", { ...devices["iPhone 13"], deviceScaleFactor: 2 }]]) {
    const ctx = await browser.newContext({ ...device, locale: "en-US" });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
    await p.goto(page0.url, { waitUntil: "domcontentloaded", timeout: 45000 });
    try { await p.waitForLoadState("networkidle", { timeout: 15000 }); } catch {}
    await sleep(1500);
    if (css) await p.addStyleTag({ content: css });
    if (js) {
      // Run the patch twice, a second apart: some sites re-render their hero after hydration.
      for (let i = 0; i < 2; i++) {
        try { await p.evaluate(js); } catch (e) { errors.push(`${name} patch: ${e.message}`); }
        await sleep(1000);
      }
    }
    await p.evaluate(() => scrollTo(0, 0));
    await sleep(500);
    await p.screenshot({ path: path.join(out, `after_${name}_fold.png`) });
    await ctx.close();
  }

  // before_after.png: both desktops side by side, both phones side by side underneath.
  const img = (f) => `data:image/png;base64,${fs.readFileSync(f).toString("base64")}`;
  const cap = path.join(runDir, "capture");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}body{background:#F4F3EF;font:700 22px/1 -apple-system,system-ui,sans-serif;padding:36px;width:2040px;color:#111}
.r{display:flex;gap:36px;margin-bottom:36px}.c{flex:1}.c p{margin-bottom:14px;letter-spacing:.06em}.c p.a{color:#1a7f37}
.c img{width:100%;border-radius:12px;border:1px solid #ddd;display:block}.m{justify-content:center}.m .c{flex:0 0 420px}</style></head><body>
<div class="r"><div class="c"><p>BEFORE</p><img src="${img(path.join(cap, "desktop_fold.png"))}"></div><div class="c"><p class="a">AFTER</p><img src="${img(path.join(out, "after_desktop_fold.png"))}"></div></div>
<div class="r m"><div class="c"><p>BEFORE</p><img src="${img(path.join(cap, "mobile_fold.png"))}"></div><div class="c"><p class="a">AFTER</p><img src="${img(path.join(out, "after_mobile_fold.png"))}"></div></div>
</body></html>`;
  const p = await browser.newPage({ viewport: { width: 2040, height: 1000 } });
  await p.setContent(html);
  await p.screenshot({ path: path.join(out, "before_after.png"), fullPage: true });
} finally { await browser.close(); }
if (errors.length) fs.writeFileSync(path.join(out, "errors.txt"), errors.join("\n"));
console.log(`after renders in ${out}${errors.length ? ` (${errors.length} page errors, see errors.txt)` : ""}`);
