-- Append-only editorial/status history for venues (mirrors role_change_log).
create table if not exists content_audit (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  field         text not null,
  old_value     jsonb,
  new_value     jsonb,
  source        text not null,
  changed_by    uuid references auth.users(id),
  note          text,
  created_at    timestamptz not null default now()
);

create index if not exists content_audit_restaurant_idx on content_audit (restaurant_id, created_at desc);
create index if not exists content_audit_created_idx on content_audit (created_at desc);

create or replace function content_audit_no_update()
returns trigger language plpgsql as $$
begin
  raise exception 'content_audit is append-only; UPDATE is not permitted';
end;
$$;
drop trigger if exists content_audit_block_update on content_audit;
create trigger content_audit_block_update
  before update on content_audit
  for each row execute function content_audit_no_update();

alter table content_audit enable row level security;
drop policy if exists content_audit_admin_read on content_audit;
create policy content_audit_admin_read on content_audit
  for select to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

comment on table content_audit is
  'Append-only editorial/status change history for venues. One row per changed field.';
