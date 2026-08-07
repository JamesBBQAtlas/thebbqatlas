-- Phase 1 (Fable C-1): analytics capture layer — append-only, server-captured.
-- Applied to prod via MCP; recorded here for version history.

-- 1) venue_views: the anonymous-majority profile-view capture view_history drops.
create table if not exists public.venue_views (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_at timestamptz not null default now(),
  view_date date not null default ((now() at time zone 'utc')::date),
  session_hash text,
  is_bot boolean not null default false,
  referrer text,
  country text,
  user_id uuid references auth.users(id) on delete set null
);
create index if not exists venue_views_restaurant_created_idx
  on public.venue_views (restaurant_id, created_at);
create unique index if not exists venue_views_dedupe_idx
  on public.venue_views (restaurant_id, session_hash, view_date);
alter table public.venue_views enable row level security;
-- No policies: written only by the service-role client (server render); RLS-on
-- means anon/authenticated can neither read nor write (same pattern as ai_usage_log).

-- 2) click_events hardening: session + bot + a rollup index for monthly reports.
alter table public.click_events add column if not exists session_hash text;
alter table public.click_events add column if not exists is_bot boolean not null default false;
create index if not exists click_events_rollup_idx
  on public.click_events (restaurant_id, event_type, created_at);

-- 3) search_impressions: when a venue appears in a directory/search result list.
create table if not exists public.search_impressions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  page text,
  position int,
  session_hash text,
  is_bot boolean not null default false,
  created_at timestamptz not null default now(),
  impression_date date not null default ((now() at time zone 'utc')::date)
);
create index if not exists search_impressions_restaurant_created_idx
  on public.search_impressions (restaurant_id, created_at);
create unique index if not exists search_impressions_dedupe_idx
  on public.search_impressions (restaurant_id, page, session_hash, impression_date);
alter table public.search_impressions enable row level security;
