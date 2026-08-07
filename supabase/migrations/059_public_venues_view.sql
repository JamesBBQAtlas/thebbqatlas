-- Phase 8a — public data contract.
-- `restaurants` mixes public fields with internal enrichment/ops columns
-- (dossier, pending_copy, enrichment_cost, attention_reason, contact_email,
-- outreach_*, hero_exif, duplicate_*, …). Under a mobile anon key those leak
-- unless the read is column-narrowed. `public_venues` is the explicit, stable
-- public projection a native app / versioned API reads — add a public column
-- here deliberately; never `select *` from restaurants on a public path again.
--
-- security_invoker = true → the view runs with the QUERYING role's rights, so
-- the base table's RLS still applies (anon sees approved rows only). The view
-- only narrows columns; it does not widen access.
CREATE OR REPLACE VIEW public_venues
WITH (security_invoker = true) AS
SELECT
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
  created_at
FROM restaurants
WHERE status = 'approved';

-- Explicit read grants for the two client roles a mobile app authenticates as.
GRANT SELECT ON public_venues TO anon, authenticated;
