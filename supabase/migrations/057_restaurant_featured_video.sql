-- Phase 6.7 (B1) — optional featured video on a venue.
-- A nullable YouTube video id plus cached metadata (title/channel/thumbnail),
-- resolved + validated via the YouTube Data API in the admin and refreshed on
-- the existing schedule. The venue page renders a compliant click-to-play
-- facade (thumbnail + play → load the iframe only on click). One per venue is
-- enough for now; a separate table can come later if we need several.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS featured_video_id text,
  ADD COLUMN IF NOT EXISTS featured_video_title text,
  ADD COLUMN IF NOT EXISTS featured_video_channel text,
  ADD COLUMN IF NOT EXISTS featured_video_thumb text;
