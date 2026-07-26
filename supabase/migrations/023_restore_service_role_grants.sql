-- ============================================================================
-- 023 · Restore service_role table privileges (ROOT-CAUSE FIX)
--
-- The earlier security-lockdown work re-granted only the public roles (anon,
-- authenticated) and, as collateral damage, left the `service_role` backend key
-- without SELECT/INSERT/UPDATE/DELETE on the public tables. Because the admin
-- API and several server reads run through the service role, this surfaced as a
-- cascade of "permission denied for table X" (SQLSTATE 42501) errors on
-- check-ins, saved spots, choosing a username, the gear console ("0 products"),
-- and venue visit counts. service_role bypasses RLS but STILL needs base GRANTs.
--
-- Idempotent: GRANT ... ON ALL ... is safe to re-run. Default privileges ensure
-- any future table/sequence/routine is owned-usable by the backend key too.
-- ============================================================================
GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;
