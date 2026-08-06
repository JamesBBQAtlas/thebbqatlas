-- ============================================================================
-- 049 · Watch/Read/Listen redesign support. Podcasts carry several platform
-- links (Apple/Spotify/YouTube Music/official/…), not just one — store them as
-- a jsonb map. image_url already exists (047); it's backfilled for books
-- (Open Library covers) and resolved at render for podcasts (iTunes artwork).
-- ============================================================================

ALTER TABLE public.media_picks
  ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '{}'::jsonb;
