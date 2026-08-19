-- 076_admin_audit_log.sql
-- Unified, append-only log of admin / owner / system actions across entities
-- (venues, profiles, claims, subscriptions, media). The spine that claims, owner
-- edits, subscriptions and photo moderation all log into. Idempotent + additive.
--
-- Access model:
--   • Admin READ only (RLS select policy — the inline profiles.role='admin' form,
--     matching content_audit / 044).
--   • Writes are SERVICE-ROLE only: there is deliberately NO insert policy, so an
--     RLS-scoped (cookie) client cannot write; only the service-role client (which
--     bypasses RLS) inserts, via logAdminAction().
--   • APPEND-ONLY, enforced at the DB level for EVERYONE incl. the service role:
--     triggers raise on UPDATE and DELETE (the service role bypasses RLS but not
--     triggers), so history can never be rewritten or erased. (Retention/rotation
--     is deliberately out of scope; a future migration would drop the delete guard.)

create table if not exists admin_audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references auth.users(id),   -- null = system / automated action
  actor_email  text,                             -- denormalised for durability (like role_change_log)
  action       text not null,                    -- dotted verb: venue.publish, user.role_change, claim.approve, …
  entity_type  text not null,                    -- restaurant | profile | restaurant_claim | subscription | media | …
  entity_id    uuid,
  summary      text not null,                    -- human one-liner
  diff         jsonb,                            -- { field: { old, new } } or before/after; oversized blobs omitted by the helper
  context      jsonb,                            -- minimal request meta (route/email); NO PII beyond that
  created_at   timestamptz not null default now()
);

create index if not exists admin_audit_log_entity_idx on admin_audit_log (entity_type, entity_id, created_at desc);
create index if not exists admin_audit_log_actor_idx  on admin_audit_log (actor_id, created_at desc);
create index if not exists admin_audit_log_action_idx on admin_audit_log (action, created_at desc);

-- Append-only guard: block UPDATE and DELETE for everyone (service role included).
create or replace function admin_audit_log_no_mutate()
returns trigger language plpgsql as $$
begin
  raise exception 'admin_audit_log is append-only; % is not permitted', tg_op;
end;
$$;
drop trigger if exists admin_audit_log_block_update on admin_audit_log;
create trigger admin_audit_log_block_update
  before update on admin_audit_log
  for each row execute function admin_audit_log_no_mutate();
drop trigger if exists admin_audit_log_block_delete on admin_audit_log;
create trigger admin_audit_log_block_delete
  before delete on admin_audit_log
  for each row execute function admin_audit_log_no_mutate();

alter table admin_audit_log enable row level security;
-- Admin READ only. No insert/update/delete policy → non-admins cannot read, and
-- only the service-role client (bypasses RLS) can write.
drop policy if exists admin_audit_log_admin_read on admin_audit_log;
create policy admin_audit_log_admin_read on admin_audit_log
  for select to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

comment on table admin_audit_log is
  'Append-only unified log of admin/owner/system actions across entities. Admin-read via RLS; writes service-role only; UPDATE/DELETE blocked by trigger (retention out of scope).';
