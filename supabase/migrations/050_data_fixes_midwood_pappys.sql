-- ============================================================================
-- 050 · Tracked data fixes (already applied live via MCP; idempotent).
--   C1: Midwood Smokehouse flagship city 'NC' (state) → 'Charlotte'.
--   C3: Pappy's Texas BBQ slug …-cumbria → …-kendal, with a 301 redirect from
--       the retired slug so old links / SEO never break.
-- ============================================================================

UPDATE public.restaurants
SET city = 'Charlotte'
WHERE id = 'e1814adc-26ee-466c-b1a6-7751fa846d1e' AND city = 'NC';

UPDATE public.restaurants
SET slug = 'pappy-s-texas-bbq-kendal'
WHERE slug = 'pappy-s-texas-bbq-cumbria';

INSERT INTO public.slug_redirects (old_slug, new_slug)
VALUES ('pappy-s-texas-bbq-cumbria', 'pappy-s-texas-bbq-kendal')
ON CONFLICT (old_slug) DO UPDATE SET new_slug = EXCLUDED.new_slug;
