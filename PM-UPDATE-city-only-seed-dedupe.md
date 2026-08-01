# PM Update — Roster can't duplicate the flagship's own city (city-only seed dedupe)

*"If I owned a place like this and Graceland, I'd live here."* — Pulp Fiction. Two addresses, one place — knowing which is which is the whole job today.

Built, type-checked, production-built, guardrail-passed (25 write targets, 0 undeclared), unit-verified against the exact evidence cases, and live on `main` + `rebuild`. Logic change to the roster/dedupe only — no venue reset, deleted, or re-enriched.

## The bug, precisely

Roster scans were creating some sibling seeds whose "address" was just a city name ("Syracuse", "Hamburg") — which geocodes to the *city centre*. The flagship, meanwhile, has a precise street address geocoded to the *building*. For Dinosaur Bar-B-Que that's the flagship at 246 W Willow St → 43.0526, -76.1547 versus a bare "Syracuse" seed → 43.0481, -76.1474: about 700 m apart. Last build's street+150 m dedupe did its job *correctly* — it saw two pins 700 m apart and said "different place" — and so a duplicate of the flagship's own location got created as a sibling. Same shape as the Bodean's and Red Dog duplicates you cleaned by hand. This was the systemic cause behind all of them.

We couldn't just "dedupe by city", because that was the *original* bug — it false-merged "Olathe" vs "Olathe, KS" and would wrongly collapse genuinely different branches in one city. Bodean's Soho (10 Poland St) and Tower Hill (16 Byward St) are both London and both must survive.

## The fix — a targeted rule for city-only seeds

The dedupe now tells a real street from a bare city. A "distinct street" needs a building number or a street-type word (St, Ave, Rd, Square…) and can't just *be* the city name. With that distinction:

The precise street+150 m geo dedupe is unchanged for any candidate that has a real street. On top of it: when a roster candidate has **no distinct street** (city-only) and its settlement matches an existing chain member — flagship or sibling — it's treated as **already present** and no seed is created. Both sides run through the settlement normalisation first, so "City of Westminster"/"Greater London" collapse to "London" before comparing. A candidate that *does* carry a distinct street is exempt from this rule — which is exactly how two real London branches on different streets both stay.

Net: a city-only roster entry can never duplicate a member already in that city, while genuine multi-branch same-city chains (distinct streets) are fully preserved.

## Root cause addressed too

The deeper problem is thin seeds. The roster researcher now insists on capturing each branch's **full street address** from the brand's own locations page — building number and street, not just the town — with an explicit instruction never to drop the city name into the address field as a stand-in. Richer seeds pin to the building, dedupe on street precision on their own, and give enrichment a better starting point. The city-only rule is the safety net; capturing streets is the actual cure, so this failure mode shrinks with every future roster.

## Verified

I ran the logic against the real coordinates before shipping: a city-only "Syracuse" seed (whether the address reads "Syracuse" or is blank) is caught as already-present against the Syracuse flagship and **not** created; distinct-city entries (Rochester, Harlem/NYC) still create their sibling; and Bodean's Tower Hill (16 Byward St) versus Soho (10 Poland St) — both London, both real streets — are correctly kept as two branches. No city-only seed can be created at a city already occupied by a chain member.

Preserved intact: the street+150 m geo dedupe (Fix A), settlement-city normalisation (Fix C), geocode-failure flagging (Fix B), the three-step chain flow, no auto-crowning, the cheap single-pass enrich, and cache revalidation. Dinosaur's Syracuse dupe, Bodean's Archer St and Red Dog Hoxton were already removed by hand — I left everything as-is. Clear to import the 623.
