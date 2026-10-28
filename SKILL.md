---
name: landing-panel
description: Put a landing page in front of a panel of seven Claudes, each a different real visitor (3-second scroller, burned buyer, designer, copywriter, competitor, ideal customer, slow phone). Each judges the page alone from real screenshots, decides stay or leave and says why; then the panel agrees on the top 3 fixes and rewrites the hero. Use when the user runs /landing-panel <url>, or asks to roast, review, critique or test a landing page or homepage.
argument-hint: <url> [run-dir]
---

# Landing panel

Seven visitors, one page, no peeking. Run every step; don't skip the screenshots or judge from the text alone.

`SKILL_DIR` = the folder this file is in. `URL` = the first argument (add `https://` if missing).
`RUN` = the second argument, or `./landing-panel-runs/<host>-<YYYY-MM-DD>` in the current directory.

## 1. Capture (one browser, about 30 s)
```bash
cd "$SKILL_DIR" && [ -d node_modules/playwright ] || npm install --no-audit --no-fund
nice node "$SKILL_DIR/scripts/capture.mjs" "$URL" "$RUN"
```
If it fails (Chromium missing → `npx playwright install chromium`; site blocks bots or times out → tell the user, stop).
Glance at `$RUN/capture/desktop_fold.png` yourself: if it shows a captcha, an error or a blank page, stop and say so;
the panel would be judging the wrong thing.

## 2. The panel: seven visitors, in parallel, alone
`mkdir -p "$RUN/verdicts"`. Then launch **all seven in one message** with the Agent tool (general-purpose subagents, so
they run at the same time and none can read another's verdict). Persona ids: `scroller`, `burned-buyer`, `designer`,
`copywriter`, `competitor`, `ideal-customer`, `slow-phone`. Each prompt is exactly:

> You are a visitor on a landing-page panel. Read `SKILL_DIR/agents/_contract.md` (the rules and output format) and
> `SKILL_DIR/agents/<id>.md` (who you are). The page is URL. Your run folder is RUN: read only `RUN/capture/`.
> Judge the page alone as that person, then write `RUN/verdicts/<id>.json`.

(Substitute the real absolute paths.) Don't add your own opinion of the page to the prompts; the point is that they judge
it cold. Wait for all seven. If one fails or writes invalid JSON, re-run only that persona once.

## 3. The board (counted by script, not by you)
```bash
nice node "$SKILL_DIR/scripts/board.mjs" "$RUN"
```
Writes `board.json`, `board.md`, `board.png`. Every number you tell the user comes from `board.json`.

## 4. The fix
Launch one more subagent, the fixer:

> Read `SKILL_DIR/agents/fixer.md` and follow it. The run folder is RUN.

It writes `rewrite.json` and `patch.js` (+ optional `patch.css`). Then render the fix on the live page (local only,
nothing is deployed) and redraw the board with the rewrite included:
```bash
nice node "$SKILL_DIR/scripts/after.mjs" "$RUN" && nice node "$SKILL_DIR/scripts/board.mjs" "$RUN"
```
Open `after/before_after.png` and check the patch really landed (new headline visible, nothing broken). If it didn't,
fix `patch.js` yourself against the selectors in `capture/page.json` and run `after.mjs` again.

## 5. Report to the user
Short, in this order:
1. **The verdict:** "N of 7 stayed", and how many left before scrolling past the hero.
2. **The panel**, one line each: persona, STAYED/LEFT, their quote.
3. **The 3 fixes** most visitors agreed on, with how many backed each.
4. **The rewrite:** before → after for headline, subhead, button; the new section order; anything marked `[NEEDS: ...]`.
5. Paths: `board.md` (everything), `board.png`, `after/before_after.png`.

Never claim more than the files show. The panel is seven model-simulated visitors, not real user data; say so if the user
treats it as analytics.
