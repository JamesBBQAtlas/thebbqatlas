# PM Update — Easter Eggs batch (Eggs 6–11, all live) + a mobile-map fix

*"You're gonna need a bigger boat."* — Chief Brody, **Jaws**. We needed a bigger map. Six new eggs are hidden in it — and the Jaws line landed so well it's now one of them.

All six map search-box eggs are built, type-checked, production-built, and live on `main` + `rebuild`. Every one is client-side only, ephemeral, and a **words-only** allusion — the markers are all our own original artwork, with no character images, likenesses, show artwork, or copyrighted audio anywhere. Nothing touches the venues dataset, sitemap, JSON-LD, SEO, or Core Web Vitals; they only instantiate when triggered.

## Mobile map fix (shipped alongside)

Spotted on mobile: the search lives inside the full-width Filters panel, and after typing a name and hitting Enter the map didn't reappear — you were left on the panel. Fixed. Hitting Enter now takes you straight to the map: if what you typed matches a venue by name, it jumps to that venue and opens its card; a city/country search flies there and reveals the map; and the eggs reveal the map on mobile too. No more getting stuck on the filters screen.

## What's hidden (type these into the /map search box)

**Egg 6 — "smoke me a kipper"** (Red Dwarf / Ace Rimmer). A slow cinematic flight to historic Billingsgate with an original kipper marker and a card that names Ace Rimmer in text — "what a guy" — plus a second link that flies you on to Craster, Northumberland, the real home of the kipper. Both card copies are the approved wording, verbatim.

**Egg 7 — "bionic" / "jaime sommers"** (Bionic Woman — the Muse's egg). A deliberately *superhuman-speed* pan to the quarry outside Vancouver, an original star-spark marker, and the variant-B card carrying the small **⭐👼 "Blessed by Michelle Ryan herself"** seal (original mark, no likeness). The quarry is now pinned to the exact spot James supplied — **Pitt River Quarries, Pitt Meadows BC** — so the placeholder is gone.

**Egg 8 — "cookpassbabtridge"** (Alan Partridge). Flies to BBC Radio Norwich at The Forum, original broadcast marker, deadpan card. Ah-ha.

**Egg 9 — "back of the net"** (Alan Partridge, doubling as a Surprise-Me). Picks a **random real published venue**, flies to it, opens its card, and flashes a "Back of the net!" toast. It only ever lands on a genuine published venue — never a seed or draft.

**Egg 10 — "cracking owl sanctuary"** (Alan Partridge deep cut). Flies to **Fritton Owl Sanctuary** in Norfolk — the real one James named — with an original owl marker and the deadpan card: sometimes a man just needs to look at an owl.

**Egg 11 — "jaws" / "amity island"** (new — born from this very update). Flies to **Martha's Vineyard, Massachusetts** — the real-world Amity Island where the 1975 film was shot — with an original **blue grinning-shark** marker (toothy mouth and all) and a deadpan card: a mechanical shark, the mayor's well-smoked re-election campaign, and a recommendation to eat the brisket "on dry land, facing the exit." Words-only allusion, our own art.

## The details that keep them safe

They reuse the existing Pit Zero search-box intercept, so they behave exactly like it: the marker and card appear only on trigger, clear the moment you run another search or close the card, never persist into filters, and don't break the "keep my map view on Back" behaviour. All animations respect reduced-motion. Copyright stays clean throughout — the nods live entirely in the words.

## Coordinates, all locked

- **Bionic quarry** → Pitt River Quarries, Pitt Meadows BC (49.28647, -122.65856). Done.
- **Owl sanctuary** → Fritton Owl Sanctuary, Norfolk (~52.543, 1.639) — village-level precision, right for a zoomed cinematic landing.
- **Jaws** → Martha's Vineyard, Massachusetts (41.417, -70.553, the "Jaws Bridge" beach).

## How to try them

On `/map`, type any of: `smoke me a kipper`, `bionic`, `jaime sommers`, `cookpassbabtridge`, `back of the net`, `cracking owl sanctuary`, `jaws`. (Pit Zero — `pit zero` / `lowandslow` — still there too, with Basil the fox.) On mobile, just hit Enter and the map comes straight up.

One note for the record: the on-card wording for the Bionic seal is the approved variant-B line. If Michelle would prefer her name not appear in body text, it's a one-line change to keep the ⭐👼 mark as the seal only — just say the word.
