# PM Update — Ambiguous flagship: never dead-end, build the roster, let the human pick

*"When you come to a fork in the road, take it."* — Yogi Berra. Now when the research can't tell which way is home, it lays out every road and hands you the map.

Built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. The auto path is untouched; this is purely the fallback for when auto-detection isn't confident. Terry Black's is reset to the Dallas seed.

## Fix 1 — Ambiguous flagship no longer dead-ends

When a chain is detected but the origin can't be confidently auto-determined, it used to stop with nothing to act on. Now it:

- **builds the full roster** — a bounded scan of the brand's own `/locations` page enumerates every branch and creates them as seeds, so every location exists and is visible (Austin included);
- **marks the whole chain "flagship not set"** — no location claims to be the original until one is chosen;
- puts a one-click **"Set as flagship"** control on every member of the chain.

Clicking "Set as flagship" on a location makes it the parent, **populates it with the brand facts already gathered during discovery** (reused, no new web search — or a normal flagship enrich if none were gathered), writes its brand-level page, re-points all the other members to it as siblings, and unlocks them for the normal cheap ~$0.02 sibling inheritance. Only then may that flagship's copy say "where it all began." An ambiguous chain becomes a two-second human decision — "here are the five locations, tap the original" — never a dead-end.

## Fix 2 — Badge honesty

The gold ⌂ **FLAGSHIP** badge now appears only on a **confirmed** flagship. A chain whose flagship is unset shows a distinct amber **⚠ FLAGSHIP NOT SET** state instead — no more a location wearing the confident badge while the flagship is flagged unknown. (That contradiction is fixed.)

## Kept working / no regressions

- **Auto path unchanged:** when the origin IS confidently found (the earlier Austin run), it auto-sets the flagship exactly as before — this fallback only triggers when it isn't.
- **Budget honesty:** the dossier research is still bounded to ≤6 searches with the runaway guard intact. The ambiguous roster scan is a *separate* bounded op (its own small cap, ~1–2 searches) tracked apart from that budget so it never trips the runaway flag, but fully reflected in the cost meter (`roster_cost` / `roster_searches` in the breakdown, and the run ceiling lifts by the roster's hard cap so it isn't false-flagged).
- Preserved: dedupe (roster seeds matched via physical-location keys → no dupes/orphans), the never-clobber merge, sibling inheritance, and the no-resort anchor (nothing moves — the new flagship and its siblings stay anchored at the branch's original spot).

## Cleanup — Dallas seed

All Terry Black's rows deleted; the canonical seed (`…072`) recreated as one clean **Dallas** branch — city Dallas, 3025 Main St, everything else cleared, `flagship_unset` false, seed description. No Austin, no siblings.

## Acceptance to watch

- Enrich **Dallas** → if auto-detect confidently finds Austin, Austin auto-becomes the populated flagship (auto path).
- If it can't → the roster is built (all Terry Black's locations as seeds), no false origin claim, and a **Set as flagship** control sits on each member. Click it on Austin → Austin becomes the populated flagship parent (brand facts on it), Dallas + the others re-point as siblings and unlock.
- The gold FLAGSHIP badge shows only once a flagship is confirmed; otherwise the amber "flagship not set" state.
- Nothing moves position in the list; dossier ≤6 searches; the meter is honest.
