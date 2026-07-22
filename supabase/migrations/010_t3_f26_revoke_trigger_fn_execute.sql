-- ============================================================================
-- 010 · F-26 (Tier 3, partial) · Remove the public RPC surface of the signup
-- trigger function. handle_new_user() is only invoked by the auth.users trigger
-- (which fires regardless of EXECUTE grants), so revoking EXECUTE from
-- anon/authenticated is safe and takes it off the PostgREST RPC surface.
--
-- is_admin() is intentionally NOT revoked — 10 RLS policies call it as the
-- querying role, so revoking would break admin access; it only reports the
-- caller's own admin status, so its RPC exposure is harmless.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
