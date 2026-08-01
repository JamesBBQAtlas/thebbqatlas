# PM Update — Chain branches inherit the flagship's style (never default to "Other")

*"You're gonna need a bigger boat."* — Jaws. Or in our case, a wider net: one leaky default was quietly labelling whole chains as "Other", so I closed every hole it could slip through.

Built, type-checked, production-built, guardrail-passed (28 write targets, 0 undeclared), and live on `main` + `rebuild`. No venue was reset, deleted, or re-enriched.

## The bug

A chain is one brand = one cuisine, but roster-created branches were being stamped with the hardcoded `style = 'other'` default, and enrichment wasn't correcting it — so Fogo de Chão's branches read "Other" instead of churrasco, La Cabrera's instead of asado, Rodney Scott's instead of carolina. You'd already fixed those three chains' rows by hand; this makes it stop happening at the source.

## The fix — every path that touches a branch's style

I closed all five code paths so no branch can end up on "Other" while its flagship carries a definite style:

**At creation.** When Build-roster seeds a branch (including a city-only seed), it now inherits the flagship's definite style instead of the "other" default.

**On enrich / re-enrich.** A venue with a chain parent now defaults to the flagship's style. Research only sets something else if it comes back with a *different, definite* style for that specific branch (rare for a chain), and "other" can never overwrite a flagship's definite style — so enriching a branch keeps its cuisine rather than resetting it.

**On attach.** Attaching an existing "other"-style venue as a branch of a chain now adopts the flagship's style.

**On set-flagship.** When you pick a chain's flagship, its definite style is pushed onto any branch still sitting on "other".

**On flagship style change.** If you change a flagship's style in the editor, the new style propagates to any branch still on "other" (the editor tells you "applied the style to N branches"), so the branches never end up contradicting the flagship. And the reverse is guarded too: you can't set a branch to "other" while its flagship has a definite style — it's coerced to the flagship's.

## Guardrails

Every style change lands in the content-audit trail, tagged as you asked — `roster` for the inheritance/adoption paths (creation, attach, set-flagship, flagship-change propagation) and `ai_enrichment` when set during an enrich. A human still approves before anything publishes; this only changes the default a branch *starts* with.

## Verify

Building a roster for a churrasco flagship gives churrasco branches, not "other"; enriching one of those branches keeps it churrasco; attaching an "other" venue to an asado flagship makes it asado; and — checked directly against the live data — **zero branches remain on "other" while their flagship has a definite style**, confirming both your manual fixes held and no other chain was silently affected. Type-check, production build, and the write-permission guardrail all pass clean.

## Preserved

Everything shipped still stands: re-enrich-builds-on-existing, the friendly hours editor, members view, content audit, submission anti-spam, enrich-in-queue, the roster dedupe stack, settlement normalisation, geocode-failure flag, three-step chains, thin-data publish block, full editability, tap-to-place pin, Find IG persistence, closed handling, cache revalidation, and the per-call AI usage ledger.
