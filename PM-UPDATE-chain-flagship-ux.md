# PM Update — Chain flagship two-pass + Listings UX (Terry Black's run)

*"Say 'what' again. I dare you."* — Pulp Fiction. The list will not say "wait, where did my venue go" again.

All four items plus the cleanup are built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. Terry Black's is reset for a clean re-run.

## 1. Chain flagship — two explicit passes, auto-handoff

The accepted model is now built in. Enriching a chain parent runs as: **pass 1** detects the chain and (on your roster scan) creates the sibling seeds; the moment the roster is created, the parent **automatically flows into pass 2** — a full fact-enrichment pass on its own facts, with chain detection skipped because the chain is already catalogued. The research prompt for that second pass explicitly tells the model the locations are already known and to spend the entire budget on THIS flagship's own facts (hours, founder/pitmaster, specialities, cook method, wood/fuel, setting). So a well-documented flagship is never left stranded in the thin "needs attention" state — no manual re-enrich. The ~2× cost is the accepted model and the meter shows the accumulating total transparently. The honest "refuse to invent / needs attention" behaviour for genuinely thin venues is untouched.

## 2. Scroll no longer jumps

After an enrich or chain-detect, the list holds your scroll position across the re-render instead of flinging you to an unrelated part of the list. You stay looking at the venue you just acted on.

## 3. Siblings grouped under their parent

A chain's sibling seeds now render indented directly beneath their parent as one visual block (with a "↳" and a sienna rule), so enriching a parent visibly produces "parent + its N seeds" together, rather than scattering them wherever they'd otherwise sort.

## 4. Rows stay one line

The per-row actions are now compact, icon-only, on a single non-wrapping line, so rows never balloon to double or triple height at awkward window widths. The legend above the table and each icon's hover label carry the names.

## Bonus fix found in the run

The test produced a **sixth** Terry Black's sibling — "Ft. Worth" alongside "Fort Worth" — because the city normalizer didn't treat "Ft." and "Fort" as the same. Fixed: it now expands Ft.→Fort, St.→Saint, Mt.→Mount. While fixing that I caught a deeper latent bug — the normalizer was chopping the last two letters off *any* city name ("Fort Worth" → "fort wor", "Olathe" → "olat"), hidden only because both sides truncated identically. That's corrected too, which quietly sharpens every dedupe path that keys on city.

## Cleanup — Terry Black's reset

The Austin parent (`…072`) is back to a clean, un-enriched row — cost/breakdown/dossier/pending/rostered all cleared, its address and live pre-enrich copy intact — and all six test siblings (the four listed, "Fort Worth", and the stray "Ft. Worth") deleted. One clean Terry Black's Austin, no siblings, ready for a fresh end-to-end run of the improved flow.
