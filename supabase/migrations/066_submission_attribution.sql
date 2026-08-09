-- Part 5 — submitter attribution + update tracking on restaurants.
-- Adds a lightweight, display-ready link from a venue to the submission that
-- created it, plus who/when it was last meaningfully edited. Denormalised so the
-- venue render never needs a join. Bulk imports (IG seeds, chain discovery) have
-- no submission: first_submitted_by stays null and they read as "added by The
-- BBQ Atlas".
alter table public.restaurants
  add column if not exists first_submission_id uuid references public.submissions(id) on delete set null,
  add column if not exists first_submitted_by  uuid references public.profiles(id)    on delete set null,
  add column if not exists first_submitted_at  timestamptz,
  add column if not exists updated_at           timestamptz,
  add column if not exists updated_by           uuid references public.profiles(id)    on delete set null,
  add column if not exists updated_by_actor     text; -- 'member' | 'owner' | 'admin' | 'enrichment'

comment on column public.restaurants.updated_by_actor is
  'Who last meaningfully edited this venue: member | owner | admin | enrichment. Drives whether the public page names the actor (member/owner with a public profile) or shows a bare "Last updated" (admin/enrichment).';

-- Backfill first-submission attribution from the submissions that already
-- materialised into a venue (6 today). Bulk imports are intentionally left null.
update public.restaurants r
set first_submission_id = s.id,
    first_submitted_by  = s.submitted_by,
    first_submitted_at  = s.created_at
from public.submissions s
where s.materialized_restaurant_id = r.id
  and r.first_submission_id is null;

-- Expose ONLY the non-PII "added" date on the public contract. Submitter
-- identity is resolved server-side through public_profiles; email/IP/country
-- and the raw submitter uuid never appear here.
create or replace view public_venues
with (security_invoker = true) as
select
  id, slug, name, description, hook, style,
  lat, lng, address, city, country, country_code,
  website, price_level, avg_rating, review_count,
  hero_image_url, hero_source, hero_photo_credit,
  is_featured, is_premium, premium_tier,
  category, permanently_closed, phone, hours,
  event_starts_at, event_ends_at, alcohol, offerings,
  instagram_url, instagram_handle, instagram_posts,
  x_url, facebook_url, tiktok_url, youtube_url,
  brand_id, location_label, enriched_at,
  featured_video_id, featured_video_title, featured_video_channel, featured_video_thumb,
  created_at, first_submitted_at, updated_at
from restaurants
where status = 'approved';

grant select on public_venues to anon, authenticated;
