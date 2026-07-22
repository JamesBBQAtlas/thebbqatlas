-- ============================================================================
-- 003 · F-01 (Tier 0 launch blocker) — privilege escalation on public.profiles
-- ----------------------------------------------------------------------------
-- Before: `authenticated` held a TABLE-WIDE UPDATE/INSERT grant (implicitly
-- covering every column, incl. `role`), the UPDATE policy had NO WITH CHECK,
-- and two duplicate UPDATE + two duplicate INSERT policies existed (F-35).
-- A normal user could therefore self-promote:
--     supabase.from('profiles').update({ role: 'admin' }).eq('id', MY_UID)
--
-- After: the `role` column (and id / stripe_customer_id / unsubscribe_token /
-- created_at) can only be written by service-role code. `authenticated` may
-- write ONLY the self-service columns below. `role` is pinned in the policy
-- WITH CHECK as belt-and-suspenders. Policies collapsed to one per command.
--
-- NOTE: a table-wide REVOKE is REQUIRED first — a column-level
-- `REVOKE UPDATE (role)` alone is a no-op while the table-wide grant exists.
-- Live migration history applied this as 003 + a 003b correction; this file is
-- the consolidated final state and is idempotent.
-- ============================================================================

-- ---- UPDATE privileges -----------------------------------------------------
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;
GRANT UPDATE (
  display_name, avatar_url, username, account_type,
  marketing_opt_in, marketing_opt_in_at, marketing_opt_in_text,
  welcome_email_sent
) ON public.profiles TO authenticated;

-- ---- INSERT privileges (never allow setting `role` at insert time) ----------
-- The signup path is public.handle_new_user() (SECURITY DEFINER, owner=postgres,
-- inserts only id+display_name, role defaults to 'user'), so it is unaffected.
REVOKE INSERT ON public.profiles FROM authenticated;
REVOKE INSERT ON public.profiles FROM anon;
GRANT INSERT (
  id, display_name, avatar_url, username, account_type,
  marketing_opt_in, marketing_opt_in_at, marketing_opt_in_text
) ON public.profiles TO authenticated;

-- ---- Consolidate duplicate policies (F-35) ---------------------------------
DROP POLICY IF EXISTS "Users can update own profile"       ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile"           ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow profile creation during signup" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"                ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"                ON public.profiles;

-- One owner-only UPDATE policy; WITH CHECK pins `role` to its current value and
-- forbids re-homing a row to another user's id.
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );

-- One owner-only INSERT policy.
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);
