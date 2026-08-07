-- Phase 6.5 — "Episodes We Love": individual curated videos.
-- Add a fourth media_kind value, `video`, distinct from `youtube` (a channel).
-- A video row stores the watch URL in `url`, the resolved title in `name`, the
-- channel title in `creator`, the thumbnail in `image_url`, and the videoId +
-- duration in `links` ({"videoId":"…","duration":"PT#M#S"}). No new columns.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older PG,
-- and the new value can't be used in the same transaction it's added. Supabase
-- runs each migration statement appropriately; keep this as the only statement.
ALTER TYPE media_kind ADD VALUE IF NOT EXISTS 'video';
