# PM Update — Research targeting: read the About/story page, not a location stub

*"I have not failed. I've just found 10,000 ways that won't work."* — Edison. The research now stops finding the one way that doesn't: reading a thin `/austin` stub and calling it done.

All five parts of the fix plus the (now truly clean) Terry Black's reset are built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`.

## The root cause you found

You nailed it from `enrichment_sources`: the thin run consulted exactly one URL — `terryblacksbbq.com/austin`, the location landing page (address + hours, no story) — while the rich run had hit the About/homepage where the founding, pitmaster, method and specialities actually live. Whether an enrich came back rich or thin was luck of which page Grok happened to read, and chains lose that lottery more often because their per-location pages are thin stubs by design.

## The fix

**1 & 2 — Steer research to narrative pages, chain-aware.** The researcher prompt now spells out *where each fact lives*: brand-story facts (founding, pitmaster, cook method, wood/fuel, specialities, character) come from the About / Our Story / History page or the homepage; this location's address/hours/phone come from its location page. It's told explicitly that a per-location stub must never be the sole source — if the first hit is a `/location` page, it has the address, and it must then open the About/homepage before setting the story fields null. For chains it's instructed to read *both* the brand About page (for the inherited brand facts) and the specific location page. The flagship's pass-2 note now names the About/Our-Story/History page directly.

**3 — Retry-on-thin, within the ceiling.** After a venue's own research, if the dossier still lacks the core anchors (founding / pitmaster / method / specialities), the route fires **one** more targeted search — pointed at the site's About/Our-Story/History page and root domain — and fills only the still-empty story fields, never overwriting good facts or touching the location's address/hours. There's headroom because the two-pass ceiling is already doubled. This runs for parents and standalone venues; siblings inherit their brand facts, so they skip it.

**4 — Record every consulted URL.** `enrichment_sources` now captures the URLs from *all* passes — pass-1, the flagship's pass-2, and any retry — deduped, so a future thin result is diagnosable at a glance instead of showing one lone stub. The response also reports `retried_thin` and a `sources_count`.

**5 — Honest flag kept as the true fallback.** The "needs attention / refuse to invent" behaviour is untouched — it now fires only when the About/story genuinely can't be found, not because the research happened to read a thin stub first.

## Cleanup — a genuinely clean Terry Black's

You were right that the last reset left a confound: the parent still had `website = terryblacksbbq.com/austin` (the very stub that caused the thin run) and a populated Instagram. This reset clears them too — website, instagram_handle/url, posts, and `enrichment_sources` — alongside the usual cost/dossier/pending/rostered wipe and the seed revert (name "Terry Black's BBQ", seed description, address kept). All siblings deleted. So the Austin row now starts from just its name and address — a true from-scratch run where Grok discovers the site itself and should land on the homepage/About, not a stub we pre-seeded.

## Acceptance to watch

Enrich Terry Black's Austin 2–3× in a row: each should come back rich (founding, pitmaster, method present — because it reads the About/story page or retries to it), detect the chain, set `chain_rostered_at`, and leave `enrichment_sources` listing multiple URLs including a story/about page. No "too thin" on a venue whose site has an About page.
