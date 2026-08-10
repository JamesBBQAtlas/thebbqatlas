-- 072 — Part C: per-item link health for the Watch/Read/Listen library, so we
-- catch pulled channels, dead ASINs and removed podcasts instead of linking
-- visitors to dead content (and, for books, silently breaking the affiliate earn).

alter table public.media_picks
  add column if not exists link_status text not null default 'unchecked',
  add column if not exists link_status_code integer,
  add column if not exists link_checked_at timestamptz,
  add column if not exists link_note text;

comment on column public.media_picks.link_status is
  'Link health: ok | broken | redirected | unchecked. A transient timeout/5xx stays unchecked (retry), never broken (Part C).';
