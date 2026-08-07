-- Phase 6.8 (D3) — per-item outbound-click tracking for Watch/Read/Listen.
-- Attribute a WRL outbound click (channel, "Watch on YouTube," Subscribe, book
-- "View on Amazon," podcast pill, featured-video play, episode) to the specific
-- media_picks row that produced it. Nullable — every other click_event leaves it
-- null. ON DELETE SET NULL so removing a pick doesn't erase its click history's
-- other columns.
ALTER TABLE click_events
  ADD COLUMN IF NOT EXISTS media_pick_id uuid REFERENCES media_picks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS click_events_media_pick_idx
  ON click_events (media_pick_id, created_at DESC)
  WHERE media_pick_id IS NOT NULL;
