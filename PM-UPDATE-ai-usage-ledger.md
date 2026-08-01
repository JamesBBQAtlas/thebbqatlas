# PM Update — Exact per-call AI usage ledger (before the 623)

*"What we do in life echoes in eternity."* — Gladiator. Or at least in an append-only ledger, which is the same thing for accounting.

Built, type-checked, production-built, guardrail-passed (26 write targets, 0 undeclared), rollup-math verified, and live on `main` + `rebuild`. No venue was reset, deleted, or re-enriched. The ledger is empty and armed — it will capture the 623 exactly, from the first venue.

## The ledger

A new append-only table, `ai_usage_log` (migration 041): **one row per AI API call, insert-only, never updated**. Each row records `created_at`, `provider` (anthropic / xai / whatever comes next), `model`, `task`, a generic `entity_type` + `entity_id`, `input_tokens`, `output_tokens`, `search_count`, the `cost` computed from real usage, and `usage_raw` — the raw usage block from the API response, so we can re-derive every figure if unit prices ever move. It's an internal ledger: RLS on, no policies, written and read only by the admin routes through the service-role client.

The schema is deliberately left easy to extend for the two futures you named: because `task` and `entity_type` are generic, a future non-venue AI feature logs to the same table and shows up in the same report with zero rework; and the per-call cost/token profile is exactly what a head-to-head provider comparison needs. The optional `latency_ms` and `outcome` hooks are noted in the migration but not built — as you asked.

## Every call now logs itself

A small `logAiUsage()` helper is wired at every AI call site, reading the **real** token and search counts off the API response — no estimation where an actual figure exists. It's best-effort: a telemetry write can never break the enrichment it's measuring. The coverage:

A full enrich writes **two rows** — one xAI/Grok research row and one Anthropic/Claude writer row — tagged `enrich`, or `flagship_enrich` for a confirmed flagship's fuller run. Find IG writes one xAI row (`find_ig`). A roster scan writes one xAI row (`roster`), logged whether or not it turns out to be a chain, because the search cost was incurred either way. Rewrite writes one Anthropic writer row. And the facts-sheet importer writes one Anthropic row per venue. Provider is read from the model id the API actually returned, so if a call falls back to a different engine the ledger still attributes it correctly.

## The panel is now exact

"Spend by provider" on the Listings page now sums the ledger directly through a server-side SQL rollup (`ai_usage_report()`), so there's no 1000-row API cap and no scaling. It shows exact **Anthropic vs xAI** totals all-time, today, and over the last 7 days, plus **by model** and **by task** breakdowns, venues enriched, total searches, and total AI calls. The old "derived from each venue's last run, scaled" caveat is gone — the panel now says, honestly, that the figures are exact and unscaled. The legacy per-venue derivation stays only as a silent fallback if the ledger were ever unavailable. Each venue's cumulative `enrichment_cost` on its own row is untouched — that remains the per-venue view; the ledger is the system-wide book.

## Verified

I exercised the rollup against synthetic rows mimicking one enrich (a Grok research row + a Claude writer row) plus a Find-IG row, and confirmed every number: all-time xAI \$0.03044, Anthropic \$0.0027, total \$0.03314, 5 searches across 3 calls, 1 venue enriched, with the by-model and by-task splits adding up exactly. Then I deleted the synthetic rows — the ledger reads zero, empty and clean, so the 623 is captured precisely from venue one. (I didn't run a live enrich to test, deliberately, to honor "no venue re-enriched" — the SQL exercise proves the same math without touching a venue.)

## Preserved

Everything shipped still stands: the city-only + street+150 m + geo roster dedupe, settlement normalisation, geocode-failure flagging, the three-step chain flow, the thin-data publish block, richer flagship copy, full editability, closed-venue handling, and cache revalidation. Type-check, production build, and the write-permission guardrail all pass clean.
