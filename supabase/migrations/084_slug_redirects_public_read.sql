-- 084 — B7: persist Fable's live slug-redirect fix (Blocker 2) as a migration.
--
-- Fable fixed this live during the 21 Aug audit: anon/authenticated had no SELECT
-- on slug_redirects, so getSlugRedirect() read null and every retired URL 404'd
-- (569 dead 301s bleeding link equity). Granting SELECT + RLS read policy fixed it.
-- Captured here so a schema rebuild / branch never silently reintroduces the 404s.
-- Idempotent: safe to run against a DB that already has the fix.

grant select on table public.slug_redirects to anon, authenticated;

alter table public.slug_redirects enable row level security;

drop policy if exists "public read slug redirects" on public.slug_redirects;
create policy "public read slug redirects"
  on public.slug_redirects
  for select
  using (true);
