-- ============================================================================
-- 004 · F-02 (Tier 0 launch blocker) — anonymous read of public.profiles leaked
--        unsubscribe_token + stripe_customer_id (+ marketing_*) for EVERY user
-- ----------------------------------------------------------------------------
-- Before: `anon` held a table-wide SELECT grant and two duplicate SELECT
-- policies were both USING (true), so:
--     select unsubscribe_token, stripe_customer_id from profiles
-- returned those values for every row to anonymous callers.
--
-- After:
--   * `anon` may read ONLY the safe display columns (column-scoped grant); any
--     attempt to read a sensitive column — including SELECT * — is denied at the
--     privilege layer.
--   * `authenticated` keeps full-column SELECT but is limited by an OWN-ROW
--     policy, so a signed-in user can read their own sensitive columns but not
--     anyone else's.
--   * public_profiles is a SECURITY INVOKER view exposing the safe subset for
--     cross-user display (author names, avatars). Invoker (not definer) avoids
--     the Supabase `security_definer_view` linter error; anon reads it via the
--     column-scoped grant + the anon SELECT policy below.
--
-- Sensitive columns (role, stripe_customer_id, unsubscribe_token, marketing_*,
-- created_at) are NEVER granted to anon and never appear in the view.
-- Live migration history applied this as 004 + a 004b refinement; this file is
-- the consolidated final state and is idempotent.
-- ============================================================================

-- ---- Base-table SELECT privileges ------------------------------------------
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, display_name, username, avatar_url) ON public.profiles TO anon;

-- ---- Consolidate duplicate SELECT policies (F-35) --------------------------
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles readable"                 ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own"                      ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_public_safe"              ON public.profiles;

-- Authenticated: own row only (all columns — so /profile, settings and billing
-- lookups keep working; service-role/admin client bypasses RLS as before).
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Anon: may see the rows; the column-scoped grant above restricts WHICH columns.
-- (A SELECT USING(true) policy is the sanctioned public-read pattern and is
-- explicitly exempt from the rls_policy_always_true linter.)
CREATE POLICY "profiles_select_public_safe"
  ON public.profiles
  FOR SELECT
  TO anon
  USING (true);

-- ---- Public-safe projection ------------------------------------------------
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
  WITH (security_invoker = true) AS
  SELECT id, display_name, username, avatar_url
  FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

COMMENT ON VIEW public.public_profiles IS
  'Public-safe subset of profiles (display_name, username, avatar_url). SECURITY INVOKER; anon reads it via column-scoped grants on the base table. Sensitive columns (role, stripe_customer_id, unsubscribe_token, marketing_*) are never granted to anon and remain owner/service-role only.';
