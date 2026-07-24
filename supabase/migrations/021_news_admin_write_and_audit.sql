-- ============================================================================
-- 021 · Found by the 020 guardrail's code-scan half: `news` is admin-written
-- (the enrich-news route inserts via ctx.db) but had only a public-read policy —
-- no write grant/policy for authenticated. Same "neither" shape as gear_products,
-- so it fails whenever ctx.db falls back to the cookie client. Fix it the same
-- way and add `news` to the audit function's enforced admin-table set.
-- ============================================================================

GRANT INSERT, UPDATE, DELETE ON public.news TO authenticated;
DROP POLICY IF EXISTS "Admin manage news" ON public.news;
CREATE POLICY "Admin manage news" ON public.news
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Extend the guardrail to enforce news going forward.
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
    VALUES ('gear_products'),('voice_lines'),('suggestions'),('brands'),('news'),
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
