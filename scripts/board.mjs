#!/usr/bin/env node
// Count the panel's votes and draw the verdict board.
//   node scripts/board.mjs <run-dir>
// Reads <run-dir>/verdicts/*.json (and rewrite.json + after/ when they exist). Writes board.json (the tally the fixer
// reads), board.md, board.html and board.png. Counting is done here, by script, so "4 of 7 left" is never a model's guess.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const runDir = process.argv[2];
if (!runDir) { console.error("usage: node scripts/board.mjs <run-dir>"); process.exit(2); }
const vDir = path.join(runDir, "verdicts");
const ORDER = ["scroller", "burned-buyer", "designer", "copywriter", "competitor", "ideal-customer", "slow-phone"];
const TAGS = new Set(["headline", "subhead", "cta", "proof", "trust", "pricing", "clarity", "differentiation", "visual", "mobile", "speed", "order", "length", "other"]);

const verdicts = [], problems = [];
for (const f of fs.existsSync(vDir) ? fs.readdirSync(vDir).filter((f) => f.endsWith(".json")) : []) {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(vDir, f), "utf8"));
    if (!["stay", "leave"].includes(v.decision)) problems.push(`${f}: decision must be stay or leave`);
    for (const x of v.fixes || []) if (!TAGS.has(x.tag)) { problems.push(`${f}: unknown fix tag "${x.tag}", counted as other`); x.tag = "other"; }
    verdicts.push(v);
  } catch (e) { problems.push(`${f}: not valid JSON (${e.message})`); }
}
const rank = (v) => (ORDER.includes(v.id) ? ORDER.indexOf(v.id) : ORDER.length);
verdicts.sort((a, b) => rank(a) - rank(b));
const missing = ORDER.filter((id) => !verdicts.some((v) => v.id === id));

const stayed = verdicts.filter((v) => v.decision === "stay"), left = verdicts.filter((v) => v.decision === "leave");
const stoppedAt = {};
for (const v of left) stoppedAt[v.stopped_at || "unknown"] = (stoppedAt[v.stopped_at || "unknown"] || 0) + 1;
const tagMap = {};
for (const v of verdicts) for (const t of new Set((v.fixes || []).map((x) => x.tag))) {
  (tagMap[t] ||= { tag: t, count: 0, backed_by: [], backed_by_leavers: 0 });
  tagMap[t].count++; tagMap[t].backed_by.push(v.id); if (v.decision === "leave") tagMap[t].backed_by_leavers++;
}
const fixTags = Object.values(tagMap).sort((a, b) => b.count - a.count || b.backed_by_leavers - a.backed_by_leavers);
const page = (() => { try { return JSON.parse(fs.readFileSync(path.join(runDir, "capture", "page.json"), "utf8")); } catch { return {}; } })();
const rewrite = (() => { try { return JSON.parse(fs.readFileSync(path.join(runDir, "rewrite.json"), "utf8")); } catch { return null; } })();
const hasAfter = fs.existsSync(path.join(runDir, "after", "before_after.png"));

const board = {
  url: page.url, panel_size: ORDER.length, verdicts_in: verdicts.length, missing, problems,
  stayed: stayed.length, left: left.length,
  headline_number: `${stayed.length} of ${verdicts.length} stayed`,
  left_before_scrolling: left.filter((v) => ["first screen", "hero"].includes(v.stopped_at)).length,
  stopped_at: stoppedAt,
  fix_tags: fixTags,
  votes: verdicts.map((v) => ({ id: v.id, persona: v.persona, decision: v.decision, stopped_at: v.stopped_at, seconds_spent: v.seconds_spent, quote: v.quote })),
};
fs.writeFileSync(path.join(runDir, "board.json"), JSON.stringify(board, null, 2));

