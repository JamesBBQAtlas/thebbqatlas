-- 301 redirect map for restaurant slugs that changed (e.g. a venue's city was
-- corrected on enrich). The venue page consults this only when no venue matches
-- the requested slug, and permanent-redirects to the new slug so old links/SEO
-- never 404.
create table if not exists slug_redirects (
  old_slug text primary key,
  new_slug text not null,
  created_at timestamptz not null default now()
);
create index if not exists slug_redirects_new_idx on slug_redirects (new_slug);
