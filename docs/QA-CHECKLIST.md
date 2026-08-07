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

## 7. Monetisation / Stripe (Phase 5)

- ☐ Consumer premium checkout appears only when Stripe is fully configured.
- ☐ **Featured listing funnel (5.1):** claim a venue → approve the claim → the
  owner sees "Upgrade to Featured" on the venue page → checkout with test card
  `4242 4242 4242 4242` → after payment the "Featured · Verified owner" badge +
  featured placement appear, and a receipt email arrives.
- ☐ Cancelling the Featured subscription clears `is_premium` (badge/placement drop
  at next revalidate); admin-set `is_featured` venues are unaffected.
- ☐ FTC affiliate disclosure shows on WRL + guides; no phantom `href="#"` links.

## 8. Venue report (Phase 5.2)

- ☐ **Owner report:** on a venue you own, the "Your venue report" card shows
  profile views / search / clicks / saves / check-ins with month-on-month deltas;
  non-owners never see it.
- ☐ Monthly email (1st of month) reaches owners of venues with activity; zero-
  activity venues are skipped; no duplicate within a month.

## 9. Subscribers & lifecycle

- ☐ **Admin Subscribers** (`/admin/subscribers`): Subscribed vs Unsubscribed
  counts, reach, newsletter-only; searchable list + CSV export.
- ☐ Subscribe via the footer → a "become a member" welcome arrives (skipped if the
  email already has an account).
- ☐ Non-member subscribers get day-1/3/7 conversion emails; the drip stops on
  register or unsubscribe; no duplicates on cron re-run.
- ☐ New signups default to marketing opt-in (passive notice, one-click opt-out);
  the 6 existing members were backfilled (James-confirmed).

## 10. Admin housekeeping

- ☐ **Change Log** (`/admin/audit`) now reflects manual edits + moderation +
  roster changes (not just AI enrichment).
- ☐ **News admin** (`/admin/news`): the Truth post is published; drafts editable +
  publishable.
- ☐ Deep-link files return 404 until the native env vars are set (AASA /
  assetlinks.json) — expected pre-launch.

## 8. General mobile pass 📱

- 📱 ☐ Map bottom-sheet, drop-a-pin submit, and the WRL cards on a real phone
  (the one check that most needs real fingers).
- 📱 ☐ Mobile nav drawer opens fully (not clipped by the hero) on tablet + phone.

---

## 11. Reviews (#315 — no stars, moderated)

- ☐ On a venue page, signed-in members can post a **written** review (no star
  rating anywhere); it goes to moderation and shows a "pending" confirmation.
- ☐ Signed-out visitors are prompted to sign in when they try to post.
- ☐ Approving a review in the Moderation Queue makes it appear on the venue page;
  `review_count` reflects the number of approved reviews.
- ☐ Re-submitting edits the existing review and returns it to the queue (one per
  member per venue).
- ☐ Native/API: check-in / save / bookmark / review all work with an
  `Authorization: Bearer` token (Phase 8d), not just a web cookie.

*Maintained by Build. Add rows as features ship; mark ✅/⚠️ as testers report back.*
