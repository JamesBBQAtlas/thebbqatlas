# PM Update — Chains done reliably: three boring steps, the human picks the flagship

*"Slow is smooth, and smooth is fast."* — the shooter's adage. We stopped asking one AI call to do everything and split it into three steps that each work every time.

Built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. The old single-call auto-chain path is **gone**, replaced by the flow below. I did **not** reset anything — Terry Black's is exactly as you left it (single clean Dallas seed, no siblings, no flags).

## Step 1 — Enrich = a plain, reliable single venue

Clicking Enrich now always does the trusted ~$0.02 single-venue pass: read the venue's own page, write house-voice copy, geocode, socials. **No chain detection logic, no roster, no flagship, no auto-crown.** Enrich Terry Black's Dallas → you get a complete, correct Dallas page, every time.

If the venue looks chain-like, it sets a **soft `chain_candidate` flag only** and shows a "Build roster" affordance on the row. It creates no siblings, picks no flagship, and never touches `chain_parent_id`. Nothing is crowned.

## Step 2 — Build roster from the brand's OWN /locations page

A separate, explicit "Build roster" button. This is where we spend the tokens you approved — reading the brand's official locations page **authoritatively** (search cap lifted to 8 so it reads the page fully, which is what kept missing Fort Worth / Waco / Lockhart), preferring the site's own list over open-web results. Every branch is created as a seed (name, city, address, canonical country), linked into the chain, in the **"flagship not set — pick one"** state. It claims nothing: no gold badge, no "where it all began", and the venue you started from keeps its own rich copy and simply becomes one member. New seeds insert in place under the chain (the no-resort anchor holds).

## Step 3 — Operator picks the flagship (one click)

Every member shows a "Set as flagship" control. Tapping it on the true original:

- makes that row the parent (`chain_parent_id = null`, `flagship_unset = false`, rostered);
- re-points every other member as a sibling and unlocks them;
- **pre-fills each sibling's Instagram/Facebook from the brand's known handles as editable defaults** (fill-empty — a sibling that runs its own account keeps it);
- then enriches the flagship via the trusted single-venue path (the client auto-runs it), so it reads its About/origin page and — only now, as a confirmed flagship — its copy may say "where it all began."

Then each sibling enriches for the usual ~$0.02, inheriting the brand story + socials (fill-empty, never clobber) and adding its own location specifics.

## Three loose bugs closed

1. **Hard search cap.** Removing the chain's extra passes from Enrich is what fixes the overrun — Step 1 is now just the bounded single-venue pass (pass-1 + at most one retry-on-thin), each handed only the *remaining* budget so it hard-stops at 6 total. The roster scan's larger budget lives in Step 2, where the tokens are approved and separate.
2. **Badge honesty.** The gold ⌂ FLAGSHIP badge now shows **only** on a confirmed flagship (`chain_rostered_at` set **and** `flagship_unset = false`). A chain in the "flagship not set" state shows the amber "flagship not set — pick one" state and never the gold badge. (The old `dossier.is_chain` path that lit gold on an uncrowned venue is removed.)
3. **Cost meter honesty.** Unchanged and preserved — the meter reads real searches/tokens from the API usage on every pass, never an estimate.

## Preserved (no regressions)

Bounded search budget, dedupe on physical address/geo, fill-empty merge (never clobber), country canonicalization on every write, on-demand cache revalidation (now also on Build roster), the no-resort anchor, the social brand logos, and the house voice.

## Walk-through to test (Terry Black's, as-is)

1. Enrich Dallas → clean rich single venue, ~$0.02, ≤6 searches, "Build roster" affordance shown, nothing crowned.
2. Build roster → all locations (incl. Fort Worth, Waco, Lockhart) appear as seeds, "flagship not set", no gold badge, nothing re-sorts.
3. Set Austin as flagship → Austin becomes the populated flagship parent (gold badge) and auto-enriches; the others re-point as siblings with brand socials pre-filled.
4. Enrich each sibling → rich, ~$0.02 each, ≤6 searches each, positions stable.
