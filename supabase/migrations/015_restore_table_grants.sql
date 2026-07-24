-- ============================================================================
-- 015 · Restore missing base table GRANTs.
-- These tables had RLS enabled + correct policies, but NO table-level privileges
-- for anon/authenticated — so PostgREST rejected every request with
-- "permission denied for table" before RLS ever ran. This broke check-ins,
-- "Save to My Atlas" side effects, media, view tracking, bookmarks, follows,
-- claims, orders, subscriptions, and public reads of news/brands.
-- Grants below mirror each table's existing RLS policies exactly; RLS still
-- governs which ROWS each role may touch. Service-role-only tables
-- (contact_messages, email_log, email_subscribers, enrichment_runs,
-- rate_limits, role_change_log, suggestions) are intentionally left ungranted.
-- ============================================================================

-- Public-read content
GRANT SELECT ON public.brands TO anon, authenticated;
GRANT SELECT ON public.news   TO anon, authenticated;

-- Owner-scoped CRUD (authenticated)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookmarks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follows   TO authenticated;

-- check_ins: owner CRUD + public read of public-visibility rows
GRANT SELECT ON public.check_ins TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.check_ins TO authenticated;

-- media: public read (approved/own) + owner insert/delete
GRANT SELECT ON public.media TO anon;
GRANT SELECT, INSERT, DELETE ON public.media TO authenticated;

-- view_history: owner insert/select/update
GRANT SELECT, INSERT, UPDATE ON public.view_history TO authenticated;

-- restaurant_claims: owner insert/select
GRANT SELECT, INSERT ON public.restaurant_claims TO authenticated;

-- read-only owner tables
GRANT SELECT ON public.orders        TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
