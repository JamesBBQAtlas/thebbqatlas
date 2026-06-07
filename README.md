# The BBQ Atlas MVP

**Real BBQ. Real Time. Shared Worldwide.**

Production-ready MVP for [TheBBQAtlas.com](https://thebbqatlas.com) — interactive global BBQ discovery platform.

## Tech Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Auth, Postgres + RLS, Storage)
- Leaflet + react-leaflet + clustering
- Vercel deployment

## Quick Start

### 1. Run Supabase SQL

Open Supabase SQL Editor and run the complete block in:

```
supabase/schema.sql
```

This creates all tables, RLS policies, storage buckets, 4 guides, and 75 seeded restaurants.

### 2. Environment

Copy `.env.local.example` to `.env.local` (already configured with publishable key):

```bash
cp .env.local.example .env.local
```

Add your `SUPABASE_SERVICE_ROLE_KEY` for admin moderation actions.

### 3. Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Logos

Logos are at `public/logos/crest.jpg` and `public/logos/crest-gold.jpg`.

## Founder Activation

See final delivery document for AdSense, Google OAuth, affiliate links, and admin setup.

## License

Proprietary — The BBQ Atlas Ltd.