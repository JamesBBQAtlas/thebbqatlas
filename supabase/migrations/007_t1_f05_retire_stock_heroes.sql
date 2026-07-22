-- ============================================================================
-- 007 · F-05 (Tier 1) — Copyright-safe imagery: retire seeded stock heroes.
-- All seed venues carried generic Unsplash/Pexels URLs (hotlink-blocked in prod
-- and not the venue's own photos). Relax the NOT NULL constraint so a venue can
-- legitimately have no hero (→ branded HeroPlaceholder), and null out every
-- stock URL so no stock is ever presented as a venue's photo.
-- ============================================================================

ALTER TABLE public.restaurants ALTER COLUMN hero_image_url DROP NOT NULL;

UPDATE public.restaurants
SET hero_image_url = NULL
WHERE hero_image_url ILIKE '%unsplash%'
   OR hero_image_url ILIKE '%pexels%';
