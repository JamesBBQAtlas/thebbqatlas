# The BBQ Atlas — Beta / QA test checklist

A living list of what to check and test, built up as features ship. Intended for
the PM update after Phase 8 and for the beta testers. Grouped by area; each item
says **what to test** and the **expected** result. Items marked 📱 specifically
need a real phone (the on-device pass Fable/desktop can't do).

Legend: ☐ untested · ✅ verified · ⚠️ issue found

---

## 1. Watch, Read & Listen (Phase 6)

- ☐ **Watch cards lead with the latest video.** Each YouTube channel card shows a
  sharp 16:9 thumbnail of its latest upload with a play overlay; the channel logo
  is a small round chip beside the name + subscriber count. No stretched/distorted
  images, no layout shift on load.
- ☐ **Channel avatars render** (not blank). The chip image loads (this was the
  ggpht/no-referrer fix).
- ☐ **In-page Subscribe works.** The Subscribe control on each Watch card either
  shows the official YouTube widget (with live count) or, as fallback, opens
  YouTube with the subscribe prompt. Clicking it does not slow the page on load.
- ☐ **Episodes We Love** strip appears on the Watch tab, separate from the channel
  grid, each a 16:9 play card crediting its channel. (Add one via admin first.)
- ☐ **Read tab** — book covers show (no placeholders for books that resolved);
  "View on Amazon" carries the affiliate tag.
- ☐ **Listen tab** — 5 podcasts including **Under Seasoned BBQ Show** (AU);
  platform pills (Apple/Spotify/Deezer/etc.) are brand-coloured and open correctly.
- ☐ **Pitmaster X** card resolves (channel pinned by id, not the dead @handle).
- 📱 ☐ **Mobile WRL** — cards, tabs, thumbnails and Subscribe all usable on a phone.

### WRL admin
- ☐ **Add a video by URL.** Paste a YouTube video URL → it validates + auto-fills
  title/channel/thumbnail/duration → save → it appears in Episodes We Love.
- ☐ **KPI header** shows per-kind published/draft counts and top items by clicks
  (30 days) once there are outbound clicks.
- ☐ **Sub-nav + search** — filter tabs (All/Watch/Episodes/Read/Listen) and the
  search box narrow the list; no endless scroll.
- ☐ **Click tracking** — after clicking a few WRL links, the KPI "top by clicks"
  reflects them (deduped; one click per item per session per 30 min).

## 2. Venue featured video (Phase 6.7)

- ☐ **Truth BBQ** (`/restaurants/truth-houston`) shows a **Featured video** block:
  thumbnail + play button; the player loads only on click; a "Watch on YouTube"
  link is present. City reads **Houston** (not a neighbourhood).
- ☐ **Admin featured-video field** (venue editor) — paste a YouTube URL → validates
  (rejects non-embeddable) → saves; empty + save clears it. *(Re-saving Truth via
  this field fills the title/channel/thumbnail, currently null.)*
- ☐ **Truth news post** — currently a **draft**. Once approved/published, it shows
  the embedded video and a working "See Truth BBQ on the Atlas →" link.

## 3. Enrichment city fix (High-priority bug)

- ☐ **Re-enrich a venue submitted with a correct city** (e.g. Houston) → the city
  and slug stay correct; a geocoder neighbourhood label never overwrites it.
- ☐ **Backfill clean** — `node scripts/audit-nontown-cities.mjs` reports no venue
  with a neighbourhood/POI/region city. (Was clean at ship.)
- ☐ Spot-check real towns still resolve: Kansas City, Fort Worth, St. Louis, New
  York, London boroughs.

## 4. Admin listings pagination (Medium)

- ☐ **50 per page** — the listings table renders ~50 top-level venues; paging shows
  the rest. Noticeably snappier typing/filtering on the full catalogue.
- ☐ **Filters/sort/search** operate across the whole catalogue, then page; changing
  any of them snaps back to page 1 and never leaves an out-of-range page.
- ☐ **Chains not split** — a flagship and its children always sit on the same page.
- ☐ **Select all is page-scoped** — the button says "Select N on this page"; the
  "Select all N filtered" escape hatch only appears with >1 page. A mis-click can't
  enqueue an enrich run over the whole catalogue.
- ☐ **Top KPIs unchanged** — still computed over the whole catalogue.

## 5. Public data contract (Phase 8a)

- ☐ **No internal-column leak** — reads via `public_venues` / `getPublicVenues()`
  return only public fields (no dossier, enrichment cost, contact email, outreach,
  attention reason, etc.). (Verified at the DB view level; re-check if a native app
  or public API path is added.)

## 6. Phase 7 — polish / a11y (needs human eyes)

- 📱 ☐ **≥44px touch targets** — sweep small controls on a phone (a few were
  28–40px); anything too small to tap comfortably, note it.
- 📱 ☐ **Map delight** — fly-to on select feels good; the preview card doesn't
  cover the selected pin; hover/empty states considered; reduced-motion respected
  if you enable it in OS settings.
- ☐ **Voice** — no generic-foodie phrasing ("unlock the good stuff" etc.). Flag any
  copy that reads off-voice.
- ☐ Heading font is **Zilla Slab** everywhere (decided — cowboy/BBQ).

## 7. Monetisation / Stripe (Phase 5 — when built)

- ☐ Premium checkout appears only when Stripe is fully configured (secret key +
  publishable key + price id + webhook secret). Test a checkout end-to-end in test
  mode before live.
- ☐ Subscription state reflects after purchase (saved-spots map, ad-free, etc.).

## 8. General mobile pass 📱

- 📱 ☐ Map bottom-sheet, drop-a-pin submit, and the WRL cards on a real phone
  (the one check that most needs real fingers).
- 📱 ☐ Mobile nav drawer opens fully (not clipped by the hero) on tablet + phone.

---

*Maintained by Build. Add rows as features ship; mark ✅/⚠️ as testers report back.*
