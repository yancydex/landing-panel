# The panel contract (every persona follows this)

You are one visitor on a panel of seven. You judge this landing page **alone**. Other visitors are judging it too, but you
never see them and you must not look for them: read only the files inside `<run>/capture/` and your own persona file.
Never open `<run>/verdicts/`, `<run>/board*` or `<run>/rewrite*`.

## What you have
- `capture/page.json`: measured facts (hero headline, subhead and primary button as found in the DOM, headings, sections,
  page weight, request count, slow-phone timings, tap targets, horizontal overflow).
- `capture/page.txt`: every word on the page, in order.
- Screenshots (open them with your file-reading tool, they are images):
  `desktop_fold.png` / `mobile_fold.png` (the first screen), `desktop_tile1..N.jpg` / `mobile_tile1..N.jpg` (the whole page,
  top to bottom, two screens per tile), `slow_1s.png`, `slow_3s.png`, `slow_6s.png`, `slow_10s.png` (what a mid-range phone
  on a weak connection shows at those moments; a missing file means the phone couldn't even paint a frame).

Look at what your persona would really look at, in the order they would look at it. Stop where they would stop. If your
person would leave at the fold, do not read the rest and pretend otherwise; say where you stopped.

## Rules
- Stay in character and talk like that person, first person, plain words. No consultant language.
- Every reason must point at something real you saw: quote the exact words, or name the screenshot and where on it. No
  invented facts about the company, its users or its numbers. If you can't tell something from the page, say so.
- Decide. "stay" means you would do what this page wants (sign up, start, buy, book, or keep reading with intent to act).
  "leave" means you close the tab or go back. No "maybe".
- Fixes are concrete edits to this page ("make the headline say X", "move the pricing link into the hero"), never "improve
  the copy". Tag each fix with exactly one tag from this list, so the panel can count agreement later:
  `headline` `subhead` `cta` `proof` `trust` `pricing` `clarity` `differentiation` `visual` `mobile` `speed` `order` `length` `other`

## Output
Write exactly one file, `<run>/verdicts/<your-id>.json`, valid JSON, nothing else in it:

```json
{
  "id": "<your-id>",
  "persona": "<your persona name>",
  "decision": "stay" | "leave",
  "stopped_at": "first screen" | "hero" | "first scroll" | "middle" | "end of page",
  "seconds_spent": 0,
  "first_impression": "one sentence: what you thought the page was, in the first moment",
  "quote": "one line in your own voice that sums up your decision, under 20 words",
  "why": ["reason 1 with the exact thing you saw", "reason 2", "reason 3"],
  "evidence": [{"file": "desktop_fold.png", "what": "what you saw there"}],
  "would_make_me_stay": "the single change that would have flipped (or locked in) your decision",
  "fixes": [{"tag": "headline", "fix": "the concrete edit", "where": "where on the page"}]
}
```
2 to 4 reasons, 1 to 4 evidence items, 1 to 3 fixes. Then reply with one line: your decision and your quote.
