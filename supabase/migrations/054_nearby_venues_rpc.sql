-- Phase 3b (Fable H-1): compute "nearby" in Postgres instead of loading the whole
-- restaurants table into Node and haversine-sorting it in JS on every venue view.
-- Applied to prod via MCP; recorded here for version history.

create or replace function public.nearby_venues(
  p_lat double precision,
  p_lng double precision,
  p_exclude uuid,
  p_limit integer default 6,
  p_max_km double precision default 320
)
returns table (
  id uuid,
  slug text,
  name text,
  city text,
  country text,
  country_code text,
  style text,
  lat double precision,
  lng double precision,
  distance_km double precision
)
language sql
stable
as $$
  select q.id, q.slug, q.name, q.city, q.country, q.country_code, q.style,
         q.lat, q.lng, q.distance_km
  from (
    select
      r.id, r.slug, r.name, r.city, r.country, r.country_code, r.style::text as style,
      r.lat, r.lng,
      (6371 * 2 * asin(sqrt(
        power(sin(radians(r.lat - p_lat) / 2), 2) +
        cos(radians(p_lat)) * cos(radians(r.lat)) *
        power(sin(radians(r.lng - p_lng) / 2), 2)
      ))) as distance_km
    from public.restaurants r
    where r.status = 'approved'
      and coalesce(r.permanently_closed, false) = false
      and r.id <> p_exclude
      and r.lat is not null and r.lng is not null
      and not (r.lat = 0 and r.lng = 0)
      and r.lat between p_lat - (p_max_km / 111.0) and p_lat + (p_max_km / 111.0)
      and r.lng between p_lng - (p_max_km / (111.0 * greatest(cos(radians(p_lat)), 0.05)))
                    and p_lng + (p_max_km / (111.0 * greatest(cos(radians(p_lat)), 0.05)))
  ) q
  where q.distance_km <= p_max_km
  order by q.distance_km asc
  limit least(greatest(p_limit, 1), 24);
$$;

grant execute on function public.nearby_venues(double precision, double precision, uuid, integer, double precision) to anon, authenticated;

create index if not exists restaurants_approved_geo_idx
  on public.restaurants (lat, lng)
  where status = 'approved';
