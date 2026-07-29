# PM Update — Admin polish (green light before the 66)

*"I'm gonna make him an offer he can't refuse."* — The Godfather. The offer: five clean fixes and a verified re-enrich, so the big batch runs on solid ground.

All five polish items are built, type-checked, production-built, guardrail-passed, live on `main` + `rebuild`, and — where it mattered — verified on the live site and in the database. Details below.

## The fixes

**1 — Chain sibling stops looking like a seed once it's real.** The "Chain location · seed" badge and the big orange "Enrich this location" button now show ONLY while a sibling is genuinely an un-enriched seed (pending AND never enriched). Once enriched or published it renders like any other row — normal status, the standard small action icons. Verified live: Joe's KC · Olathe is Published and shows no seed badge and no big CTA.

**2 — People are greeted by their real name.** Root cause found: the profile-creation trigger stored `COALESCE(metadata.display_name, email-prefix)`, and Google supplies the name as `full_name`/`name` (not `display_name`), so every OAuth signup was saved as the email prefix ("jwdoyle"). Fixed the trigger to prefer the OAuth name fields, backfilled existing profiles (jwdoyle → "James Doyle"), and added one shared name resolver used by the welcome email — now "Welcome, **James**." (first name) — and the profile pages. So the whole app reads "James Doyle," never "jwdoyle."

**3 — The metrics tell the truth now.** "With real photo" (Hub) and the completeness "Real photo" bar are driven by a single `isRealPhoto` definition (`hero_source` ∈ user_upload / venue_provided / atlas_licensed), so they agree — both read 0 · 0% currently (honest: no real photos uploaded yet, all style-defaults). "Brands" now counts a chain by its parent identity (a parent flagged as a chain, its siblings, or a brands-table brand) and reads **2** — Joe's KC and Central BBQ — instead of 0.

**4 — The /submit address dropdown floats above the map.** It was stacking below Leaflet's map panes and getting clipped. Raised its z-index above the Leaflet stack, kept a solid opaque background, dismiss-on-select/outside-click, and deduped repeated geocoder hits by their visible label. Verified live: the suggestion list now sits cleanly over the map, fully legible, no clipping, no duplicates.

**5 — Cost reads per-run, not as a false breach.** The Hub row now shows the single-RUN cost separately from the accumulated total, so a venue enriched twice ($0.04 total) no longer reads as a per-run ceiling breach. (The listings query now also carries the cost breakdown and the dossier, which additionally powers the correct Brands count and the "part of a chain" preview note.)

## The green light: Joe's KC · Olathe re-enrich (verified end to end)

Confirmed in the database on a fresh enrich:

- **Full address:** "11950 South Strang Line Road, Olathe, KS 66062" — street, city, state, zip. The chain-sibling targeting fix landed exactly the branch's own address.
- **Search calls:** **2** (≤3 ceiling). The bounded budget held.
- **This-run cost:** ~$0.015 (Grok $0.0126 + Claude $0.0019) — comfortably under the $0.04 ceiling. Accumulated total across its runs is $0.0385, now shown separately so it can't be misread.

Everything the acceptance list asked for checks out. The batch of the remaining ~66 has a clean runway.
