# PM Update — Enrich (and edit) a submission inside the Moderation Queue

*"Mind if I do a J?"* — The Big Lebowski. Or, in our case, a full enrich-edit-publish pass without ever leaving the couch. The review screen is now the whole workshop.

Built, type-checked, production-built, guardrail-passed (26 write targets, 0 undeclared), and live on `main` + `rebuild`. No venue was reset, deleted, or re-enriched — and I deliberately didn't touch the one real submission sitting in your queue; the tools are there for you to drive.

## The new flow

A submission card in Moderation → Submissions now carries the same tools as Listings: **Enrich** (research + house-voice copy), **Find IG**, the **✎ editor** (every field including the hook/description), and the **tap-to-place map pin** — all inline. The flow becomes review → enrich → check/edit → approve & publish, so nothing user-submitted goes live thin and you see the finished venue before it's public.

## How it works under the hood (reuse, not rebuild)

The clean approach you sketched is exactly what it does. The first time you press Enrich (or Find IG, or open the editor) on a submission, it's **materialised into a pending, non-public venue**, and from there the *normal* pipeline runs on it — the same enrich route, the same editor component (I exported the Listings `EditorPanel` and the queue reuses it verbatim), the same chain detection, dedupe, geocode-failure flagging, and the thin-data publish block. There's no duplicated enrichment logic; the queue just points the existing machinery at a pending venue and refreshes it after each action. When you're happy, **Approve & publish** flips that reviewed venue live and resolves the submission in one press.

## The guardrails you asked for

**Operator-triggered only.** A submission is never auto-materialised or auto-enriched. Materialising requires an admin and a deliberate button press, so a spammer hammering the public form can't trigger a cent of AI spend — the form stays a passive inbox until you choose to work an entry.

**Thin-data block applies here too.** If a submission is spam or a nonexistent venue, enriching it flags `needs_attention`, and Approve & publish is **blocked** — it won't go live without an explicit override confirmation, the same as Listings. So the form can't become a backdoor for AI-invented junk. A submission with no valid pin is likewise blocked until you drop one.

**Chain submissions behave normally.** If an enriched submission turns out to be part of a chain, the usual **Build roster** / **Set as flagship** affordances appear right on the card, and the branches land in Listings as they always do.

**Reject is unchanged** — it discards the submission outright, and now also cleans up the throwaway pending venue if one was materialised (only ever while it's still pending; it never touches a published venue).

## Verify

The card materialises → enriches → edits → pins → Find-IGs → approves-to-publish without leaving the review screen; a thin/spam enrich is flagged and can't publish without override; nothing is ever auto-enriched (materialise is a manual, admin-only step); and a chain submission surfaces the roster/flagship flow. Type-check, production build and the write-permission guardrail all pass clean.

## Note for later (not built)

You flagged a light spam/rate signal on the public form (honeypot / basic validation) as a future note — I've left that out as requested. Worth a small follow-up before you publicise the form widely, so the queue can't be flooded; happy to add a honeypot + minimal validation whenever you want it.

## Preserved

Everything shipped still stands: the roster dedupe (city-only + street+150 m + geo), settlement normalisation, geocode-failure flag, three-step chains, the thin-data publish block, full editability, tap-to-place pin, Find IG persistence, closed-venue handling, cache revalidation, and the exact per-call AI usage ledger.
