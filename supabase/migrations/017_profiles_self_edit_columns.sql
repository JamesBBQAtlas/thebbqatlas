-- ============================================================================
-- 017 · Let users edit their own SAFE profile fields.
-- F-01 (migration 003) revoked table-wide UPDATE/INSERT on profiles and granted
-- UPDATE on a safe column subset. That subset missed avatar_url + account_type,
-- and /api/account used an UPSERT (which needs INSERT — still correctly revoked),
-- so saving a username/avatar/account type failed with "permission denied for
-- table profiles". This grants UPDATE on the safe, self-editable columns only.
-- role / is_premium / premium_until stay non-grantable, and the
-- profiles_update_own policy's WITH CHECK still pins role.
-- (/api/account also switched from upsert → update.)
-- ============================================================================

GRANT UPDATE (display_name, username, avatar_url, account_type)
  ON public.profiles TO authenticated;
