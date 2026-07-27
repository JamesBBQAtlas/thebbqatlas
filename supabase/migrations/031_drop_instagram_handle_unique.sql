-- ============================================================================
-- 031 · §09.1 fix #1 — drop the UNIQUE constraint on instagram_handle
--
-- Chain locations legitimately SHARE one brand Instagram handle (every Joe's KC
-- = joeskc). The old partial unique index let only the first sibling save the
-- handle; every other location's write failed the whole insert (greyed-out
-- Publish, red errors, and the parent left with a NULL handle while a sibling
-- grabbed it). Drop the unique index; keep a plain (non-unique) index for
-- lookups. Seed-import idempotency uses an explicit existence check, not the
-- constraint, so it is unaffected.
-- ============================================================================
DROP INDEX IF EXISTS public.restaurants_instagram_handle_key;

CREATE INDEX IF NOT EXISTS restaurants_instagram_handle_idx
  ON public.restaurants (instagram_handle)
  WHERE instagram_handle IS NOT NULL;
