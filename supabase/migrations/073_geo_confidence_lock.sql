-- 073 — geocode-fix: pin confidence + manual-pin lock.
--
-- The recurring "pins land in the wrong place" class of bug is fixed globally by
-- (1) a country-constrained, postcode-anchored, confidence-gated geocode and
-- (2) never overwriting a pin a human deliberately set. This migration adds the
-- columns those two behaviours need:
--
--   • geo_precision  — how granular the stored pin is (poi / address / street /
--                      postcode / place / region / none). "postcode" and coarser
--                      are approximate, not confirmed.
--   • geo_confidence — 0..1 score the geocoder / anchor assigned this pin.
--   • geo_source     — where the pin came from ('maptiler', 'postcodes.io',
--                      'manual' for a hand-placed pin, NULL for legacy/unknown).
--   • geo_locked     — TRUE once an admin sets/confirms the pin by hand. Any
--                      re-geocode (enrich, update-details, ops-refresh) MUST skip
--                      a locked record's coordinates — mirrors how manual_copy
--                      protects hand-edited copy. An explicit "re-geocode from
--                      address" action clears it.

alter table public.restaurants
  add column if not exists geo_precision  text,
  add column if not exists geo_confidence double precision,
  add column if not exists geo_source     text,
  add column if not exists geo_locked      boolean not null default false;

comment on column public.restaurants.geo_precision is
  'Granularity of the stored pin (poi/address/street/postcode/place/region/none). postcode-or-coarser = approximate.';
comment on column public.restaurants.geo_confidence is
  'Geocode confidence 0..1. Low / unset means the pin should be verified.';
comment on column public.restaurants.geo_source is
  'Origin of the pin: maptiler, postcodes.io, manual (hand-placed), or NULL (legacy/unknown).';
comment on column public.restaurants.geo_locked is
  'TRUE when an admin set/confirmed the pin by hand — re-geocoding must skip these coordinates (like manual_copy). Cleared by an explicit re-geocode-from-address action.';

-- A partial index so the pin-sanity audit and the admin "shaky pins" view can
-- cheaply find low-confidence / unset-precision pins that still need a human.
create index if not exists restaurants_geo_unverified_idx
  on public.restaurants (geo_confidence)
  where geo_locked = false;
