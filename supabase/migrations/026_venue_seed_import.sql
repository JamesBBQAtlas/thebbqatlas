-- ============================================================================
-- 026 · Venue bulk-import + Instagram hero support
--
-- Adds the two columns the seed sheet needs on top of the existing venue model:
--   • instagram_handle — the normalised (lowercased, no @) IG handle from the
--     follow-list export. This is the idempotency key for bulk import: a partial
--     unique index means re-importing updates the same draft instead of
--     duplicating it, while leaving hand-created venues (null handle) unaffected.
--   • hero_post_url — one good Instagram post permalink per venue, rendered as
--     the hero via Instagram's official embed (the gallery still uses the
--     existing instagram_posts jsonb).
-- ============================================================================
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS instagram_handle text,
  ADD COLUMN IF NOT EXISTS hero_post_url text;

CREATE UNIQUE INDEX IF NOT EXISTS restaurants_instagram_handle_key
  ON public.restaurants (instagram_handle)
  WHERE instagram_handle IS NOT NULL;
