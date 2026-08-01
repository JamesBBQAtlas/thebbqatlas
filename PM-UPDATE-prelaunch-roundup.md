# PM Update — Pre-launch round-up (ten fixes, one build)

*"Everything you see exists together in a delicate balance."* — The Lion King. Ten independent moving parts, none allowed to knock the others over.

All ten are built, type-checked, production-built, guardrail-passed (25 write targets, 0 undeclared), and live on `main` + `rebuild`. No venue was reset, deleted, or re-enriched — the hand-cleaned rows (Red Dog Hoxton, Bodean's Archer St, Dinosaur Syracuse, Pitt Cue's closed flag, Red Dog Southampton's pin) are untouched. One new column was added (`manual_copy`, migration 040); nothing else in the data changed.

## 1 — AI-assistance line

Confirmed gone site-wide (it was removed in the earlier build). A fresh search returns zero rendered occurrences on any page type, and the genuine legal notices are untouched.

## 2 — Find IG now saves the handle it finds

The handle **and** URL are persisted the moment one is found, regardless of post count — a 0-post account is still a valid link-out; only the photo embed stays hidden (copyright-safe). Just as important, the hub now reports what actually happened: it says "Instagram saved · @handle" only when a handle was really persisted, and "No Instagram found" otherwise — no more a cheerful "Found Instagram" while nothing was saved (the Moyo Shisanyama case). The IG ✓ lights up on the next render, and survives reload because it's real data now.

## 3 — Every field is hand-editable, and manual copy is sacred

The venue editor (the ✎ on each row) now edits **everything** — the hook and description as free text, plus name, address, city, country, socials, phone, hours, price band, BBQ style, offerings, and the featured/closed flags — and saves live through a new endpoint, revalidating the venue page, map and directory. Editing the copy marks the venue `manual_copy`; if you later hit Enrich on it, the system **stops before spending a cent** and asks whether to overwrite your words. Confirm and it regenerates; decline and your copy stands. Your words are never silently clobbered.

## 4 — Tap-to-place map pin

The editor now carries a real interactive map. Drag the pin, or tap anywhere (works on touch — the iPhone case), and the lat/lng fill in automatically. Nobody types raw coordinates anymore. "Save all" keeps the pin you placed; "Save & re-geocode from address" recomputes it from the address, and now falls back to the postcode alone when the full string won't resolve.

## 5 — Delete, remove-from-chain, attach-to-chain

From the editor you can **delete** a bogus row (with a confirm; if it had a live URL it 301s to the chain flagship, and a parent with branches is refused so nothing is orphaned), **remove** a wrongly-attached sibling from its chain, or **attach** an orphan to a chosen flagship (the Dinosaur Toronto case, now self-serve — pick the flagship from a dropdown and it's adopted as a branch with brand socials pre-filled).

## 6 — Featured toggle

A star on every row (and in the editor) flips `is_featured` in one tap and revalidates the homepage "Worth the Journey" block and the directory badge. A closed venue can't be featured — the control is disabled there.

## 7 — Permanently-closed handling, end to end

A "Mark closed / Reopen" toggle. A closed venue drops out of the map, the directory, Featured (its featured flag is forced off), the "nearby" suggestions, and the public spot count — all of which read through one function, so the exclusion is consistent by construction. Its own page stays live (no 404) with a clear "Permanently closed" banner and no check-in CTA, so it can anchor a future "Closed Legends" section. **Verified:** Pitt Cue is closed and unfeatured, and the public catalogue now counts 89 open venues rather than 90.

## 8 — Spend by provider

The Listings page has a new "Spend by provider" panel: Anthropic (Claude) versus xAI (Grok + search), all-time and today, plus venues enriched and total searches. The all-time **total** is exact (it's the cumulative per-venue cost); the provider split is derived from each venue's most-recent run and scaled to that total, and the panel says so in plain text — trustworthy to compare against the Anthropic and xAI dashboards without pretending to a precision the data doesn't hold. (Footnote for later: the provenance log doesn't yet store per-run provider costs, so a perfectly exact historical split would need us to start logging that — cheap to add when you want it.)

## 9 — Richer flagship copy

A chain flagship now gets a fuller write-up — roughly 5–7 sentences / 120–180 words — covering, where the research supports it, the origin, the people, the method and wood, what to order, and why it's the original. Same dry, warm, understated voice, just more story (not more adjectives). Siblings and standalone single venues stay deliberately concise, so the 623 import stays cheap and fast — only the flagship carries the long form, and it never pads or invents to hit a length.

## 10 — Thin-data venues can't publish filler

Two-sided. The writer is now firmly told never to invent specifics — no made-up menu items, opening years, pitmasters or awards — and to prefer honest brevity; when the research is genuinely empty (only a name and address), it flags the venue for review rather than fabricating a personality (the "Montreal BBQ Pit / maple-glazed ribs" case). And Publish now **blocks** a flagged venue: it won't go live with filler without an explicit operator override, so an obscure handle with little online presence is held for a human decision instead of quietly publishing an AI-invented listing. This directly protects the 623 import.

## Preserved

Everything from the last builds still stands: the city-only + street+150 m + geo roster dedupe, settlement normalisation, geocode-failure flagging, the three-step chain flow, no auto-crowning, the cheap single-pass enrich, slug redirects, IG/FB link-outs, cache revalidation and the cost meter. Type-check, production build and the write-permission guardrail all pass clean.
