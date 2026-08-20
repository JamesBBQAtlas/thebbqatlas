# Environment variable inventory

_Generated 2026-08-20 by `scripts/env-inventory.mjs` — a scan of every `process.env` the code reads. Names + classification only; secret VALUES are never read or printed. Keep this list; store the actual values in a password manager._

**61 variables** across 18 services. Secrets to safeguard: **17**.

## Affiliates

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `NEXT_PUBLIC_AMAZON_ONELINK_TAG` | 🌐 public | Your affiliate tag / ref code. |
| `NEXT_PUBLIC_DALSTRONG_REF` | 🌐 public | Your affiliate tag / ref code. |

## Anthropic (Claude)

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `ANTHROPIC_API_KEY` | 🔐 secret | console.anthropic.com → API keys. |
| `ANTHROPIC_BASE_URL` | ⚙️ config | Model / base-url config. |
| `ANTHROPIC_MODEL` | ⚙️ config | Model / base-url config. |
| `ANTHROPIC_WRITER_MODEL` | ⚙️ config | Model / base-url config. |

## App (cost model)

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `CLAUDE_PRICE_IN_PER_M` | ⚙️ config | Per-token / per-search price overrides for the spend ledger. |
| `CLAUDE_PRICE_OUT_PER_M` | ⚙️ config | Per-token / per-search price overrides for the spend ledger. |
| `GROK_PRICE_IN_PER_M` | ⚙️ config | Per-token / per-search price overrides for the spend ledger. |
| `GROK_PRICE_OUT_PER_M` | ⚙️ config | Per-token / per-search price overrides for the spend ledger. |
| `GROK_PRICE_SEARCH` | ⚙️ config | Per-token / per-search price overrides for the spend ledger. |

## App (internal)

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `ANALYTICS_SALT` | 🔐 secret | Self-generated random string (hashes analytics identifiers). |

## App (web engine)

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `WEB_ENGINE_SECRET` | 🔐 secret | Self-generated shared secret for the web-engine worker. |
| `WEB_ENGINE_URL` | ⚙️ config | Web-engine worker URL. |

## Backblaze B2 (backups)

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `BACKUP_DEST` | ⚙️ config | Backup behaviour (destination, retention, per-run file cap). |
| `BACKUP_RETAIN` | ⚙️ config | Backup behaviour (destination, retention, per-run file cap). |
| `BACKUP_S3_ACCESS_KEY_ID` | 🔐 secret | Backblaze → Application Keys. |
| `BACKUP_S3_BUCKET` | ⚙️ config | Bucket / endpoint / region / prefix. |
| `BACKUP_S3_ENDPOINT` | ⚙️ config | Bucket / endpoint / region / prefix. |
| `BACKUP_S3_PREFIX` | ⚙️ config | Bucket / endpoint / region / prefix. |
| `BACKUP_S3_REGION` | ⚙️ config | Bucket / endpoint / region / prefix. |
| `BACKUP_S3_SECRET_ACCESS_KEY` | 🔐 secret | Backblaze → Application Keys. |
| `BACKUP_STORAGE_LIMIT` | ⚙️ config | Backup behaviour (destination, retention, per-run file cap). |

## Cloudflare

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | 🔐 secret | Cloudflare dashboard → My Profile → API Tokens. |
| `CLOUDFLARE_ZONE_ID` | ⚙️ config | Zone id. |

## Feature flags

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `CONSUMER_PREMIUM_LIVE` | ⚙️ config | On/off switch. |
| `PROVIDER_TIER_OSM` | ⚙️ config | On/off switch. |
| `SUBMISSION_CAPTCHA_ENABLED` | ⚙️ config | On/off switch. |

## Google Analytics

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `NEXT_PUBLIC_GA_ID` | 🌐 public | GA4 → Admin → Data Streams (measurement id). |

