-- ============================================================================
-- 018 · Public identity = username ONLY. display_name + avatar_url are private.
-- ----------------------------------------------------------------------------
-- Public surfaces (the /u/[username] profile page and "Who's been here" venue
-- credit) must expose ONLY the chosen @username. display_name can carry PII (a
-- real name or, as seen in practice, the account email), so it — and the avatar
-- storage path — must not be anon-readable at the PRIVILEGE layer, not merely
-- hidden in the UI. F-02 (migration 004) granted anon SELECT on
-- (id, display_name, username, avatar_url); this narrows that to (id, username).
--
-- Unaffected: `authenticated` keeps full-column own-row SELECT (own settings /
-- My Atlas), and the service-role/admin client still bypasses RLS for the admin
-- consoles (moderation/audit read other users' names via that client). No live
-- public feature reads display_name/avatar via anon — getReviews is currently
-- unrendered and is switched to username in the same change.
-- ============================================================================

REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, username) ON public.profiles TO anon;

DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
  WITH (security_invoker = true) AS
  SELECT id, username
  FROM public.profiles;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

COMMENT ON VIEW public.public_profiles IS
  'Public identity is username only. display_name + avatar_url are NOT anon-readable (may contain PII). SECURITY INVOKER; anon reads via the (id, username) column grant.';
