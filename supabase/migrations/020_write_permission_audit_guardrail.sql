-- ============================================================================
-- 020 · Guardrail function: returns write-permission problems, empty when healthy.
-- CI (scripts/audit-write-grants.mjs) calls this and fails the build on any row.
-- Catches BOTH failure shapes:
--   (a) a write policy exists but the base grant is missing (the original
--       recurring bug: permission-denied before RLS even runs), and
--   (b) an admin-writable table missing grant OR policy entirely (the "neither"
--       shape a policy-only scan can't see — e.g. gear_products before 019).
-- The profiles authenticated INSERT/UPDATE flag is a known false positive:
-- profiles has COLUMN-level grants (003/017) that role_table_grants doesn't show.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.write_permission_audit()
RETURNS TABLE(tablename text, role text, problem text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pol AS (
    SELECT p.tablename, p.cmd, r::text AS role
    FROM pg_policies p,
         LATERAL unnest(CASE WHEN p.roles @> ARRAY['public']::name[]
           THEN ARRAY['anon','authenticated']::name[] ELSE p.roles END) AS r
    WHERE p.schemaname='public' AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
  ),
  needed AS (
    SELECT DISTINCT tablename, role, priv FROM pol,
      LATERAL unnest(CASE WHEN cmd='ALL' THEN ARRAY['INSERT','UPDATE','DELETE'] ELSE ARRAY[cmd] END) AS priv
    WHERE role IN ('anon','authenticated')
  ),
  grants AS (
    SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee IN ('anon','authenticated')
  ),
  policy_without_grant AS (
    SELECT n.tablename, n.role, 'policy_'||n.priv||'_without_grant' AS problem
    FROM needed n
    LEFT JOIN grants g ON g.table_name=n.tablename AND g.grantee=n.role AND g.privilege_type=n.priv
    WHERE g.privilege_type IS NULL
      AND NOT (n.tablename='profiles' AND n.role='authenticated')
  ),
  admin_tables(tablename) AS (
    VALUES ('gear_products'),('voice_lines'),('suggestions'),('brands'),
           ('restaurants'),('guides'),('reviews'),('signature_dishes'),('submissions')
  ),
  neither AS (
    SELECT a.tablename, 'authenticated'::text AS role,
           'admin_table_missing_grant_or_policy'::text AS problem
    FROM admin_tables a
    WHERE NOT EXISTS (
      SELECT 1 FROM grants g WHERE g.table_name=a.tablename AND g.grantee='authenticated'
        AND g.privilege_type IN ('INSERT','UPDATE','DELETE')
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=a.tablename
        AND p.cmd IN ('INSERT','UPDATE','DELETE','ALL')
    )
  )
  SELECT * FROM policy_without_grant
  UNION ALL
  SELECT * FROM neither;
$$;

REVOKE ALL ON FUNCTION public.write_permission_audit() FROM public;
GRANT EXECUTE ON FUNCTION public.write_permission_audit() TO service_role;
