# Chain Discovery v2 — engineering notes + fixture tests

**Part 1 of the consolidated batch.** Rebuilds the chain/locations finder into a
general engine that reads a chain's full location set from the chain's **own**
website, with zero chain-specific logic.

## How it works

`app/api/admin/venues/chain-roster/route.ts` orchestrates:

1. **Step 0 — resolve the site (Grok, demoted).** From whatever the parent row
   has (name / Instagram handle / city), `resolveChainSite()` finds the official
   website + canonical brand name. Grok is used ONLY to find the site — never the
   location list. Aggregators/social/directories are rejected; a domain is never
   guessed. The resolved site + name upgrade the (possibly stub) parent row in
   place (§7.2 — no clone).
2. **Steps 1–4 — `lib/admin/chain-discovery/engine.ts`.** Finds the locator page
   (nav/footer links + common-path probes), detects the source type at runtime
   and parses the **real DOM/JSON** (never readability):
   - `parseJsonLd` — schema.org LocalBusiness/Restaurant PostalAddress (cleanest);
   - `parseInlineJson` / `parseLocatorJson` — a store-locator JSON payload
     (Yext/Storepoint/etc. shapes, provider-agnostic);
   - `parseFlatDom` — cheerio DOM parse of a flat locator (microdata, `<address>`,
     location cards);
   - hierarchical crawl — follows region→city→leaf gateway links to the leaves.
3. **Country + guard — `country.ts`.** Anchors the country from the site TLD,
   else the majority of the addresses (never defaults to US). The geocode
   **write-guard** in `chain-seed.ts` rejects any pin whose geocoded country ≠
   the declared country (`lat/lng = 0`, `needs_attention`).
4. **No invented branches — `normalize.ts`.** A candidate is only seeded if it
   has a real street address; city-only / "coming soon" / closed are skipped.
   Every seeded pin stores its `source_url`.
5. **Step 5 — `seedChainLocations`.** Idempotent dedupe (street key + geo
   proximity) means a re-run converges, never clones.

No cap anywhere. Grok's old location-listing role is retired.

## Admin UX (§6)

- The batch cost-confirm is now a **centred overlay** (was an off-screen inline
  banner — the phantom "20 cap"); confirm and the whole selection runs.
- **Header select-all** checkbox with an indeterminate state.
- **"Show all N on one page"** toggle for large chains/catalogues (a chain's
  branches already ride with their flagship as one unit, so they never split).

## Known limitations (honest)

- **Headless fallback is graceful, not active.** A purely JavaScript-rendered
  locator (no server HTML/JSON) yields no candidates and flags `needs_attention`
  rather than launching Chromium — standard Vercel serverless can't run headless
  Chromium. JSON-API + flat + hierarchical cover the fixtures and most chains.
- **Very large chains (>~200 fetches).** Discovery runs in one 300s function with
  a ~190s crawl budget; beyond that it returns a **partial** result (what it
  found is seeded) and asks you to re-run. A fully resumable background job is a
  follow-up if a real chain needs it.
- **Flagship** is left `flagship_unset` for the operator to crown (the spec's
  sanctioned fallback); automatic flagship detection is a later refinement.

## Fixture tests (run on the deployed admin — the build sandbox can't reach live sites)

1. **Rudy's (flat HTML, read-only).** On the existing Rudy's parent, run
   *Discover locations*. Expect all locations from the official page (not the old
   ~11), full addresses, correct country. It should reconcile, not duplicate.
2. **Mission BBQ (hierarchical, live from the stub).** On the bare `missionbbq`
   seed (name "missionbbq", no website): run *Discover locations*. Expect it to
   resolve the official site + name, crawl region→leaf, and seed every current
   location with correct addresses/country — the count matching whatever the site
   shows now. The stub upgrades into the brand parent (no duplicate).
3. **Third Wave BBQ (international).** Run discovery. Expect only real branches,
   correct country (Australia), geocoded in-country, **zero invented venues**;
   the write-guard rejects any cross-country pin.
4. **Unseen chain (the real bar).** Pick any regional BBQ chain not named here and
   run it cold — it should find the full, correct list from its own site.

Report back the counts + anything flagged `needs_attention` and I'll tune.

## Unit tests

`node_modules/.bin/tsx scripts/test-chain-discovery.mts` — 29 assertions over the
parsers, country anchoring, the street-address guard, and dedupe keys (pure, no
network). All green.
