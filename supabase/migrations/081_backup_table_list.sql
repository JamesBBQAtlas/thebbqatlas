-- 081_backup_table_list.sql
-- Weekly independent backup (BUILD PROMPT — R2/B2 export). A tiny helper the export
-- job calls to DISCOVER which tables to snapshot, so the backup can never silently
-- miss a new table as the schema grows ("don't miss one"). Returns every public base
-- table EXCEPT a documented set of ephemeral / high-churn telemetry that is not worth
-- backing up (transient rate-limit counters + pure analytics event streams that carry
-- no irreplaceable business/revenue/ownership data). Idempotent.

create or replace function public.backup_table_list()
returns setof text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname not in (
      -- Ephemeral / regenerable telemetry — intentionally excluded from backups.
      'rate_limits',          -- transient anti-abuse counters
      'click_events',         -- analytics event stream
      'search_impressions',   -- analytics event stream
      'venue_views',          -- analytics event stream
      'view_history'          -- analytics event stream
    )
  order by c.relname;
$$;

-- The export job runs as the service role only. Lock the function down to it.
revoke all on function public.backup_table_list() from public, anon, authenticated;
grant execute on function public.backup_table_list() to service_role;

comment on function public.backup_table_list() is
  'Tables the weekly backup snapshots — every public base table minus ephemeral telemetry. Service-role only.';
