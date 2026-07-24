-- ============================================================================
-- 019 · Fix the write-permission bug CLASS + retire orphan gear_items.
-- ----------------------------------------------------------------------------
-- Root cause (recurring): admin routes write through requireAdmin()'s `ctx.db`,
-- which is the SERVICE-ROLE client when SUPABASE_SERVICE_ROLE_KEY is present and
-- the cookie (authenticated) client otherwise. Several admin-managed tables had
-- an admin write path but NEITHER a base grant NOR an RLS write policy for
-- `authenticated`, so every write failed the moment ctx.db fell back to the
-- cookie client (i.e. whenever the service key was missing/misconfigured — which
-- is exactly what broke gear). The policy-without-grant audit query can't see
-- this "neither" shape; it must be found by reconciling code write-paths.
--
-- gear_products was the live casualty; voice_lines / suggestions / brands share
-- the shape. Fix: give each the same admin-only RLS write policy + grant used by
-- restaurants/guides/reviews/signature_dishes, so admin writes work via EITHER
-- client (service-role bypasses RLS; authenticated admin satisfies is_admin()).
-- Non-admins are still blocked by the policy even though the grant exists.
-- ============================================================================

-- ---- (a) admin-managed content: grant + is_admin() write policy --------------
GRANT INSERT, UPDATE, DELETE ON public.gear_products TO authenticated;
DROP POLICY IF EXISTS "Admin manage gear products" ON public.gear_products;
CREATE POLICY "Admin manage gear products" ON public.gear_products
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

GRANT INSERT, UPDATE, DELETE ON public.voice_lines TO authenticated;
DROP POLICY IF EXISTS "Admin manage voice lines" ON public.voice_lines;
CREATE POLICY "Admin manage voice lines" ON public.voice_lines
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- suggestions is admin-only; the ALL policy also authorises admin SELECT.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suggestions TO authenticated;
DROP POLICY IF EXISTS "Admin manage suggestions" ON public.suggestions;
CREATE POLICY "Admin manage suggestions" ON public.suggestions
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

GRANT INSERT, UPDATE, DELETE ON public.brands TO authenticated;
DROP POLICY IF EXISTS "Admin manage brands" ON public.brands;
CREATE POLICY "Admin manage brands" ON public.brands
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ---- (b) retire the orphan gear_items (0 rows; canonical data is gear_products)
DROP TABLE IF EXISTS public.gear_items;

-- ---- (c) de-anon the misleading public-role write policies -------------------
-- is_admin()/own-row policies created TO public (nominally incl. anon) while anon
-- has no write grant — dead but misleading. Restrict to authenticated. ALTER
-- preserves the existing USING / WITH CHECK expressions.
ALTER POLICY "Admin manage guides"          ON public.guides           TO authenticated;
ALTER POLICY "Admin manage restaurants"     ON public.restaurants      TO authenticated;
ALTER POLICY "Admin manage reviews"         ON public.reviews          TO authenticated;
ALTER POLICY "Admin manage dishes"          ON public.signature_dishes TO authenticated;
ALTER POLICY "Admin manage submissions"     ON public.submissions      TO authenticated;
ALTER POLICY "Anyone insert submissions"    ON public.submissions      TO authenticated;
ALTER POLICY "Users insert review photos"   ON public.review_photos    TO authenticated;
ALTER POLICY "Users insert own saved spots" ON public.saved_spots      TO authenticated;
ALTER POLICY "Users delete own saved spots" ON public.saved_spots      TO authenticated;
