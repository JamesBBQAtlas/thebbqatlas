-- ============================================================================
-- 005 · Tier 1 (NEW) — Admin role management (sanctioned counterpart to F-01).
-- Since normal users can no longer write `role`, admins get a service-role path
-- to grant/revoke admin, with a full audit trail. Used by /api/admin/roles and
-- the /admin/team control-panel page.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.role_change_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email  text,
  target_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email text,
  old_role     public.user_role,
  new_role     public.user_role,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- Service-role only (no policies); admin pages read/write via the service client.
ALTER TABLE public.role_change_log ENABLE ROW LEVEL SECURITY;

-- Look up a user by email (auth.users isn't PostgREST-queryable). SECURITY
-- DEFINER, but EXECUTE revoked from anon/authenticated → service-role only.
CREATE OR REPLACE FUNCTION public.admin_lookup_user(p_email text)
RETURNS TABLE(id uuid, email text, role public.user_role)
LANGUAGE sql SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT u.id, u.email, p.role
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_lookup_user(text) FROM anon, authenticated, public;

-- List current admins with emails (control-panel table).
CREATE OR REPLACE FUNCTION public.admin_list_admins()
RETURNS TABLE(id uuid, email text, display_name text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT p.id, u.email, p.display_name, p.created_at
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'admin'
  ORDER BY p.created_at;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_admins() FROM anon, authenticated, public;

-- Count admins (used to block removing the last admin → prevents lockout).
CREATE OR REPLACE FUNCTION public.admin_count()
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::int FROM public.profiles WHERE role = 'admin';
$$;
REVOKE EXECUTE ON FUNCTION public.admin_count() FROM anon, authenticated, public;
