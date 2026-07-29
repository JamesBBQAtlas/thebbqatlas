# PM Update — BUILDPROMPT09.2 (chain-loop + duplicate fixes)

*"Listen to me. Have you got him? Nobody's got him. He got himself."* — Sicario. The loop got itself; now it's got.

All ten §09.2 fixes are built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. The Joe's KC test data is cleaned back to its three real locations, ready for a fresh re-test.

## The loop and the duplicates — fixed at the root

**1 — Siblings can no longer re-trigger chain detection.** This was the loop. Any row with a `chain_parent_id` is a sibling; its enrich now reports "not a chain," seeds nothing, and never opens the roster gateway. It writes only that one venue's dossier, copy, and cost. The roster scan is a once-per-chain action, initiated only from the parent, and stamped with `chain_rostered_at` (new column) so it's never offered twice for the same chain.

**2 — Identity is now the physical location, not the city text.** This is the real dedupe fix. Two records at the same normalised street address are the same place, however the city is spelled — so "Olathe" and "Olathe, KS" collapse to one. The roster scan is idempotent: a match updates the existing seed in place (filling a fuller address) and never inserts a new row, so re-scanning yields zero net new rows. Crucially, a roster branch that maps to the parent's own venue is skipped rather than seeded — that's what created the phantom "Gas Station / Kansas City, KS" duplicate of the flagship, and it can't happen now.

**3 — One honest count.** The banner and the green number now read from the same source: "N found · X new · Y already present." No more "5 added" vs "3."

**4 — Status refreshes after publish.** A published venue no longer lingers on "Draft ready" — the stale line is cleared the moment you approve or publish, from the row or the preview.

**5 — The RAG dots are back.** The red/amber/green freshness indicator returns to the Enriched column: green freshly enriched, amber ageing, red stale or never.

**6 — Full address, never downgraded.** Enriched addresses now carry street, city, state and postcode ("3002 W 47th Ave, Kansas City, KS 66103", not "…, 66103"). And a new enrich will never overwrite a fuller address on file with a thinner one.

**7 — Website.** It already renders on the venue page and in the change-set; verified it's showing.

**8 — Chain flagged earlier.** "Part of a chain" now appears on the copy preview itself, so you know before you approve — not only at the roster screen.

**9 — The search cap wasn't leaking — the meter was miscounting.** The Leawood "4 searches" was the meter billing per *source returned* rather than per *search call*; one capped call reading four sources read as four searches. The cap (three calls, enforced at the request level) was holding. The meter now counts actual calls, so the cost reads true.

**10 — Label vs button.** The chain-sibling seed is now a plain status label ("Chain location · seed") next to a distinct "Enrich this location" button — no more mistaking the status for something clickable.

## Cleanup (as authorised)

Joe's KC reduced to its three real locations: the original Kansas City parent, Leawood, and Olathe — the three duplicate rows deleted, parent and Leawood corrected to full addresses.

## For the clean re-test

Re-enrich the Joe's KC parent. Expect: "part of a chain" on the copy preview → approve → roster scan **once** → three locations found, no duplicates, one honest count → enrich a sibling → **no roster re-fire**, ≤3 searches, status flips straight to published, green RAG dot, full address and website present. Re-running the roster should add zero rows.

## Next up

The Easter-eggs batch (Eggs 6–10) is queued — it's the lower-priority, no-rush pass. A couple need a coordinate confirmed before build (the Bionic quarry is waiting on Michelle; the owl sanctuary needs a real one picked), so I'll line those up next.
