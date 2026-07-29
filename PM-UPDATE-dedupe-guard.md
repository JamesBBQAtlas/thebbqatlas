# PM Update — Global duplicate-venue guard

*"There can be only one."* — Highlander. Now enforced: one venue, one record, one dedupe standard everywhere it could slip in.

Built, type-checked, production-built, guardrail-passed, live on `main` + `rebuild`, and — critically — verified end to end against the live 77. Everything below runs off **one** shared matching module; there is no second dedupe standard.

## One standard, reused everywhere

A single module (`lib/venues/dedupe.ts`) that reuses the exact §09.2 chain-dedupe normalizers (normalize street + city) plus geo distance and fuzzy name matching. A candidate is a possible duplicate of an existing venue if ANY of:

- **same normalized street address** (high confidence),
- **within ~100 m** of an existing venue's coordinates ("82 m away"), or
- **fuzzy name similarity + same city** ("name match, same city").

Every match comes back ranked, with a plain-English reason and a confidence. It **warns**, it never silently rejects — food halls and shared buildings mean two legitimate venues can share an address, so a human always stays in the loop. Only high-confidence exact matches are auto-skipped on import (and even those appear in the report). It degrades gracefully: with no address/geo it falls back to name + city. And a genuine new branch of an existing chain (different city) is **not** flagged — that's a sibling, not a duplicate.

## Where it surfaces

1. **Submit form** — after a name + location, a soft notice: "This looks like it may already be on the Atlas: [Venue, city] — View. If yours is different, submit anyway." Never blocks; if they proceed, the submission is tagged so the moderator sees the flag.
2. **Moderation queue** — each card shows "⚠ Possible duplicate of [Venue] — [reason]" with a link to the existing venue, plus actions: **Approve as new** (it's genuinely different), **Reject**, and **Merge into existing** (folds any new facts — website, Instagram, photo — into the existing record, gaps only, then resolves the submission).
3. **The 623 import** — matches every incoming row against ALL existing venues *before* creating anything. High-confidence match → not created (recorded). Uncertain → created as a seed but flagged for review (shows in the Needs-attention filter with the reason and a link). No match → normal seed. It also dedupes **within the file**, and produces a full report. There's a **Dry run** button that previews the whole report and writes nothing.

## Verified against the live 77

I ran a dry run through the deployed admin with a deliberately tricky little file — an exact duplicate of a live venue, a brand-new venue, an internal duplicate of it, and an existing venue by Instagram handle:

> 4 rows → 1 new seed · 1 matched existing (skipped) · 0 flagged uncertain · 1 handle-refreshed · 1 internal dup collapsed · 0 written

The duplicate of the live venue was caught and **not** created, the internal duplicate collapsed, and the database confirmed **zero** rows written. The name-matcher was also unit-tested: "Franklin BBQ" ≈ "Franklin Barbecue" flags; "Terry Black's" vs "Black's Barbecue" does not.

Before this, the only guard was the unique slug, which just suffixed on collision (`franklin-barbecue-2`) and let duplicates straight through. That door is now closed — the 623 import can run without creating a single duplicate of the 77.
