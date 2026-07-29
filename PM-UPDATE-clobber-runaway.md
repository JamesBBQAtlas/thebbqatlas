# PM Update — Enrichment runaway + facts-read-but-clobbered

*"What we've got here is failure to communicate."* — Cool Hand Luke. Pass-1 found the facts; pass-2 handed back nulls and wiped them. They're talking now.

Both linked bugs are fixed, built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. Terry Black's Austin is reset genuinely clean for a true from-scratch run.

## The bug, confirmed

Your read of the DB was exactly right. It read the correct pages (5 good source URLs, 5,350 tokens back) but stored nothing — website null, story empty — and then, because the dossier looked thin, kept re-searching until the $-ceiling stopped it at 17 searches / $0.099. Two bugs feeding each other.

The prime suspect was the culprit: the flagship's **pass-2 replaced the dossier wholesale** (`dossier = { ...pass2 }`). When pass-2 came back thin, it nulled out every rich fact pass-1 had already found — website included, which is literally the page it was standing on. Empty dossier → retry-on-thin fires → still empty → the loop the cost ceiling eventually had to stop.

## Fix 1 — Merge, never clobber (root cause)

Every research pass now **fill-empty MERGES** into the accumulated dossier: a later pass may *add* a fact an earlier pass missed, but it can never overwrite one already found. `base` wins every non-empty field; the extra pass only fills gaps (`is_chain` is OR'd, sources are unioned, "unknowns" re-derived). I unit-tested the exact failure: a rich pass-1 followed by a fully-thin pass-2 now keeps the website, founding, pitmaster, method, specialities, chain roster, address and hours — nothing is clobbered. That single change is most of the regression gone.

On top of that, **pass-2 now runs only when pass-1 came back thin.** A well-documented flagship like Terry Black's reads its homepage on pass-1 and is already rich, so pass-2 is skipped entirely — which both removes the clobber risk and restores the known-good ~$0.02–0.04 single-pass economics. Seeding and the roster stamp still happen unconditionally, so chain detection is unaffected.

Every pass's raw dossier + search/token counts are now written to a new `enrichment_debug` field, so a future "read the pages but stored nothing" is inspectable at a glance — you can see exactly what each pass returned versus what got saved.

## Fix 2 — Hard caps so it can never run away

- **Retry-on-thin fires at most once** — it was always a single step, never a loop, and it's now also gated on the budget below.
- **One shared total-search budget of 6** across every pass (pass-1 + optional pass-2 + the one retry). Each extra pass is handed only the *remaining* budget as its own search cap, and no pass fires once the budget's spent. So the worst case is pass-1 (≤3) plus one more pass (≤3) = 6, then it stops.
- If the budget is somehow exceeded (an API cap leak) **or** the $-ceiling is hit, the result is flagged for attention rather than trusted — stop and flag, never keep searching. The dollar ceiling is now the backstop; the search *count* is the primary bound.

## Net effect

A well-documented venue reads its homepage/About on pass-1, fills the dossier there, never triggers pass-2 or the retry, and lands at ~$0.02–0.04. A genuinely sparse venue gets exactly one extra steered search and then an honest "needs attention" — never a 17-search, $0.10 empty result.

## Cleanup — Terry Black's reset (truly clean again)

Austin parent (`…072`) back to a clean un-enriched row: name "Terry Black's BBQ", seed description restored, and website / Instagram / posts / sources / the new debug field / cost / dossier / pending / rostered all cleared — address kept. All siblings deleted.

## Acceptance to watch

Enrich Terry Black's Austin: reads the homepage/About, fills the dossier (website + story present), detects the chain and sets `chain_rostered_at`, stays at **≤6 total searches**, costs ~$0.02–0.04, comes back rich — and holds across 2–3 repeats. No runaway, no empty-but-expensive result. If anything ever does come back thin, `enrichment_debug` will show which pass dropped the ball.
