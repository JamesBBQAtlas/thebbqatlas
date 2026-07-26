-- ============================================================================
-- 022 · Add a "Rubs & Spices" gear category. The starter gear batch includes
-- rubs (BBQ Rub Gift Set, Killer Hogs "The BBQ Rub") that don't fit the existing
-- categories. ADD VALUE IF NOT EXISTS is idempotent; it must run outside the
-- transaction that first uses the new value (products are inserted separately).
-- ============================================================================
ALTER TYPE public.gear_category ADD VALUE IF NOT EXISTS 'rubs_spices';
