# PM Update — Hardening before the 623 import

*"Are you watching closely?"* — The Prestige. Two venues at the same address is the oldest trick in the book; now we're watching closely enough to catch it.

All three fixes are built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. Nothing was reset, deleted, or re-enriched — the only data touched was flagging the one bad-coordinate row (a flag, not a change), exactly as the prompt allowed.

## Fix A — Roster dedupe now includes the flagship's own address

The Red Dog bug was a dedupe that compared branches by *city text*. That did two wrong things at once: "Greater London" matched across genuinely different branches (false merges waiting to happen), yet it *failed* to spot that a roster's new "37 Hoxton Square" was the flagship itself — the streets read differently and "Greater London" ≠ "London", so it slipped through and spawned a duplicate.

Identity is now the **physical location**, not the city string. When the roster scan enumerates a chain's branches, every candidate is deduped against **all** existing members — the parent/flagship *and* every current sibling — by two precise signals: the normalised **street address**, and **geographic proximity** (within ~150 m, using the real coordinates). The flagship's own location is treated as already present, so a chain can never again spawn a duplicate of a venue that's already in the atlas. City text is no longer used to merge anything. (A narrow, safe fallback on the distinct *branch label* only kicks in when neither side has a street to compare, so an address-less seed still re-runs idempotently without reviving the "Greater London" collision.)

To make the proximity check possible, each candidate is geocoded up front (politely throttled for the map provider) — which also means new branches now land with a **real pin** instead of a placeholder.

## Fix B — A geocode failure now flags, it never silently saves at (0,0)

This is what put Red Dog Southampton in the middle of the Atlantic: "West Quay South" didn't geocode, and the row saved at 0,0 while *looking* fully enriched — the worst kind of failure, the silent one. Because it's a chain branch with an address on file, the old "missing location facts" check didn't fire either.

Now, whenever geocoding returns nothing (or a bogus 0,0), the venue is not pinned at 0,0 and left to look fine. It's flagged **needs attention** with the reason *"Couldn't locate — check address / set pin manually"*, so it surfaces in your queue and can be fixed with the map-pin editor. This covers all the write paths that matter: an **enrich** that ends without a valid pin flags the row (even an approved one); a **roster seed** whose address won't geocode is inserted flagged rather than at a silent 0,0; and the **Publish guard** now blocks a null pin as well as a 0,0 one, so nothing un-located can go live.

The 623 import keeps its deliberate design — it does *not* geocode 623 rows one-by-one (that would be ten minutes of throttled calls); its seeds land as clearly-pending 0,0 drafts and get their real pin when you enrich them, with the Publish guard as the backstop. So the import can't ship a bad pin either, it just doesn't flag every un-enriched seed as a "problem" (that would swamp the very queue we're trying to keep meaningful).

**One-time cleanup:** I flagged every venue currently sitting at null/(0,0). That was exactly **one** row — Red Dog Saloon, Southampton — now marked needs-attention and waiting for a pin. Nothing else in the atlas is mislocated.

## Fix C — City normalised to the settlement, not the admin district

A new `settlementCity()` helper maps the UK administrative-district forms to the settlement people actually search: "City of Westminster", "Greater London" and the London boroughs all become **London**; "City of Nottingham" becomes **Nottingham**. It's conservative on purpose — it only rewrites the explicit admin-district *strings*, so a real locality you'd want to keep ("Bermondsey", "Croydon") is left exactly as entered. The **full precise address, postcode included, is never touched** — only the grouping city is cleaned, applied on enrich, roster-seed, the manual location editor, and the 623 import so seeds group correctly from the moment they land.

## Self-check

The atlas holds **89 venues: 88 approved, 1 pending** — that one pending row is Red Dog Southampton, correctly held back and flagged for a pin (not lost, not published broken). Bad coordinates: **1**, and it's **flagged** — no un-located venue is unflagged or live. There are **3 chain candidates** waiting for a "Build roster" decision (from your overnight enriching) and **0** chains stranded mid-flagship-pick. Everything preserved: the cheap single-pass enrich, the three-step chain flow, no auto-crowning, stable row order, cache revalidation, cost meter — and the write-permission guardrail still passes clean (25 write targets, 0 undeclared).
