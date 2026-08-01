-- PRE-623: exact per-call AI usage ledger. Append-only — one row per AI API
-- call, never updated. System-wide record for provider/model/task cost
-- accounting over any date range (per-venue enrichment_cost stays the per-venue
-- view). Cannot be backfilled, so we start logging from row one.
create table if not exists ai_usage_log (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  provider       text not null,
  model          text not null,
  task           text not null,
  entity_type    text,
  entity_id      text,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  search_count   integer not null default 0,
  cost           numeric(12,6) not null default 0,
  usage_raw      jsonb
);

create index if not exists ai_usage_log_created_idx on ai_usage_log (created_at desc);
create index if not exists ai_usage_log_provider_idx on ai_usage_log (provider);
create index if not exists ai_usage_log_task_idx on ai_usage_log (task);

alter table ai_usage_log enable row level security;

comment on table ai_usage_log is
  'Append-only per-call AI usage ledger (provider/model/task/tokens/searches/cost). One row per API call; never updated.';

-- Exact server-side rollup for the "Spend by provider" panel (no 1000-row cap).
create or replace function ai_usage_report()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'allTime', (select jsonb_build_object(
      'anthropic', coalesce(sum(cost) filter (where provider='anthropic'),0),
      'xai',       coalesce(sum(cost) filter (where provider='xai'),0),
      'total',     coalesce(sum(cost),0),
      'searches',  coalesce(sum(search_count),0),
      'calls',     count(*)) from ai_usage_log),
    'today', (select jsonb_build_object(
      'anthropic', coalesce(sum(cost) filter (where provider='anthropic'),0),
      'xai',       coalesce(sum(cost) filter (where provider='xai'),0),
      'total',     coalesce(sum(cost),0)) from ai_usage_log
      where (created_at at time zone 'utc')::date = (now() at time zone 'utc')::date),
    'week', (select jsonb_build_object(
      'anthropic', coalesce(sum(cost) filter (where provider='anthropic'),0),
      'xai',       coalesce(sum(cost) filter (where provider='xai'),0),
      'total',     coalesce(sum(cost),0)) from ai_usage_log
      where created_at >= now() - interval '7 days'),
    'venuesEnriched', (select count(distinct entity_id) from ai_usage_log
      where entity_type='restaurant' and task in ('enrich','flagship_enrich')),
    'byModel', (select coalesce(jsonb_agg(row_to_json(m) order by m.cost desc),'[]'::jsonb) from (
      select provider, model, sum(cost) as cost, count(*) as calls,
             sum(input_tokens) as input_tokens, sum(output_tokens) as output_tokens,
             sum(search_count) as searches
      from ai_usage_log group by provider, model) m),
    'byTask', (select coalesce(jsonb_agg(row_to_json(t) order by t.cost desc),'[]'::jsonb) from (
      select task, sum(cost) as cost, count(*) as calls,
             sum(cost) filter (where provider='anthropic') as anthropic,
             sum(cost) filter (where provider='xai') as xai
      from ai_usage_log group by task) t)
  );
$$;
