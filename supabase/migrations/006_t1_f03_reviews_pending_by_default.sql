-- ============================================================================
-- 006 · F-03 (Tier 1) — Reviews self-approve (moderation queue bypassable).
-- status DEFAULTed to 'approved', the INSERT policy had no status check, and the
-- UPDATE policy had no WITH CHECK (a user could edit their review's status to
-- 'approved'). Fix: default 'pending' and force user-written rows to stay
-- 'pending'. Only the admin policy (is_admin()) / service role may approve.
-- ============================================================================

ALTER TABLE public.reviews ALTER COLUMN status SET DEFAULT 'pending';

DROP POLICY IF EXISTS "Users insert own reviews" ON public.reviews;
CREATE POLICY "Users insert own reviews"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "Users update own reviews" ON public.reviews;
CREATE POLICY "Users update own reviews"
  ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'pending');
