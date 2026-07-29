# PM Update — Killed retry-on-thin; the honest truth about the search cap

*"You can't handle the truth!"* — A Few Good Men. You can, so here it is, straight.

Built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. Terry Black's is reset to the exact clean Dallas seed you specified (and nothing else was touched).

## Fix 1 — Retry-on-thin is gone (done, fully in our control)

`passes: 2, action: "enrich (retry)"` was our code firing a **second full research pass** because pass one looked thin — 2+ extra searches for the same short copy. Removed. The single-venue enrich now makes **exactly one search-enabled Grok call.** If pass one comes back thin, we hand what we have straight to the writer (which is in `alwaysWrite` mode) and it writes concise honest copy from the facts present — a thin venue getting three tight sentences, not a trigger for more searching. That alone removes the entire retry half of the 9 searches you saw.

## Fix 3 — Cost meter stays honest

Unchanged: the breakdown reads the real search/token counts from the API response. `total_searches` is the true number executed.

## Fix 2 — the search cap: what I could do, and the one thing I can't (please read)

You're exactly right that xAI exposes no parameter to cap the *number* of searches — I confirmed the same in our client: we call xAI's **Responses API with its server-side `web_search` tool**, and xAI runs that search loop **inside its own servers**. We never see or execute the individual searches, so there is no loop of ours to hard-stop at 4. `max_search_results` is already set to 3 (well under your suggested 8), but that caps results-per-search, not the count — and xAI bills per search, so it doesn't move the needle.

So the two levers I genuinely control, I've now pulled:

- **Number of search-enabled calls = structurally 1** (killed retry). There is no second pass to double the count.
- **Results per search = 3** (already minimal).

What I could **not** honestly deliver is your Fix-2 core — "our loop stops after 4 searches" — because *we have no loop*: xAI does the searching server-side, and there's no search provider wired for us to run it ourselves. Rather than ship a fake cap that would leak again, I'm flagging it. To make it a true structural stop, we'd switch the enrich to a **client-executed search loop** — we run each search and cut it off at 4 — which needs one of:

1. **A search provider key** (Tavily / Brave / SerpAPI — all have free tiers). We add the key, I run the loop and hard-stop at 4. Cleanest true cap. ~30 min once a key exists.
2. **An xAI-search-per-step executor** (we call xAI once per query and cap at 4 calls) — no new key, but more model calls and I'd want to verify it against the live keys before trusting it.

I can build either the moment you say which — and I'd want to test it against the live XAI/Claude keys (this sandbox runs the build with AI off, so I can't exercise the enrich here; that's why I won't ship an unverified rewrite of the core research path blind).

## What to expect from THIS build in the meantime

Killing the retry pass should drop you from the 9-search / $0.053 run into roughly the **3–5 search, ~$0.02–0.03** range in one pass — likely at or near your target, just not *guaranteed* by structure until we add the client-side loop above. If a single pass ever does run hot, the meter reports it honestly and the ceiling flag remains only as a backstop (it won't fire on a normal single venue).

## Preserved (no regressions)

Single uncrowned row + chain detected-not-acted (soft flag + "Build roster"), the protected `alwaysWrite` writer (copy never empty), Step 1 never opening `/locations` or enumerating the chain, dedupe, fill-empty merge, country canonicalization, cache revalidation, no-resort anchor, social brand logos, the Grok-researches → Claude-writes split.

## Reset (the only one, as authorized)

Terry Black's `…072` set to exactly: name "Terry Black's BBQ", Dallas, United States, 3025 Main St, description "Family pit with beef ribs, turkey, and sausage.", all flags/enrichment/socials cleared, one uncrowned row, no siblings. No other venue was touched.

## Verify

Re-enrich Dallas → `passes: 1` (no retry), non-empty house-voice copy, one uncrowned Dallas row with the "part of a chain — Build roster" flag. Search count should land in the 3–5 range; tell me the number you see and, if you want it *structurally* pinned at ≤4, which of the two options above to wire.
