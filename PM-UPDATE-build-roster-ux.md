# PM Update — Build roster: real trigger + feedback, chain chip on the row, and the row stops jumping

*"Well, there's your problem."* — every mechanic ever. The Listings query was quietly eating two columns and had no sort order. Both fixed.

Built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. I did **not** reset or touch any venue — the enriched Terry Black's Dallas row stands exactly as you left it.

## Root cause (this explains all three symptoms at once)

You operate from **Listings & Insights**, and that page's database query was hand-listing its columns — and it left out `flagship_unset` and `chain_candidate`, and had **no `ORDER BY`**. So on that screen the "Build roster" trigger could never appear (the row didn't know it was a chain candidate), and every status change re-sorted the list arbitrarily (Postgres returns rows in no fixed order without a sort). Switched that query to select all columns and order by creation date. That single fix restores the chain state to the row and makes the order stable.

## Fix 1 — Build roster: visible trigger + live feedback

On an enriched venue flagged as a chain, the row now shows a clearly-labelled **"Build roster"** button (text + icon, not a bare glyph). Clicking it:

- shows live feedback immediately — "Scanning [brand] locations…", the row spinner while it runs, then a clear result: "**Found N locations (M new) — flagship not set. Pick the original with 'Set as flagship'**", or a plain error ("Roster scan failed — try again" / timed out) on failure. No more staring at an unchanged screen.
- on success creates every branch as a seed in the "Chain · flagship not set — pick one" state (no crown, nothing claimed) and stamps `chain_rostered_at`.

The scan is wired end-to-end: it reads the brand's own locations page (up to 8 searches, the approved token-spend step), enumerates the branches, and seeds them deduped by physical address. It simply never had a visible button to launch it before — now it does.

## Fix 2 — The row stops jumping

The jump was the missing `ORDER BY` on the Listings query — with it, rows now hold a stable creation-date order, and the hub groups chains within that order without re-sorting. A row changing Never→Done or seed→enriched keeps its place; new sibling seeds insert directly beneath their parent. I also changed the post-action scroll to `nearest`, so if the acted-on row is already on screen the viewport doesn't move at all — only an off-screen row is gently brought into view, with the brief gold flash.

## Fix 3 — Chain indicator on the row

There's now an at-a-glance **⛒ Chain** chip beside the name for the states that don't already carry a badge — a chain candidate (roster not built yet) and a sibling seed — so you can see a venue is part of a chain, and that a roster can be built, without opening the diff modal. (A confirmed flagship still shows the gold **⌂ Flagship** badge; an unset chain shows the amber "Flagship not set".)

## Preserved (no regressions)

The cheap single-pass enrich (≤~4 searches, ~$0.02 — untouched), no-crown / detected-not-acted behaviour, protected writer, dedupe, fill-empty merge, country canonicalization, cache revalidation, social brand logos, the Grok→Claude split, honest cost meter.

## Verify

On the enriched Terry Black's Dallas row (Listings): a visible **Build roster** button and a **Chain** chip are present, and the row doesn't move when you act on it. Click **Build roster** → "Scanning… → Found N locations" → Austin, Fort Worth, Waco, Lockhart, etc. appear as seeds in "flagship not set" state beneath the parent, `chain_rostered_at` stamped, nothing crowned, and Dallas stays put.
