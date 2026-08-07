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

## 8d — Remaining, and what needs James / infra

- **De-cookie the write path** — `bookmarks`/`checkins`/`saved-spots`/
  `submissions`/`report` are cookie-session only. For native, accept
  `Authorization: Bearer <supabase access token>` or move to direct SDK writes
  under RLS. (Code change; safe to do next.)
- **RLS coverage audit** on every mobile-touched table. (Code/DB review.)
- **Native OAuth** — register app-scheme / deep-link redirect URLs in Supabase,
  PKCE, MFA step-up handled natively. **[James/Supabase console]**
- **Deep-link association files** — `apple-app-site-association` +
  `.well-known/assetlinks.json`. Buildable now, but the values (Apple team id,
  Android package + SHA-256 fingerprint) are **[James]**-supplied.
- **Push (FCM/APNs)**, **image CDN/transform**, **offline strategy** — infra
  choices, **[James]**. None block the data contract above.
