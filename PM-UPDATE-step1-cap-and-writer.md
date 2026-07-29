# PM Update — Step 1: stop hunting the chain, protect the writer

*"Keep it simple, stupid."* — Kelly Johnson. Step 1 now researches one venue and one venue only, and the writer always gets its turn.

Built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. The structural half you fought for is untouched, and I did **not** reset or modify any venue — Terry Black's is the clean Dallas seed you left.

## The root cause (Bug 3) — Step 1 was still hunting the chain

Seven searches in a single pass is the tell: Step 1's research prompt was still asking Grok to enumerate the chain's other locations and hunt for the "original/flagship" — exactly the multi-page expedition the three-step rewrite was meant to remove. That burned the budget, tipped the ceiling, and starved the writer.

Fixed at the source: the Step-1 research prompt is now **strictly single-venue**. It reads THIS venue's own site (homepage + About/story, its own contact/location page, Instagram) in ~2–3 searches and stops. Chain awareness is now a **cheap signal only** — it sets `is_chain` and grabs the `/locations` URL *if that link is already visible on a page it read*, but it does NOT open that page, enumerate branches, or identify an original. `chain_locations` is always empty and `flagship_location` is always null in Step 1 — the real enumeration belongs to Build roster, and the flagship to the human. So a plain venue costs ~$0.02 again, and the "Part of a chain — roster available" flag still appears.

## Bug 1 — the search cap

With the chain-hunting removed, there's no longer a task that *demands* extra searches, so a single-venue pass sits at ~2–3 (the prompt hard-limits to 3, and any retry-on-thin is handed only the remaining budget, so the total is bounded to 6). The honest note: the search loop runs server-side inside one Grok call, so the real enforcement is removing the *cause* of the extra searches (the chain expedition) rather than aborting Grok mid-call — which is why this was leaking past the requested cap before. The cost meter still reads real API usage, and the runaway/ceiling flags remain only as a backstop that a normal single venue won't trip.

## Bug 2 — the writer is now protected and non-negotiable

`claude_out_tokens: 94` meant the writer ran but *refused* — it returned a short "too thin" note instead of copy, because the starved research handed it almost nothing. Two changes: the writer now always runs after research on whatever facts were gathered (it was never skipped, but the thin dossier made it bail), and it runs in a new **alwaysWrite** mode on the enrich path — it MUST return a hook and a 2–3 sentence house-voice description from the facts present, and may not return "needs attention" or empty. It still never invents a fact; it simply says less where facts are missing. A completed single-venue enrich can no longer come back with empty copy. (With the single-venue research now feeding it a proper dossier, that mode rarely has to do heavy lifting anyway.)

## Preserved (no regressions)

The no-crown / no-phantom-sibling behaviour, the chain-detected-not-acted flag, dedupe, fill-empty merge, country canonicalization, cache revalidation, the no-resort anchor, the social brand logos, the Grok-researches → Claude-writes split, and the honest cost meter — all intact.

## Verify

Re-enrich Dallas: expect ~2–3 searches (≤6), ~$0.02, no cost-exceeded flag, and non-empty Claude-written house-voice copy with output tokens back in the ~400–500 range (not ~90) — still one uncrowned Dallas row with the "part of a chain" flag set and a "Build roster" affordance.
