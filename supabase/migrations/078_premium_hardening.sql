-- 078_premium_hardening.sql
-- Premium go-live (Build Prompt 3a) — make server-side entitlement reads actually work,
-- and make the Stripe webhook idempotent. Idempotent + additive. No data change.

-- 1 — SELF-READ policies (fixes a real gating bug). `subscriptions` and `orders` had
--     RLS ENABLED but ZERO policies, so a read through the RLS-bound server client saw
--     nothing → getPremiumStatus returned isPremium=false for EVERYONE, even paid users.
--     Let a user read their OWN row (read-only; all writes stay service-role only).
drop policy if exists "own subscription select" on subscriptions;
create policy "own subscription select" on subscriptions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "own orders select" on orders;
create policy "own orders select" on orders
  for select to authenticated
  using (auth.uid() = user_id);

-- 2 — Stripe event idempotency ledger. Every processed event.id is recorded once, so a
--     REPLAYED / retried / duplicate webhook is skipped and never double-applies
--     side-effects (or double-writes an audit row). Service-role write, admin read.
create table if not exists stripe_events (
  id          text primary key,          -- Stripe event id (evt_…)
  type        text not null,
  created_at  timestamptz not null default now()
);
alter table stripe_events enable row level security;
drop policy if exists stripe_events_admin_read on stripe_events;
create policy stripe_events_admin_read on stripe_events
  for select to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

comment on table stripe_events is
  'Processed Stripe webhook event ids — idempotency ledger (Build Prompt 3a). Service-role write; admin read.';
