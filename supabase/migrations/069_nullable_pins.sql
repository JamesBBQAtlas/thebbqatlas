-- 069 — Part 4 (FAIL 4): allow lat/lng to be NULL so an un-located venue has no
-- pin, instead of being parked at 0,0 ("null island"). The whole app already
-- treats (0,0) as the "no pin" sentinel (filtered off the map, blocked from
-- publish); this lets new un-located chain seeds store a genuine NULL, and reads
-- now treat NULL and 0,0 identically as "no pin". Existing 0,0 rows are untouched
-- and still valid.

alter table public.restaurants
  alter column lat drop not null,
  alter column lng drop not null;

comment on column public.restaurants.lat is
  'Latitude. NULL or 0,0 both mean "no pin yet" — such a venue is kept off the map and blocked from publishing until a real pin is set (Part 4 FAIL 4).';
