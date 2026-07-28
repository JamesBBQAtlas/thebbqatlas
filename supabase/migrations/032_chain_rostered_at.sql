-- ============================================================================
-- 032 · §09.2.1 — track that a chain has been rostered (once-per-chain scan)
--
-- The roster gateway is a one-time, parent-only action. Stamping the parent
-- when its roster is scanned lets us (a) never offer the scan again for that
-- chain, and (b) stop a parent re-enrich from re-seeding. Null = not yet
-- rostered. Only ever set on a chain PARENT (chain_parent_id IS NULL).
-- ============================================================================
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS chain_rostered_at timestamptz;
