-- 085 — B3: owner/venue Terms & Conditions + versioned acceptance capture.
--
-- We are about to take recurring money and hand over page control, so every claim
-- and every first paid checkout must record acceptance of a versioned owner T&C.
-- This table is the append-only ledger of those acceptances. Idempotent + additive.
--
-- Access model (mirrors admin_audit_log):
--   • Writes are SERVICE-ROLE only — no insert policy, so an RLS-scoped (cookie)
--     client cannot forge an acceptance; the server writes via the service role.
--   • READ: the accepting user reads their own rows; admins read all.
--   • APPEND-ONLY at the DB level: UPDATE/DELETE blocked by trigger for everyone
--     (the service role bypasses RLS but not triggers).

create table if not exists owner_terms_acceptances (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id),
  restaurant_id uuid references restaurants(id),
  terms_version text not null,                 -- e.g. venue-1.0-2026-08 (TERMS_VERSION)
  accepted_at   timestamptz not null default now(),
  ip            inet,
  context       jsonb                          -- { at: 'claim'|'checkout', route, plan? } — no PII beyond ip
);

create index if not exists owner_terms_acceptances_user_idx    on owner_terms_acceptances (user_id, accepted_at desc);
create index if not exists owner_terms_acceptances_venue_idx   on owner_terms_acceptances (restaurant_id, accepted_at desc);
create index if not exists owner_terms_acceptances_version_idx on owner_terms_acceptances (user_id, terms_version);

-- Append-only guard (search_path pinned per the advisor).
create or replace function owner_terms_acceptances_no_mutate()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  raise exception 'owner_terms_acceptances is append-only; % is not permitted', tg_op;
end;
$$;
drop trigger if exists owner_terms_acceptances_block_update on owner_terms_acceptances;
create trigger owner_terms_acceptances_block_update before update on owner_terms_acceptances
  for each row execute function owner_terms_acceptances_no_mutate();
drop trigger if exists owner_terms_acceptances_block_delete on owner_terms_acceptances;
create trigger owner_terms_acceptances_block_delete before delete on owner_terms_acceptances
  for each row execute function owner_terms_acceptances_no_mutate();

alter table owner_terms_acceptances enable row level security;
drop policy if exists owner_terms_read_own on owner_terms_acceptances;
create policy owner_terms_read_own on owner_terms_acceptances
  for select to authenticated
  using (auth.uid() = user_id or exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

grant select on table owner_terms_acceptances to authenticated;
grant all    on table owner_terms_acceptances to service_role;

comment on table owner_terms_acceptances is
  'Append-only record of owner/venue T&C acceptances (B3): user, venue, TERMS_VERSION, accepted_at, ip. Captured at claim and first paid checkout. Writes service-role only; admin/self read; UPDATE/DELETE blocked by trigger.';
