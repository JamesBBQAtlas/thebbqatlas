# PM Update — Admin enrichment fixes (from live batch testing)

*"Houston, we have a problem."* — Apollo 13. A few, actually — surfaced during James's live batch enrichment. All patched and back on course. Everything below is built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`.

## What this round fixes

These came out of running a real batch enrich across a spread of venues (Joe's KC locations, Smoke & Fire Oaxaca, Central BBQ, Carnivore, Cozy Corner and more), so they're the rough edges you only find by driving it hard.

**1 — "Needs attention" now explains itself.** Before, a venue could show "Attention" with no copy and no reason — you couldn't tell what was wrong. The cause is that some venues genuinely don't have enough verifiable facts on the open web for the writer to produce honest copy (it correctly refuses to invent). Now, when that happens, the exact reason is shown — an amber note on the row *and* inside the Preview ("Dossier too thin — missing address, hours, phone…"). No more mystery flags.

**2 — No blank copy, no empty "pending changes."** The real bug behind the blank proposed page: when the dossier was too thin, the old code still wrote *empty* copy as a pending change. So the preview looked blank and there was nothing meaningful to approve. Now a thin result never blanks existing copy and never creates an empty pending-change — it just carries the attention flag, and a later clean re-run clears that flag automatically.

**3 — Chain locations research the right thing.** A chain sibling (e.g. Joe's KC · Olathe) was coming back thin because, starting from an empty address, the researcher spent its bounded budget re-establishing "this is a chain" instead of finding the branch's own facts. Now a sibling's enrich names the specific branch and hands the researcher the parent's website to start from — so it goes straight for that location's address, hours and phone. Re-enriching an affected sibling should now succeed.

**4 — The stuck "Working…" spinner is fixed.** After approving pending changes, the row could spin "Working…" for many minutes even though the change had already published — it only stopped on a full page reload. The approve/discard handler was refreshing the data but never resetting that row's spinner state. It now clears the instant the change succeeds (with a brief "Changes approved ✓"), and handles a dropped connection cleanly. Every other spinner path was audited too — this was the last one.

**5 — A safety timeout on slow calls.** Enrichment (research + writing) is genuinely a minute or two per venue, and a batch runs one at a time — that's expected, not stuck. But to guard against a truly hung request, enrich/rewrite calls now have a client-side timeout that surfaces a clear "timed out — try again" instead of spinning forever.

## A note on cost and speed

Grok's searches are quick, and nothing here slows them down. The only search-related change was making the **cost meter** count actual search *calls* rather than *sources returned*, so the per-venue dollar figure reads true — no behavioural change. The hard 3-search / $0.04 ceiling per venue is unchanged. If thin dossiers ever become common on venues that clearly *should* have findable facts, the lever is a small bump to that search budget (a few tenths of a cent more per venue) — flag it and we can tune it.

## Housekeeping

A couple of venues touched during testing still carry the *old* empty pending-change or thin state in the database. The new code won't recreate it, but those specific rows won't self-heal — a quick Discard or a re-enrich clears them. Joe's KC · Olathe in particular is worth a fresh re-enrich to confirm the chain-sibling fix end to end.
