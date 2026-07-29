# PM Update — Chain parent = the TRUE flagship, not enrichment order

*"A man's gotta know his limitations."* — Magnum Force. So does a branch: it now knows it isn't the original, and won't claim otherwise.

Built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. The Terry Black's seed is reset to **Dallas** for your branch-first test.

## The fix

The chain "parent" is no longer whichever location happens to be enriched first — it's the **true flagship**, decided by the About/origin page.

**1 — The flagship is identified during research.** The dossier now carries a `flagship_location` field (original city + address + founding year), extracted from the brand's About / Our Story / origin page, using explicit signals ("our original location", "where it all began", "the first/flagship"). If it can't be determined confidently, it's null and *no* location is allowed to claim the origin — the record is flagged for review instead of guessing.

**2 — The flagship becomes the parent, regardless of enrich order.** When the record you enriched *is* the flagship (city/street match), it stays the parent as before. When you started from a **branch** and the flagship is elsewhere, the system reassigns: it finds the flagship row (or creates it as a seed) with `chain_parent_id = null`, and re-points the branch you started from — and anything already parented under it — to the flagship. No web searches are spent doing this, so the ≤6-search budget is untouched.

**3 — Only the true flagship may say "where it all began."** The writer is told, per record, whether it's the flagship (may claim origin), a branch (explicitly "NOT the original"), or an indeterminate chain (generic copy, no origin claim). A branch enriched first can never wrongly claim to be the home.

**4 — The flagship parent carries the brand facts.** When you start from a branch, the research gathers the brand-level facts (founding, pitmaster, method, wood, specialities, character — from the About page) *plus* that branch's own specifics. On reassignment those brand facts populate the **flagship parent** (fill-empty merge, so nothing good is clobbered), so every sibling — including the branch you started from — still inherits them. The flagship is never left an empty seed; it lands with brand facts and its own city/address, ready for you to enrich its own location specifics next.

**5 — Everything that works is preserved:** brand-fact inheritance, dedupe (the flagship is found/created through the same physical-location matching, so no duplicates or orphans), the anti-clobber merge, the ≤6-search budget, and the cost meter. The search budget was not touched.

## Test setup (built in)

The Terry Black's seed (`…072`) is reset to a clean **Dallas** branch — city Dallas, address 3025 Main St, Dallas, TX 75226, everything else cleared, seed description restored — and all other Terry Black's rows deleted. Enrich **Dallas first**.

**Expected:** chain detected → flagship identified as **Austin** from the origin page → **Austin becomes the parent** (created as a seed carrying the brand facts) → Dallas becomes a **sibling** under Austin, and Dallas's copy does *not* claim to be the original.

## Acceptance to watch

- Starting from a branch (Dallas) still yields the true flagship (Austin) as the parent; Dallas is a sibling beneath it.
- No non-original location ever claims "where it all began."
- Reassignment re-points every sibling correctly — no duplicates, no orphans.
- Rich flagship, inheritance, dedupe, ≤6 searches and the meter all still hold.

One note on sequencing after the test: because you'll have enriched Dallas before Austin, Austin arrives as a seed holding the brand facts but not yet its *own* location specifics — so enrich Austin next to complete the flagship's page (and unlock the remaining siblings via the parent-ready guard). If the origin page ever fails to name the flagship, that chain is flagged "review and set the flagship" rather than letting a branch pose as the original.
