# PM Update — Slug fix + 8 tidies, and an overnight self-check note

*"Roads? Where we're going, we don't need roads."* — Back to the Future. But we do need the right URLs, so those are fixed first.

All nine fixes are built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. No venue was reset, deleted, or re-enriched. The final self-check is at the bottom — **read it: total shows 82, not 81** (nothing lost — explained there).

## Fix 1 — Terry Black's slugs corrected (SEO)

Done in the safe order: Dallas (`…072`) → **`terry-black-s-bbq-dallas`**, then the Austin flagship → **`terry-black-s-bbq-austin`**. There's now a `slug_redirects` table and the venue page **301s** any retired slug to its new home, so `…-austin-2` → `…-austin` permanently and nothing 404s. One honest note: I did **not** add a redirect from the *old* `…-austin` (which used to serve Dallas) to `…-dallas`, because that URL now correctly belongs to the Austin flagship — it can't both serve Austin and redirect to Dallas, and Austin is the right occupant. No `…-austin-2` remains in the data; the deploy regenerates the sitemap and pages with the corrected slugs.

## Fix 2 — Slug regenerates when a venue's city changes

Root cause of the mismatch: a Dallas venue kept its old "austin" slug. Now, when an enrich corrects a **not-yet-approved** venue's city/name, its slug regenerates to match and a 301 is left behind — important for the 623 import, where seeds get their real city on enrich. An approved venue's live slug is left untouched (rename it deliberately via the new admin edit) so established URLs don't churn.

## Fix 3 — Build roster is green

Green = go. Build roster is now emerald; red stays reserved for destructive actions (Discard, Reject, Unpublish).

## Fix 4 — A 0/1-location scan means "not a chain"

A roster scan that finds 0 or 1 locations now concludes it isn't a chain: it clears `chain_candidate`, `flagship_unset` and `chain_rostered_at`, drops the chips, and shows "No other locations found — treated as a single venue." There's also a one-click **"Not a chain"** control on any chain-candidate row so you can clear a false positive without scanning. (This is what falsely flagged Texas Joes.)

## Fix 5 — One status label

Equivalent approved rows now all read **"Published"** — a just-finished row no longer shows a stray transient "Done." Display-only.

## Fix 6 — Directory shows all countries

Removed the hard-coded 14-country cap on the `/directory` "browse by country" strip; it now lists every country that has at least one venue (all 22).

## Fix 7 — Instagram & Facebook link-out logos (even with 0 posts)

The public venue page now shows IG/FB (and X/TikTok/YouTube) as brand-logo link-outs in "Find them" wherever a handle/URL exists — independent of embeddable posts, and the IG link falls back to building the URL from the handle. The photo-feed embed still only renders when real posts exist (copyright-safe). I also found why Texas Joes didn't show them: **Find IG saved the socials to the live row but never revalidated the page** — that's now fixed, so saved handles surface on the next load.

## Fix 8 — Full postal address incl postcode

The research prompt now insists on the complete postal address **with postcode/ZIP** and the **precise locality** (e.g. Bermondsey/London), not a coarse region like "Greater London" — better pins, local SEO, and city grouping, and it applies to the import.

## Fix 9 — Manual address + map-pin edit

New map-pin (📍) control on each admin row opens an editor for the full address (incl postcode), city, country and lat/lng. "Save & re-geocode" moves the pin to match the address; "Save with this pin" keeps a hand-entered lat/lng. Saving applies live and revalidates so the correction shows on the next load.

## Final self-check (unattended)

- **Approved:** 82 / 82 — every venue is live; nothing left in a non-approved state.
- **Coordinates:** 0 venues at (0,0) or null. ✓
- **Terry Black's chain:** 1 Austin parent + 4 siblings (Dallas, Fort Worth, Lockhart, Waco), all approved, all with copy. ✓
- **No stranded chains:** 0 rows in chain-candidate or flagship-not-set. ✓
- **Total venues: 82, not 81.** ⚠️ Flagging this per your instruction. I added and deleted **zero** venues in this build (every write was an update, plus one row in the separate `slug_redirects` table), so this isn't a loss — it's one *more* than your 81 baseline, almost certainly Texas Joes (which your prompt references as a venue you enriched). Everything is approved with valid coordinates, so nothing is broken; I've left it exactly as-is for you to confirm rather than "fixing" a count by touching data.

Everything preserved: the cheap single-pass enrich (~$0.02), the three-step chain flow, no-crown behaviour, stable no-resort order, cache revalidation, country canonicalization, cost meter.
