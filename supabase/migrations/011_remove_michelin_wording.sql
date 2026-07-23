-- ============================================================================
-- 011 · Brand safety — remove trademarked "Michelin" wording from venue
-- descriptions. The Atlas does not emulate or reference the Michelin brand.
-- ============================================================================
UPDATE public.restaurants
SET description = regexp_replace(description, 'Michelin-starred', 'Acclaimed', 'gi')
WHERE description ILIKE '%michelin%';
