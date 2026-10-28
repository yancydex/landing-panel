# Landing panel

A Claude Code skill. Seven Claudes visit your landing page as seven different people. Each one judges it **alone**, from real
desktop and mobile screenshots, decides whether they'd **stay or leave**, and says exactly why. Then the panel agrees on the
fixes most of them want and rewrites the top of your page, rendered on your live page as a before/after.

## Install
```bash
git clone https://github.com/yancydex/landing-panel ~/.claude/skills/landing-panel && cd ~/.claude/skills/landing-panel && npm install && npx playwright install chromium
```
Needs Node 18+ and Claude Code.

## Run it on a URL
In Claude Code:
```
/landing-panel https://your-site.com
```
Or just ask: "run the landing panel on your-site.com". A run takes a few minutes: one capture, seven visitors in parallel, a
counted board, then the fix.

## The seven visitors
| Visitor | What they care about |
|---|---|
| The 3-second scroller | Came from an Instagram link. Sees one phone screen, gives it three seconds. |
| The skeptical buyer who's been burned | Hunts for proof, pricing and the catch. |
| The designer | Type, spacing, hierarchy, whether the craft earns trust. |
| The copywriter | Every word. Does the headline say what, who, and why. |
| The competitor | Could they paste your claims onto their own page? |
| The ideal customer | The person the page is for. Would they act today? |
| The mobile user on a slow phone | Watches the page load on a throttled phone, second by second. |

None of them sees another's verdict. Each persona is a file in `agents/`, so you can edit them or add your own.

## What you get
A run folder (`./landing-panel-runs/<site>-<date>/`) with:
- `capture/`: the screenshots every visitor saw (desktop, mobile, full page, and a slow-phone filmstrip at 1/3/6/10 s), the
  page text, and measured facts (page weight, load times on a throttled phone, tap targets).
- `verdicts/<visitor>.json`: each visitor's decision, where they stopped, their reasons with evidence, their fixes.
- `board.md` / `board.png`: "N of 7 stayed", every quote, and the fixes ranked by how many visitors asked for them
  (counted by a script, not guessed).
- `rewrite.json`: new headline, subhead, button and section order. It only uses facts from your page; anything it needs
  from you (a real testimonial, a price) is marked `[NEEDS: ...]` instead of invented.
- `after/before_after.png`: the rewrite applied to your live page in a local browser. Nothing is deployed.

## Example: linear.app
[`examples/linear.app/`](examples/linear.app/) is a real run on linear.app (2026-10-27): 3 of 7 stayed, 4 left (the
scroller, the burned buyer, the copywriter and the slow phone), and 6 of 7 asked for a real button in the hero.
Read [`board.md`](examples/linear.app/board.md) for every verdict and the rewrite, or see
[`before_after.png`](examples/linear.app/before_after.png). Linear's page is shown only as a test subject; this project isn't
affiliated with Linear.

## Notes
- One headless Chromium at a time, closed after each step.
- The visitors are simulated by Claude from what's on the page. It's a sharp second opinion, not analytics.
- Pages behind a login, a captcha or heavy bot protection can't be captured.

## Licence
MIT, see [LICENSE](LICENSE).
