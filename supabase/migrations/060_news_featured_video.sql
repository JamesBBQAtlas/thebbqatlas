-- Phase 6.7 (B3) — optional featured video on a news post.
-- Reuses the venue click-to-play facade (B1) so a post can embed a YouTube video
-- (e.g. the Truth BBQ feature) without an eager third-party iframe. Nullable;
-- most posts leave it null.
ALTER TABLE news
  ADD COLUMN IF NOT EXISTS featured_video_id text;
