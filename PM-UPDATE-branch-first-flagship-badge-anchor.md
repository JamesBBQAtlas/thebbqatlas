# PM Update — Branch-first populates the flagship (in budget) · Flagship badge · Anchor stays put

*"Do, or do not. There is no try."* — Yoda. So the row no longer *tries* to chase itself back into view — it simply doesn't move.

All three fixes plus the Dallas reset are built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. The reassignment win is preserved; these are the follow-ons.

## Fix 1 — Branch-first enrich now populates the flagship, within budget

The regression was the branch-first path trying to do four jobs in one ≤6-search call — the branch's own facts, chain detection, flagship discovery, and brand-fact gathering — so it overran to 10 searches, got halted, and the flagship was left empty.

Now the work is **split**. When an enrich reveals the record is a branch whose flagship is elsewhere, it does bounded discovery only: read the About/origin page, identify the flagship, gather the brand-level facts (all inside the ≤6 budget), then **stop**. It does NOT also write the branch's own copy in that call. Concretely, from the branch's research it:

- creates (or finds) the true flagship as the parent and **populates it** — website, Instagram, style, price, and a brand-level story written by the writer (a Claude call, no web search, so it costs nothing against the search budget). The flagship is never an empty seed again.
- seeds the rest of the roster under the flagship and stamps it rostered.
- demotes the enriched record to a **clean sibling** — its research (cost, sources, per-pass debug) is recorded, `needs_attention` is false, and no copy is written for it here.
- returns a helpful state instead of a scary flag: *"Flagship [Austin] identified and populated with the brand facts — enrich the flagship to finish its page, then the siblings."*

Because the flagship now carries the brand facts, the siblings (including the branch you started from) are unlocked for the normal, cheap ~$0.02 sibling enrich that inherits those facts and adds each location's own specifics. The flagship's *own* location specifics (its exact hours/address) fill when you enrich it directly — which is the natural next step.

## Fix 2 — FLAGSHIP badge

Chain parents now wear a gold **⌂ FLAGSHIP** badge on their row in Listings, so the home of each chain is obvious at a glance and clearly distinct from the siblings indented beneath it — no more inferring it only from indentation.

## Fix 3 — The list no longer re-sorts (the definitive fix)

We stopped chasing the moving row and removed the movement instead. The list is ordered by a stable key, and a group is now **anchored at the earliest position among its members**. So when a status changes (Never → Working → Done), or a brand-new flagship parent appears after a branch-first enrich, the group stays exactly where it was — it no longer leaps to the top or bottom. New sibling seeds insert directly beneath their parent, in place. Nothing moves, so there's nothing to chase; the operator's row stays under their eye. (The gold flash stays as a nicety.)

## Cleanup — Dallas seed, clean

Every Terry Black's row was deleted and the canonical seed (`…072`) recreated as one clean **Dallas** branch — city Dallas, 3025 Main St, everything else cleared, seed description restored. No Austin row, no siblings; Austin is discovered fresh on enrich.

## Full acceptance to watch

Enrich **Dallas** → Austin becomes the parent, populated with the brand facts (website + story present) and wearing the FLAGSHIP badge; ≤6 searches, no budget flag; Dallas is a clean sibling; nothing changes position in the list. Then enrich **Austin** to fill its own specifics, then the siblings inherit — all rich, all ≤6, all staying put.
