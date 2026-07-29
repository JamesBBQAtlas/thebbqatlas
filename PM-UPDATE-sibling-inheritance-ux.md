# PM Update — Chain-sibling brand-fact inheritance + two Listings UX refinements

*"You're gonna need a bigger boat."* — Jaws. Turns out the siblings just needed a bigger dossier.

All three items, the founding-vs-opening-date fix, plus the Terry Black's reset are built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. Terry Black's Austin is sitting clean and un-enriched for a fresh end-to-end run.

## 1. Siblings now inherit the brand's facts (the fix that matters)

You nailed the diagnosis: Dallas, Waco and Lockhart came back thin because founding date, pitmaster, style, specialities and character are **brand-level** facts that belong to the parent, not each outpost — and the writer was right to refuse to invent them per-location.

So now, the moment a sibling is enriched, its dossier is **seeded with the parent's verified brand facts** before the writer ever runs: history/founding, pitmaster/owner, BBQ style, cook method, wood/fuel, specialities, price band, and brand character. The sibling's own (bounded) research is then pointed at one job only — *this* outpost's own facts: its address, hours, phone, opening date, and anything unique to that location. The writer composes fresh, unique copy per location = shared brand identity, seen through the lens of the specific branch ("the Waco outpost of…"), with its own opening and angle so no two blurbs read alike (§0 respected).

Crucially, the guardrail didn't move. The writer still won't fabricate — we've simply handed it real facts to work from. And **"needs attention" now fires only when the *location's own* facts are missing** (no address), never because brand-level facts are absent — those are inherited. A sibling with a valid address and inherited brand facts comes back rich and truthful, not "too thin." Cost stays ~$0.02/sibling (no extra searches; the parent's dossier is a free DB read).

If the parent hasn't been enriched yet, inheritance is simply a no-op and the sibling behaves exactly as before — no regressions.

## 2. The acted-on venue stays in view

Holding the raw scroll position wasn't enough: after an enrich the venue can **re-sort** to a new spot, leaving you staring at an unrelated row. Now the list anchors back to the venue you just acted on — scrolls it to centre and gives it a brief gold flash — so you're always looking at what you touched (and, for a chain parent, its sibling group sits right beneath it). Applies to enrich, rewrite, Find IG, publish/decline, and copy approve/discard.

## 3. Slim floating bulk-action bar

Select rows at the bottom of a long list and you no longer scroll back to the top to act. A **slim pill** floats at the bottom centre reading "**N selected · Enrich · Rewrite · Find IG**" (with per-batch cost estimates), and while a batch runs it becomes a compact progress + Pause/Stop control. It's deliberately a pill, not a banner — the list stays fully visible behind it, and the original top bar (with Select-all / Publish / Reject) is untouched.

## 4. Founding vs opening — no branch is "open since 2014" by accident

You asked whether the system knows which sibling is the original founding venue. It doesn't hard-label one as "the founder" — and deliberately so: the "parent" is simply the brand record we inherit from (for Terry Black's that's the Austin flagship, which genuinely is the 2014 original, but that's alignment, not a verified claim, and I won't have the system assert a founding order it can't prove).

What I did fix is the subtler trap hiding inside that question. The founding **year** is a brand fact, so it's inherited by every outpost — which is right for "the Blacks started this in 2014," but wrong if it makes a 2019 branch read as though it had been standing since 2014. So the dossier now carries two distinct dates: `established` (when the **brand** was founded — inherited by siblings) and `opening_date` (when **this specific location** opened — never inherited). The writer is now explicitly instructed to attribute a founding year to the business, and to use `opening_date` only for when a given branch actually arrived; if a branch's own opening date is unknown, it simply won't claim one. The flagship/original record, meanwhile, is told it *is* the brand's home and may write "where it all began." Net effect: shared brand heritage on every page, but honest per-location timelines — no accidental "since 2014" on a branch that opened last year.

## Cleanup — Terry Black's reset

Austin parent (`…072`) is back to a clean, un-enriched row: name reverted to **"Terry Black's BBQ"**, its original seed description restored, hook cleared, and cost / breakdown / dossier / pending / `chain_rostered_at` / sources all wiped — address (1003 Barton Springs Rd) intact. The four sibling rows (Dallas, Fort Worth, Lockhart, Waco) are deleted. One clean Terry Black's Austin, no siblings, ready for you to put the improved inheritance flow through its paces.

## What a fresh run should now look like

Enrich Terry Black's Austin → detect chain → scan roster (seeds Dallas/Waco/Lockhart/etc.) → auto-handoff enriches the flagship → enrich each sibling → **every outpost with a valid address returns rich, unique, truthful copy** carrying the shared Terry Black's identity plus its own location's specifics. No more "needs attention: no founding date" on a branch that simply inherits one.
