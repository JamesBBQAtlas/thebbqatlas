# PM Update — BUILDPROMPT09.1 (chain-enrichment refinements)

*"I love the smell of napalm in the morning."* — Lt. Col. Kilgore, **Apocalypse Now**. (Smells like burnt ends to me.)

All six chain fixes from the live Joe's KC test are built, type-checked, production-built, guardrail-passed, and pushed to `main` + `rebuild`. This was refinement, not redesign — the two-stage enrich pipeline is unchanged; we fixed the root cause and tightened the edges.

## What shipped

**1 — Instagram handle no longer blocks siblings.** Dropped the UNIQUE constraint on `restaurants.instagram_handle` (migration 031, applied and verified). Chain locations legitimately share one brand handle — every Joe's = `joeskc` — so the old unique index let only the first location save the handle and failed the rest. Kept a plain (non-unique) index for lookups. This was the real cause of the greyed-out Publish and the red errors.

**2 — Seeds are created once, from the parent only.** A sibling's enrich can never spawn new seeds now. Seeding is a shared helper with a global dedupe on brand name + location/city (case-insensitive) against every existing row for the brand — so re-running an enrich, or a roster scan, adds zero duplicates.

**2b — Chain roster gateway (opt-in, hard-capped $0.05).** When a parent enrich detects a chain, the hub shows a gateway: it surfaces the venue's own "Locations" page and offers a single bounded scan that reads that page, enumerates every branch, and creates deduped **$0** seeds. It's one click, never automatic, and it writes no marketing copy. If no locations page was found it falls back to one capped search; otherwise you can still add branches by hand.

**3 — The chain is signalled on the enrich result.** A banner now reads "**[Brand]** looks like a chain — **N** locations added below as seeds ($0 spent). Select which to enrich," and lists the seeded branches. No more silent seeding.

**4 — The search cap is now hard, in code.** Max 3 web searches per venue enforced at the API level (`max_uses` + `max_tool_calls`), not just requested in the prompt. The Leawood sibling that drifted to 6 searches ($0.0357) can't happen again — same bound on the sibling path.

**5 — Model label drift fixed.** We now read the model id back from each API response and price off *that*, via a model-keyed rate table. `enrichment_model` stores what xAI actually served (e.g. `grok-4-fast` vs `grok-4-3`) rather than a hard-coded constant, so the meter is self-correcting.

**6 — US English for US venues.** One line in the writer prompt: a US venue reads in US English ("gas station," not "petrol station"). UK/IE venues stay UK English.

## Cleanup (as authorised)

Joe's KC test duplicates removed — only the original parent remains (Kansas City, `…026`), reset to un-enriched and clean, ready for a fresh test run. Verified in the DB: unique index gone, non-unique index present, one Joe's row, parent un-enriched.

## Acceptance check

The parent's enrich result shows the chain banner with seeded locations listed; a sibling enrich stays within 3 searches / $0.04; `enrichment_model` reflects the model xAI actually returns; US venue copy reads in US English; siblings share the brand handle without error.

## Infrastructure — CI guardrail now live

We also closed out the DB write-permission guardrail as a GitHub Actions check, so the recurring "permission denied before RLS" bug class is now caught automatically on every push to `main`/`rebuild` and on pull requests (it can also be run on demand from the Actions tab). One snag surfaced and is resolved: the automated-deploy token was a fine-grained token missing the **Workflows: Read and write** permission, so it couldn't publish the CI file. James added that permission; a verification push from our side went through cleanly, confirming the pipeline can now manage its own CI. Branch hygiene is tidy again too — `main` and `rebuild` are aligned on a single commit.

## For the next live test

Re-run the enrich on the Joe's KC parent. You should see: the chain banner with its quick seed list, the roster-scan gateway pointing at their locations page, and — once you scan — the full branch roster as $0 seeds you can pick from. Then enrich a single branch and confirm it stays ≤ 3 searches and prices off the returned model.
