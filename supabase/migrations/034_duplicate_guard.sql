-- ============================================================================
-- 034 · Global duplicate-venue guard — flag columns
--
-- A shared dedupe standard (lib/venues/dedupe.ts) surfaces possible duplicates
-- on the Submit form, the moderation queue, and the bulk import. When a
-- candidate looks like an existing venue we WARN (never auto-reject): a
-- submission or an imported seed can carry a pointer to the venue it may
-- duplicate, plus a human-readable reason, so a moderator acts with eyes open.
-- ============================================================================
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS possible_duplicate_of uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_reason text;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS possible_duplicate_of uuid REFERENCES public.restaurants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_reason text;
