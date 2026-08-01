# PM Update — Admin Members view + Content audit log

*"I love it when a plan comes together."* — The A-Team. Two builds this round: one to see who's showing up, one to remember everything that changes.

Both are built, type-checked, production-built, guardrail-passed (28 write targets, 0 undeclared), and live on `main` + `rebuild`. The append-only guarantee was tested directly. No venue was reset, deleted, or re-enriched.

## 1 — Admin "Members" view

There's now an admin-only **/admin/members** (a Members tab in the admin nav), gated exactly like the moderation queue — a non-admin or logged-out visitor can't reach it. It answers "who's registered, and what are they doing?" without you ever opening the database.

The list shows one row per member: name, **email**, role and account type, joined date, last active, marketing opt-in (with the opt-in date on hover), and their activity counts — saved spots, check-ins, bookmarks, reviews, follows. You can search by email or name and sort by joined date or total activity. Click a member and a detail panel opens with the actual activity, each timestamped: their saved spots (venue name, linked, + saved date), check-ins (venue + note + visibility + date), bookmarks, reviews (venue + rating + body + status + date), follows, and the account meta — provider, Stripe customer id if any, whether an unsubscribe token exists, and the welcome/day-3 email flags. Four tiles across the top: total members, members with at least one save, new this week, and % marketing opted-in. There's a client-side **CSV export** of the list.

On the security you flagged as non-negotiable: email and last-sign-in live in `auth.users`, not `profiles`, so they're joined **server-side only** using the service role — the key never touches the browser, and the client only ever receives the specific fields the screen renders. The member id in the detail URL is a uuid, never the email, and emails aren't logged. The detail route is `requireAdmin`-gated (which also enforces the MFA/aal2 step-up the other admin routes use).

## 2 — Content audit log

We now keep a **permanent, append-only history** of editorial and status changes to venues — not just the last touch. A new `content_audit` table (mirroring how `role_change_log` works) records one row per changed field: which venue, which field, the old value and the new value (both as jsonb), the source of the change, who did it, an optional note, and when.

**It's genuinely append-only.** An `UPDATE` is blocked outright by a database trigger — I tested it: the update raises and is refused, even for the service role. Reads are admin-only via row-level security; inserts happen only through the server's service-role client; and rows only ever disappear if their venue is deleted (the cascade). No path in the app can rewrite or hand-delete history.

**Every editorial mutation is captured**, with the right source attribution, by diffing the before/after of the tracked fields at each write point:

- Hand-editing a venue (the editor, the location editor, the featured/closed toggles) → `manual_edit`, stamped with the admin's user id — so "who changed this description, from what to what, and when" is answerable.
- AI writes — enrich and rewrite on a draft, or approving pending changes on a live venue → `ai_enrichment`, with the models recorded in the note.
- Setting a flagship, building a roster, attaching/detaching a chain branch → `roster`.
- Publishing, unpublishing, and closure-report approvals → `manual_edit` on the `published` / `permanently_closed` field.
- Creations — the **623 seed import** and the facts import → `source='import'`; a venue created in the console, a materialised submission, or a submission approved from the queue → `manual_edit`.

Tracked fields are the editorial and status ones: name, description, hook, style, address, city, country, instagram, website, hero image, is_featured, permanently_closed, published, and chain/flagship linkage — plus a lightweight `created` row per new venue. I deliberately left the high-churn machine columns out (geocode cache, cost counters, view counts) so the log stays a clean editorial trail, not noise.

**This is in *before* the 623 import**, exactly as you asked — so every one of those creations is captured as an `import` row from day one. There's no historical backfill (we never had that history); the trail starts clean from this ship.

A note for later: the data layer is complete and correct, but I did not build a *viewer* UI for the history (it wasn't in scope, and the acceptance is about capture + lock-down). Surfacing a venue's timeline in the editor — "here's everything that's changed" — is a small, obvious follow-up on top of this table whenever you want the "activity" feature it's designed to power.

## Verify

Members: `/admin/members` lists everyone with real emails and correct counts; a non-admin is blocked; clicking a member shows their saved spots with venue name and date; nothing but rendered fields reaches the client. Audit: editing a venue's copy writes a `content_audit` row (field='description', old/new populated, source='manual_edit', changed_by = the admin); re-enriching writes `ai_enrichment` rows noting the models; setting a flagship writes a `roster` row; non-admins can't read the table and no path can UPDATE or DELETE a row (trigger-verified). Type-check, production build, and the write-permission guardrail all pass clean.

## Preserved

Everything shipped still stands: submission-form anti-spam, enrich-in-queue, the roster dedupe stack, settlement normalisation, geocode-failure flag, three-step chains, thin-data publish block, full editability, tap-to-place pin, Find IG persistence, closed handling, cache revalidation, and the exact per-call AI usage ledger.
