# PM Update — Chain two-pass reliability + sibling guard + anchor fix

*"Why don't you make like a tree and get outta here?"* — Back to the Future. Biff got it wrong; our anchor now actually follows the tree wherever it lands.

All three fixes plus the Terry Black's reset are built, type-checked, production-built, guardrail-passed, and live on `main` + `rebuild`. Terry Black's Austin is reset to one clean un-enriched row, ready for a fresh retry.

## 1. The flagship two-pass now fires every time (the reliability fix)

You caught it exactly: the siblings got seeded but `chain_rostered_at` was never stamped, so the automatic pass-2 — which was gated on that flag being set via a client round-trip and a manual gateway click — never ran, and the flagship was left in its thin pass-1 state.

I've made the whole detect → seed → roster-stamp → pass-2 sequence **deterministic and server-side, inside the single enrich request**. When pass-1 reveals a parent to be a chain, the route now, in one motion:

- seeds the sibling locations,
- stamps `chain_rostered_at` immediately — its own step, right after seeding — so siblings are *never* left created-but-unflagged, and
- runs pass-2 (a focused fact-enrichment of the flagship's own facts) right there, using its rich result as the proposed copy.

No client hop, no gateway click, nothing to drop. If pass-2 itself fails, the flag is already stamped and the siblings are already seeded, and the API returns a clear "re-run Enrich to finish it" rather than silently committing the thin pass-1 copy — and because the flag is set, that retry takes the fast already-rostered path (one focused facts pass) and comes back rich. The accepted ~2× cost is reflected honestly (the per-run ceiling is doubled for a two-pass flagship so it isn't false-flagged), and the meter labels it "enrich (2-pass)". The old roster gateway still exists but is now *optional* — it only finds any extra branches beyond what pass-1 saw; it's no longer load-bearing for a rich flagship.

Net: enriching a chain flagship reliably ends with a rich parent, `chain_rostered_at` set, and sibling seeds — every time, no intermittency.

## 2. Guard — siblings can't be enriched until the flagship is rich

Since a sibling inherits the flagship's brand facts, enriching one while the parent is still thin/unenriched produces a thin outpost and burns ~$0.02 for nothing. So a sibling's Enrich (and Rewrite) is now **blocked until its parent is rich** — the "Enrich this location" button and the row's enrich/rewrite icons are disabled, with a plain amber note under the seed: *"Enrich the flagship first — this location inherits its brand facts."* If the action is somehow triggered anyway, it's stopped before spending and shows the same message. "Rich" means the flagship has been enriched and isn't flagged (a thin pass-1 flagship carries the attention flag, so it correctly doesn't count). Once the flagship is rich, siblings enrich normally.

## 3. Anchor now follows a re-sort to the very top

The earlier anchor missed the case you hit: after the enrich the chain group jumped to the top of the list while you were at the bottom, and the venue seemed to vanish. Two things fixed it — the re-sorted row (and its freshly-inserted sibling group) may not be in the DOM on the first frame, and a smooth scroll can be cancelled by the layout shift of the list reordering. So the anchor now **retries across several frames until the row is present, then jumps to it instantly** (not a smooth scroll that can be interrupted), centring it wherever it landed — top included — with the gold flash. The floating bulk-action pill is untouched, as you asked.

## Cleanup — Terry Black's reset

The Austin parent (`…072`) is back to a clean un-enriched row: name "Terry Black's BBQ", original seed description restored, hook cleared, cost / breakdown / dossier / pending / `chain_rostered_at` all wiped, address (1003 Barton Springs Rd) intact. Every sibling created this run (Dallas, Ft. Worth, Lockhart, Waco) is deleted. One clean Terry Black's Austin, no siblings.

## What a fresh run should now do

Enrich Terry Black's Austin → it detects the chain, seeds the branches, stamps the roster flag, and runs pass-2 on the flagship's own facts — all in that one action — ending with a **rich Austin flagship, `chain_rostered_at` set, and the sibling seeds present**. Repeat it 2–3× and it should hold every time. Then the siblings' Enrich unlocks (parent is rich), each inheriting the brand facts plus its own location specifics. And whichever venue you act on stays centred in view, even when it leaps to the top.
