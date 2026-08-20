-- 081_chain_parent_hint.sql
-- Niggle v2 #4 — a one-click "Confirm branch" for held footprint-outlier / off-brand
-- candidates. When such a row is HELD unattached (chain_parent_id null, needs_attention),
-- we record the parent it WOULD attach to, so an admin can confirm it in one click.
-- Additive + idempotent. No data change.

alter table restaurants add column if not exists chain_parent_hint uuid references restaurants(id) on delete set null;

comment on column restaurants.chain_parent_hint is
  'The chain parent a HELD (footprint-outlier / off-brand) candidate would attach to if confirmed. Powers the one-click "Confirm branch" admin action; cleared on confirm/attach.';