## Google Cloud

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `GOOGLE_BOOKS_API_KEY` | 🔐 secret | Google Cloud → Credentials (Books API). |
| `GOOGLE_PLACES_API_KEY` | 🔐 secret | console.cloud.google.com → APIs & Services → Credentials (Places API). |
| `YOUTUBE_API_KEY` | 🔐 secret | Google Cloud → Credentials (YouTube Data API). |

## MapTiler

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `MAPTILER_KEY` | 🔐 secret | maptiler.com → Account → Keys (the NEXT_PUBLIC one ships to the browser). |
| `NEXT_PUBLIC_MAPTILER_KEY` | 🔐 secret | maptiler.com → Account → Keys (the NEXT_PUBLIC one ships to the browser). |

## Mobile app links

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `ANDROID_PACKAGE_NAME` | ⚙️ config | From your Play Store / App Store app (assetlinks / apple-app-site-association). |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | ⚙️ config | From your Play Store / App Store app (assetlinks / apple-app-site-association). |
| `APPLE_APP_ID` | ⚙️ config | From your Play Store / App Store app (assetlinks / apple-app-site-association). |
| `APPLE_APP_PATHS` | ⚙️ config | From your Play Store / App Store app (assetlinks / apple-app-site-association). |

## Platform

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | ⚙️ config | Canonical site URL. |
| `NEXT_PUBLIC_VERCEL_ENV` | ⚙️ config | Set automatically by Next.js / Vercel — you don't set these by hand. |
| `NODE_ENV` | ⚙️ config | Set automatically by Next.js / Vercel — you don't set these by hand. |

## Resend (email)

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `RESEND_API_KEY` | 🔐 secret | resend.com → API Keys. |
| `RESEND_FROM_MARKETING` | ⚙️ config | From / reply-to addresses. |
| `RESEND_FROM_TRANSACTIONAL` | ⚙️ config | From / reply-to addresses. |
| `RESEND_REPLY_TO` | ⚙️ config | From / reply-to addresses. |

## Stripe

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 🌐 public | Stripe → Developers → API keys (publishable). |
| `STRIPE_FEATURED_PRICE_ID` | ⚙️ config | Stripe → Products → the price id (price_…). |
| `STRIPE_LISTING_PRICE_ID` | ⚙️ config | Stripe → Products → the price id (price_…). |
| `STRIPE_LOWER_PRICE_ID` | ⚙️ config | Stripe → Products → the price id (price_…). |
| `STRIPE_PREMIUM_PRICE_ID` | ⚙️ config | Stripe → Products → the price id (price_…). |
| `STRIPE_PRO_PRICE_ID` | ⚙️ config | Stripe → Products → the price id (price_…). |
| `STRIPE_SECRET_KEY` | 🔐 secret | Stripe dashboard → Developers → API keys (secret). |
| `STRIPE_WEBHOOK_SECRET` | 🔐 secret | Stripe → Developers → Webhooks → the endpoint's signing secret. |

## Supabase

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 🌐 public | Supabase → Settings → API (URL + anon key). Safe to expose. |
| `NEXT_PUBLIC_SUPABASE_URL` | 🌐 public | Supabase → Settings → API (URL + anon key). Safe to expose. |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔐 secret | Supabase dashboard → Project Settings → API (service_role). CRITICAL — full DB access. |

## Vercel Cron

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `CRON_SECRET` | 🔐 secret | Self-generated random string; must match what the cron routes check. |

## xAI (Grok)

| Variable | Type | Where to set / regenerate |
|---|---|---|
| `XAI_API_KEY` | 🔐 secret | console.x.ai → API keys. |
| `XAI_BASE_URL` | ⚙️ config | Model / base-url config (XAI_MODEL, XAI_VISION_MODEL, XAI_BASE_URL). |
| `XAI_MODEL` | ⚙️ config | Model / base-url config (XAI_MODEL, XAI_VISION_MODEL, XAI_BASE_URL). |
| `XAI_VISION_MODEL` | ⚙️ config | Model / base-url config (XAI_MODEL, XAI_VISION_MODEL, XAI_BASE_URL). |
