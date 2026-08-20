-- 083_pro_tier_and_links.sql
-- Pricing realignment (Aug 19). Separates PAGE CONTROL (the $49 Pro tier — hero + all
-- owner links) from FEATURED PROMINENCE (the time-boxed weekly window, which stays on
-- the existing is_premium / premium_until columns). Adds the remaining owner link types.
-- Additive + idempotent. No data change. Entitlement is enforced server-side; these
-- columns just hold state written by the Stripe webhook / moderated owner edits.

-- Page-control subscription tier (the $49 Pro, or the dormant $29.99 lower).
-- listing_tier: null | 'pro' | 'lower'. listing_until = the tier's current-period end.
alter table restaurants add column if not exists listing_tier  text;
alter table restaurants add column if not exists listing_until timestamptz;

-- The remaining PREMIUM owner links (Pro-gated), alongside shop_url + tickets_url (079).
alter table restaurants add column if not exists gift_card_url text;
alter table restaurants add column if not exists order_url     text;

comment on column restaurants.listing_tier is
  'Page-control subscription tier: null | pro | lower. Pro ($49/mo) unlocks hero control + all owner links. Written by the Stripe webhook.';
comment on column restaurants.listing_until is
  'Current-period end of the page-control (listing_tier) subscription. Control lapses when this passes.';
comment on column restaurants.gift_card_url is
  'Owner gift-card link. PREMIUM (Pro tier) capability; https only; set via the moderated owner-edit path.';
comment on column restaurants.order_url is
  'Owner online-ordering link. PREMIUM (Pro tier) capability; https only; set via the moderated owner-edit path.';
