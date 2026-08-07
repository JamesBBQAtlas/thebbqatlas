# Phase 8 — app-readiness (data & API contract)

Prep done in web/data/API so a future native app doesn't force a re-architecture.
This records decisions and what's built vs. what's a James/infra call.

## 8a — Public data contract ✅ (built)

`restaurants` mixes public fields with internal enrichment/ops columns
(`dossier`, `pending_copy`, `pending_changes`, `enrichment_cost*`,
`attention_reason`, `contact_email`, `outreach_*`, `hero_exif`, `duplicate_*`,
owner/claim ids, `status`). Exposing that table directly under a mobile anon key
would leak those columns.

Shipped:

- **`public_venues` view** (`security_invoker = true`) — approved rows, public
  columns only, `GRANT SELECT` to `anon` + `authenticated`. RLS on `restaurants`
  still applies; the view only narrows columns.
- **`PublicRestaurant` DTO** (`lib/types/public.ts`) mirroring the view exactly,
  plus `PUBLIC_VENUE_COLUMNS` (an explicit `.select()` string — never `*` on a
  public path) and `toPublicRestaurant()` to project a full `Restaurant` down.
- **Public queries** (`lib/queries/public-venues.ts`): `getPublicVenues()`,
  `getPublicVenueBySlug()`.

Rule going forward: add a public field by editing the view (migration) →
`PUBLIC_VENUE_COLUMNS` → `PublicRestaurant`, in lockstep. Internal server/admin
code keeps using `getRestaurants` (full `Restaurant`).

## 8b — Read path (decision)

**Decision: bless direct Supabase-SDK access to `public_venues`** (+ the existing
`guides`/`news`/`media_picks` read paths under RLS), rather than standing up a
separate versioned `/api/v1`. Rationale: Supabase auth is already token/refresh
based, RLS is enforced, and the column-narrowed view is the contract. A native
app reads `public_venues` with the anon key exactly as the web anon client does.
If a bespoke aggregate endpoint is later needed, add it narrowly — the view stays
the source of truth either way.

## 8c — API hardening (in progress)

Consistent error envelope, CORS on public reads, and broader rate limiting.
(Tracked as its own task.)

## 8d — De-cookie writes + RLS audit ✅ (built) · native infra (James)

**De-cookie the write path (done).** `lib/auth/request-user.ts#getRequestUser`
resolves the user from a cookie session OR an `Authorization: Bearer <supabase
access token>` header, returning a `db` client scoped to that user (cookie
client, or a token-authenticated anon client) so writes still pass RLS as the
user. Applied to the core My Atlas writes — `checkins`, `saved-spots`,
`bookmarks` — and the new `reviews` endpoint. `submissions`/`report` are public
(service-role) submit paths and don't need it.

**RLS coverage audit (done — Supabase security advisor, 2026-08-07).**
- Mobile-touched READ surface (`public_venues` view, `guides`, `news`,
  `media_picks`) and WRITE surface (`check_ins`, `saved_spots`, `bookmarks`,
  `reviews`) all carry appropriate RLS policies.
- 12 tables show "RLS enabled, no policy" (INFO): `ai_usage_log`,
  `contact_messages`, `email_log`, `email_subscribers`, `enrichment_runs`,
  `events`, `outreach_log`, `rate_limits`, `role_change_log`,
  `search_impressions`, `submission_abuse_log`, `venue_views`. These are internal
  telemetry/logs written only by the service role — "no policy" means deny-all to
  anon/authenticated, which is the intended, secure posture. **No change made**
  (adding policies would open them).
- WARN, low-priority hardening (deferred, non-blocking): fixed `search_path` on a
  few pre-existing functions (`nearby_venues`, `ai_usage_report`,
  `content_audit_no_update`); `citext` extension in `public`; `is_admin()`
  callable via RPC (self-scoped — returns the caller's own admin status, so safe;
  lockdown shipped earlier). New functions this session (`marketing_members`,
  `venue_report`) already set `search_path` and are service-role-only.

### Native infra — needs James (not code)

- **Native OAuth** — register app-scheme / deep-link redirect URLs in Supabase,
  PKCE, MFA step-up handled natively. **[James/Supabase console]**
- **AASA/assetlinks env values** — `APPLE_APP_ID` (+ optional `APPLE_APP_PATHS`);
  `ANDROID_PACKAGE_NAME` + `ANDROID_SHA256_CERT_FINGERPRINTS`. Route handlers are
  live and return 404 until these are set. **[James]**
- **Push (FCM/APNs)**, **image CDN/transform**, **offline strategy** — infra
  choices. **[James]**
- **Native OAuth** — register app-scheme / deep-link redirect URLs in Supabase,
  PKCE, MFA step-up handled natively. **[James/Supabase console]**
- **Deep-link association files** — `apple-app-site-association` +
  `.well-known/assetlinks.json`. Buildable now, but the values (Apple team id,
  Android package + SHA-256 fingerprint) are **[James]**-supplied.
- **Push (FCM/APNs)**, **image CDN/transform**, **offline strategy** — infra
  choices, **[James]**. None block the data contract above.
