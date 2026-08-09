-- 067 — Part 5: protect an operator-set item type (category) from being
-- clobbered by a later re-enrich, exactly like `manual_copy` protects hand-
-- written copy.
--
-- Enrichment now CLASSIFIES `category` (restaurant / food_truck / caterer /
-- retailer / market / event / festival / school) from the business's own site
-- and socials. That classification is a PROPOSAL: whenever the operator sets or
-- changes the item type by hand (Add-listing "Item type" dropdown or the venue
-- editor), we stamp `manual_category = true` and a later AI enrich must leave the
-- value alone. A bulk-import default of 'restaurant' is NOT a manual choice, so
-- it stays `false` and remains reclassifiable.

alter table public.restaurants
  add column if not exists manual_category boolean not null default false,
  add column if not exists manual_category_at timestamptz;

comment on column public.restaurants.manual_category is
  'True when the item type (category) was set/confirmed by an operator; a later AI re-enrich must not overwrite it (Part 5).';
