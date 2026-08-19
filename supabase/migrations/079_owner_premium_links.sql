-- 079_owner_premium_links.sql
-- Premium 3c — owner listing-tier link seam. Two PREMIUM (Featured-listing) owner
-- link fields: an online shop / order-online / merch link, and a tickets & events
-- link. Additive + idempotent. No data change. Entitlement is enforced in code
-- (server-side, gated on the Featured listing) — these columns just hold the value.

alter table restaurants add column if not exists shop_url    text;
alter table restaurants add column if not exists tickets_url text;

comment on column restaurants.shop_url is
  'Owner-provided online shop / order-online / merch link. PREMIUM (Featured listing) capability; https only; set via the moderated owner-edit path.';
comment on column restaurants.tickets_url is
  'Owner-provided tickets & events link. PREMIUM (Featured listing) capability; https only; set via the moderated owner-edit path.';
