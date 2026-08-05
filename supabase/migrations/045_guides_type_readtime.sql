-- Guides: editorial type + read time, and a UNIQUE slug so the content seed's
-- ON CONFLICT (slug) upsert works. Purely additive — safe to run before the
-- content seed and independent of the app deploy (the new columns are unused by
-- old code). Idempotent.

-- Editorial format: 'guide' (how-to) or 'missive' (short opinion piece).
alter table guides
  add column if not exists type text not null default 'guide';

-- Estimated reading time in minutes (nullable).
alter table guides
  add column if not exists read_minutes int;

-- ON CONFLICT (slug) in seed_guides.sql requires a unique constraint/index on slug.
create unique index if not exists guides_slug_key on guides (slug);

comment on column guides.type is
  'Editorial format: guide (how-to) or missive (short opinion piece).';
comment on column guides.read_minutes is
  'Estimated reading time in minutes; null if unset.';
