# PM Update — Publish now refreshes the site · one chip per country · social logos + sibling socials

*"I feel the need — the need for speed."* — Top Gun. Publishing an edit now shows up on the very next load, not an hour later.

All three fixes are built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. Terry Black's is reset to the clean Dallas seed and the whole database's country names are canonicalised.

## Fix 1 — Publish/approve refreshes the live site (the blocker)

The read pages (directory, map, venue pages) were on a 1-hour time-based cache, so a publish didn't surface until the window rolled over — exactly the stale copy/coords/count you saw. Now the public reads of approved venues are behind an on-demand cache tag, and every admin action that changes live data busts it immediately: **publish/unpublish**, **approve pending changes**, **set-flagship**, **hero image**, and **venue create-as-published**. So on the next load the directory count, the card copy, the venue page, and the map pin all reflect the database — within seconds, no redeploy, no waiting on the hour. (A 1-hour refresh remains only as a background backstop.) The three missing Terry Black's siblings, the corrected Dallas copy, and its real coordinates will all appear on first load after publishing.

## Fix 2 — One canonical country name

Country was fragmenting — "USA" (32) vs "United States" (10) made two chips; "México" vs "Mexico" split another; and enrichment kept writing the long form, so it worsened as we enriched. Fixed at both ends: I migrated every existing row to one canonical English name (USA/U.S./America → **United States**, UK/Britain/England → **United Kingdom**, México → **Mexico**, UAE → **United Arab Emirates**, etc.), and every place enrichment, the roster scan, chain seeding and manual creation write a country now runs it through the same canonicaliser (accent- and punctuation-insensitive), so it can't re-split. The database now reads one "United States" (42), one "Mexico" (3), one "United Kingdom" (5) — clean chips, correct counts.

## Fix 3 — Social logos + chain sibling socials

Two parts, both done. The venue "Find them" section now shows the official **brand glyphs** (Instagram, X, Facebook, TikTok, YouTube) on each link instead of plain text — single-colour SVGs that tint with the button, used only to link out to the venue's own profiles. And chain **siblings now inherit the brand's Instagram/socials** the same way they inherit the brand story: a chain shares one handle (e.g. `terryblacks_bbq`), so a freshly enriched sibling carries the parent's Instagram/Facebook automatically — no more running "Find IG" per location for a handle we already have. (A sibling that genuinely runs its own account still keeps it; inheritance only fills an empty one.)

## Verify

- Publish an edit → directory count + card copy + map pin all show current data on the next load; no stale copy/coords; the missing siblings appear.
- Exactly one "United States" chip and one "Mexico" chip; counts add up.
- Social buttons show brand logos; a freshly enriched chain sibling carries the brand's Instagram/Facebook.
