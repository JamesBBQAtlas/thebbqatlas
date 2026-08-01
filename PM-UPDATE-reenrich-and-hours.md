# PM Update — Re-enrich builds on what's there + a friendly hours editor

*"Waste not, want not."* — not a movie, just good sense, which is the whole point of this one: the operator's legwork now counts.

Both parts are built, type-checked, production-built, and guardrail-passed (28 write targets, 0 undeclared), live on `main` + `rebuild`. Nothing was reset, deleted, or auto-published.

## Part A — Re-enrich now USES the details & copy already on the listing

The old behaviour was wasteful: when a thin venue had a website, socials, or facts an operator had added by hand, hitting re-enrich started cold — it re-researched from scratch, ignored what was there, and could overwrite good operator-added info with something weaker. Now it builds on the operator's work.

**It gathers the current state as a "known facts" seed.** Before researching, it assembles everything already on the listing — website, Instagram, phone, address/city/country, hours, price, style — plus the existing description, and hands it to the researcher as *authoritative* context. The instruction is explicit: read the operator's website and Instagram **first** (they're the best sources we have), treat the known facts as true, fill gaps and enrich *around* them, and pull any facts the operator wrote into the prose — a chef's name, "cash only", "family-run since 1962", a second location, an event — out of the description and carry them forward so they survive the rewrite.

**Operator facts are authoritative, and disagreements are surfaced, not silently overwritten.** The operator's website, Instagram, phone, and hours win. If the AI research comes back with a *different* value for one of those, we keep the operator's and **flag the conflict** ("Research disagreed with your website — kept your value; please verify") so a human decides, rather than quietly clobbering their work. The copy writer is likewise told to preserve every concrete fact stated in the existing copy while re-voicing it to house style.

**Manual copy is respected without stalling the run.** Previously, re-enriching a hand-edited venue stopped and asked. Now it does the useful thing automatically: it enriches the *structured* gaps (hours, phone, socials, price, style) and leaves the hand-written description live and untouched — any fresh copy it writes is held in **pending changes** for the operator to review and approve, never dropped straight over their words. (An explicit "overwrite" path still exists for when they really want a clean redo.)

**The UX.** A "Use existing details & copy as sources" toggle sits in the hub, **default ON**, and applies to both single and batch enrich. After a run, the row tells the operator what was used — e.g. *"Draft ready · $0.02 · built on website, Instagram, current description"* — so they can see their effort counted. Untick it for a true from-scratch redo.

**Provenance & cost.** The run is logged to the AI usage ledger as usual (model, tokens, searches, cost), the content-audit note records what it was built on, and I added an `operator` source to the audit enum so the trail stays honest about human-vs-AI facts. Guardrails unchanged: never Google Maps data, and a human still approves before anything publishes.

One honest note on the search-count acceptance ("don't waste searches re-finding what we already had"): we established earlier that xAI exposes no parameter to cap the *number* of searches — the lever we have is the prompt. By handing Grok the operator's website/Instagram as read-first priority sources and marking the known facts authoritative, we steer it to read those before hunting the open web, which is the realistic mechanism for not re-finding what we already hold. It's a strong nudge, not a hard guarantee, and the per-run search cap (3) is unchanged.

## Part B — Opening hours: click-the-days editor + natural-text input

Editing `hours` as raw JSON is gone. The underlying jsonb shape is unchanged (so enrichment and the public display keep working), and there's now one **documented canonical shape** — each day is either `"Closed"`, `"24 hours"`, or one-or-more `HH:MM–HH:MM` slots — that the editor, the enrichment writer, and the public display all share.

Two friendly ways to set it, both writing that same structure. A **structured editor** gives seven day rows (Mon–Sun), each with a Closed toggle, an Open-24-hours toggle, and one or more open–close **time-picker** slots so split shifts (11:00–14:00 *and* 17:00–22:00) work, plus "copy Monday to all days" and "copy to weekdays" helpers. And a **natural-text box**: the operator types "Tue–Sun 11am–9pm, closed Mondays" or "Mon–Fri 11–3 and 5–10, Sat 12–11, Sun closed", hits Parse, and it fills the day rows for them to **eyeball and correct before saving** — it never silently commits a parse, and any line it can't read is flagged so that day can be set by hand. Both example strings parse correctly (verified). The public listing now renders hours grouped and human-readable — "Mon: Closed · Tue–Sun: 11am–9pm".

## Verify

Part A: add a website + Instagram to a thin venue and re-enrich → those links are handed to the researcher as read-first sources and the resulting copy reflects them; write "family-run since 1962" into the description and re-enrich → the fact is carried forward and used; re-enrich a `manual_copy` venue → the hand-written copy stays live and only structured gaps fill (fresh copy waits in pending). Part B: hours can be set entirely by clicking days + times including a split-shift day with no JSON in sight; the natural-text box fills the editor and only saves after confirmation; the saved jsonb matches the canonical shape and renders correctly. Type-check, production build, and the write-permission guardrail all pass clean.

## Preserved

Everything shipped still stands: the members view and content audit, submission-form anti-spam, enrich-in-queue, the roster dedupe stack, settlement normalisation, geocode-failure flag, three-step chains, thin-data publish block, full editability, tap-to-place pin, Find IG persistence, closed handling, cache revalidation, and the exact per-call AI usage ledger.