// board.md: the whole run, readable in any editor.
const md = [
  `# Landing panel: ${page.url || runDir}`, "",
  `**${board.headline_number}.** ${board.left} left, ${board.left_before_scrolling} of them before scrolling past the hero.`, "",
  "| Visitor | Verdict | Stopped at | Seconds | In their words |", "|---|---|---|---|---|",
  ...verdicts.map((v) => `| ${v.persona} | ${v.decision === "stay" ? "STAYED" : "LEFT"} | ${v.stopped_at || ""} | ${v.seconds_spent ?? ""} | ${(v.quote || "").replace(/\|/g, "/")} |`),
  "", "## Why each one decided", "",
  ...verdicts.flatMap((v) => [`### ${v.persona}: ${v.decision === "stay" ? "stayed" : "left"}`, `_${v.first_impression || ""}_`, "", ...(v.why || []).map((w) => `- ${w}`), "", `Would have changed it: ${v.would_make_me_stay || ""}`, ""]),
  "## What most visitors want fixed (counted by tag)", "",
  ...fixTags.map((t) => `- **${t.tag}**: ${t.count} of ${verdicts.length} (${t.backed_by.join(", ")})`), "",
  ...(rewrite ? [
    "## The three fixes", "", ...(rewrite.top_fixes || []).map((f) => `${f.rank}. **${f.fix}** (${f.tag}; backed by ${(f.backed_by || []).join(", ")}). ${f.why || ""}`), "",
    "## The rewrite", "", "| | Before | After |", "|---|---|---|",
    `| Headline | ${rewrite.before?.headline ?? ""} | ${rewrite.hero?.headline ?? ""} |`,
    `| Subhead | ${rewrite.before?.subhead ?? ""} | ${rewrite.hero?.subhead ?? ""} |`,
    `| Button | ${rewrite.before?.cta ?? ""} | ${rewrite.hero?.cta ?? ""} |`, "",
    rewrite.hero?.note ? `Under the button: ${rewrite.hero.note}\n` : "",
    "### Section order", "", ...(rewrite.section_order || []).map((s, i) => `${i + 1}. ${s.section}: ${s.why}`), "",
    ...((rewrite.needs || []).length ? ["### Needs from the owner", "", ...rewrite.needs.map((n) => `- ${n}`), ""] : []),
    hasAfter ? "![before and after](after/before_after.png)\n" : "",
  ] : []),
  problems.length ? `\n> Problems: ${problems.join("; ")}` : "", missing.length ? `\n> Missing verdicts: ${missing.join(", ")}` : "",
].join("\n");
fs.writeFileSync(path.join(runDir, "board.md"), md);

// board.html -> board.png: the verdict board as one image.
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const host = (() => { try { return new URL(page.url).host.replace(/^www\./, ""); } catch { return ""; } })();
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{background:#F4F3EF;color:#111;font:16px/1.4 -apple-system,"SF Pro Text",Inter,system-ui,sans-serif;padding:44px;width:1200px}
.top{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:28px}.k{font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#777}
h1{font:800 64px/1 -apple-system,system-ui;letter-spacing:-.04em;margin-top:10px}h1 b{color:#1a7f37}h1 i{font-style:normal;color:#c62828}
.site{font:600 20px/1 ui-monospace,Menlo,monospace;color:#111;background:#fff;border:1px solid #ddd;border-radius:10px;padding:12px 16px}
.row{display:grid;grid-template-columns:270px 110px 1fr;gap:18px;align-items:center;background:#fff;border:1px solid #e3e2dd;border-radius:16px;padding:18px 22px;margin-top:10px}
.n{font-weight:700;font-size:18px}.n small{display:block;font-weight:500;color:#888;font-size:13px;margin-top:2px}
.chip{font:800 15px/1 -apple-system,system-ui;letter-spacing:.06em;text-align:center;padding:10px 0;border-radius:999px}.stay{background:#dcf5e3;color:#1a7f37}.leave{background:#fde2e1;color:#c62828}
.q{font-size:18px;color:#222}.fx{margin-top:26px;display:flex;gap:10px;flex-wrap:wrap}.fx span{background:#111;color:#fff;border-radius:999px;padding:9px 14px;font-weight:600;font-size:15px}
</style></head><body>
<div class="top"><div><div class="k">Landing panel · 7 Claudes · judged alone</div><h1><b>${stayed.length}</b> stayed · <i>${left.length}</i> left</h1></div><div class="site">${esc(host)}</div></div>
${verdicts.map((v) => `<div class="row"><div class="n">${esc(v.persona)}<small>${esc(v.decision === "stay" ? `stayed · ${v.seconds_spent ?? "?"}s` : `left at ${v.stopped_at || "?"} · ${v.seconds_spent ?? "?"}s`)}</small></div><div class="chip ${v.decision}">${v.decision === "stay" ? "STAYED" : "LEFT"}</div><div class="q">“${esc(v.quote)}”</div></div>`).join("")}
<div class="fx">${fixTags.slice(0, 3).map((t) => `<span>${esc(t.tag)} · ${t.count}/${verdicts.length}</span>`).join("")}</div>
</body></html>`;
fs.writeFileSync(path.join(runDir, "board.html"), html);
const browser = await chromium.launch({ args: ["--disable-gpu"] });
try {
  const p = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
  await p.setContent(html);
  await p.screenshot({ path: path.join(runDir, "board.png"), fullPage: true });
} finally { await browser.close(); }

console.log(`${board.headline_number} (${board.left_before_scrolling} left before scrolling past the hero). Top fixes: ${fixTags.slice(0, 3).map((t) => `${t.tag} ${t.count}/${verdicts.length}`).join(", ")}`);
if (missing.length) console.log(`missing verdicts: ${missing.join(", ")}`);
if (problems.length) console.log(`problems: ${problems.join("; ")}`);
