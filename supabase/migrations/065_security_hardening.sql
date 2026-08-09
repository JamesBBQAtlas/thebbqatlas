-- Part 7 — security hardening (Fable audit / Supabase advisor cleanup).
--
-- Clears every WARN-level security advisory:
--   * function_search_path_mutable  (content_audit_no_update, ai_usage_report, nearby_venues)
--   * extension_in_public           (citext)
--   * anon/authenticated_security_definer_function_executable (is_admin)
--
-- is_admin() cannot simply have EXECUTE revoked or be switched to SECURITY
-- INVOKER: it is used inside RLS policies for anon/authenticated reads, RLS
-- evaluation requires EXECUTE on it, and anon has no SELECT on `profiles`.
-- Both "fixes" would break anonymous reads of restaurants/guides/reviews/
-- submissions. Instead we move it into a non-exposed `private` schema so it is
-- no longer a public PostgREST RPC, while it stays usable inside RLS.
--
-- Applied as one atomic block with a built-in anon/authenticated smoke test:
-- if any public read errors after the changes, the whole migration rolls back.
do $migration$
declare r record; new_qual text; new_check text; stmt text; cnt int;
begin
  -- 1) Pin search_path on the three flagged functions -----------------------
  alter function public.content_audit_no_update() set search_path = public;
  alter function public.ai_usage_report() set search_path = public;
  alter function public.nearby_venues(double precision, double precision, uuid, integer, double precision)
        set search_path = public;

  -- 2) Move citext out of public. `extensions` is on the default search_path
  --    and anon/authenticated hold USAGE, so the citext `username` column and
  --    its operators keep resolving. Guarded so a re-run is a no-op.
  if exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'citext' and n.nspname = 'public'
  ) then
    alter extension citext set schema extensions;
  end if;

  -- 3) Take is_admin() out of the exposed API schema ------------------------
  create schema if not exists private;
  grant usage on schema private to anon, authenticated;

  create or replace function private.is_admin()
    returns boolean language sql stable security definer set search_path = public
    as 'select exists (select 1 from profiles where id = auth.uid() and role = ''admin'')';
  grant execute on function private.is_admin() to anon, authenticated;

  -- Re-point every policy calling is_admin() at private.is_admin() in place
  -- (preserves roles / cmd / ordering). Skips any already migrated.
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') like '%is_admin()%' or coalesce(with_check,'') like '%is_admin()%')
      and coalesce(qual,'') not like '%private.is_admin()%'
      and coalesce(with_check,'') not like '%private.is_admin()%'
  loop
    stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if r.qual is not null then
      new_qual := replace(r.qual, 'is_admin()', 'private.is_admin()');
      stmt := stmt || format(' using (%s)', new_qual);
    end if;
    if r.with_check is not null then
      new_check := replace(r.with_check, 'is_admin()', 'private.is_admin()');
      stmt := stmt || format(' with check (%s)', new_check);
    end if;
    execute stmt;
  end loop;

  drop function if exists public.is_admin();

  -- 4) Smoke test — force is_admin() evaluation as anon then authenticated on
  --    every public-read table that references it. Any permission error here
  --    aborts and rolls back the entire migration.
  perform set_config('role','anon', true);
  select count(*) into cnt from public.restaurants where status <> 'approved';
  select count(*) into cnt from public.guides where is_published = false;
  select count(*) into cnt from public.reviews where status <> 'approved';
  select count(*) into cnt from public.submissions;
  perform set_config('role','authenticated', true);
  select count(*) into cnt from public.restaurants where status <> 'approved';
  select count(*) into cnt from public.reviews where status <> 'approved';
  select count(*) into cnt from public.submissions;
  perform set_config('role','postgres', true);
end
$migration$;

-- NOTE (intentional, not a gap): the remaining INFO-level `rls_enabled_no_policy`
-- advisories on ai_usage_log, contact_messages, email_log, email_subscribers,
-- enrichment_runs, events, outreach_log, rate_limits, role_change_log,
-- search_impressions, submission_abuse_log and venue_views are deliberate.
-- These are server-only telemetry/log tables: RLS is ON with no policy, so
-- anon/authenticated are denied all rows; only the service role (which bypasses
-- RLS) reads or writes them. That is the desired deny-all posture.
