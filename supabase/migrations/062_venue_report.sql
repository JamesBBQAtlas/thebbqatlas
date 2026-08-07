-- Phase 5.2 — the venue monthly report.
-- Live aggregation (no materialized view needed at current scale) over the
-- Phase-1 capture tables: profile views, click-throughs by destination, saves,
-- check-ins and search appearances, for the last 30 days vs the prior 30 so the
-- dashboard + monthly email can show month-on-month deltas. Bot traffic excluded
-- where the table records it. SECURITY DEFINER so the owner-gated API can call it
-- via the service role; execution is restricted to service_role.
CREATE OR REPLACE FUNCTION public.venue_report(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH b AS (
    SELECT now() - interval '30 days' AS cur_start,
           now() - interval '60 days' AS prev_start,
           now() - interval '30 days' AS prev_end
  ),
  vv AS (
    SELECT
      count(*) FILTER (WHERE created_at >= (SELECT cur_start FROM b) AND NOT is_bot) AS cur,
      count(*) FILTER (WHERE created_at >= (SELECT prev_start FROM b) AND created_at < (SELECT prev_end FROM b) AND NOT is_bot) AS prev
    FROM venue_views WHERE restaurant_id = p_restaurant_id
  ),
  ce AS (
    SELECT event_type,
      count(*) FILTER (WHERE created_at >= (SELECT cur_start FROM b) AND NOT is_bot) AS cur,
      count(*) FILTER (WHERE created_at >= (SELECT prev_start FROM b) AND created_at < (SELECT prev_end FROM b) AND NOT is_bot) AS prev
    FROM click_events WHERE restaurant_id = p_restaurant_id GROUP BY event_type
  ),
  si AS (
    SELECT
      count(*) FILTER (WHERE created_at >= (SELECT cur_start FROM b) AND NOT is_bot) AS cur,
      count(*) FILTER (WHERE created_at >= (SELECT prev_start FROM b) AND created_at < (SELECT prev_end FROM b) AND NOT is_bot) AS prev
    FROM search_impressions WHERE restaurant_id = p_restaurant_id
  ),
  ci AS (
    SELECT
      count(*) FILTER (WHERE created_at >= (SELECT cur_start FROM b)) AS cur,
      count(*) FILTER (WHERE created_at >= (SELECT prev_start FROM b) AND created_at < (SELECT prev_end FROM b)) AS prev
    FROM check_ins WHERE restaurant_id = p_restaurant_id
  ),
  sv AS (
    SELECT
      count(*) FILTER (WHERE created_at >= (SELECT cur_start FROM b)) AS cur,
      count(*) FILTER (WHERE created_at >= (SELECT prev_start FROM b) AND created_at < (SELECT prev_end FROM b)) AS prev
    FROM saved_spots WHERE restaurant_id = p_restaurant_id
  ),
  clk AS (
    SELECT k,
      (SELECT cur FROM ce WHERE event_type = k) AS cur,
      (SELECT prev FROM ce WHERE event_type = k) AS prev
    FROM (VALUES ('website'),('phone'),('map'),('instagram'),('share')) AS t(k)
  )
  SELECT jsonb_build_object(
    'window_days', 30,
    'views',      jsonb_build_object('cur', (SELECT cur FROM vv),  'prev', (SELECT prev FROM vv)),
    'search',     jsonb_build_object('cur', (SELECT cur FROM si),  'prev', (SELECT prev FROM si)),
    'checkins',   jsonb_build_object('cur', (SELECT cur FROM ci),  'prev', (SELECT prev FROM ci)),
    'saves',      jsonb_build_object('cur', (SELECT cur FROM sv),  'prev', (SELECT prev FROM sv)),
    'website',    jsonb_build_object('cur', COALESCE((SELECT cur FROM clk WHERE k='website'),0),   'prev', COALESCE((SELECT prev FROM clk WHERE k='website'),0)),
    'phone',      jsonb_build_object('cur', COALESCE((SELECT cur FROM clk WHERE k='phone'),0),     'prev', COALESCE((SELECT prev FROM clk WHERE k='phone'),0)),
    'directions', jsonb_build_object('cur', COALESCE((SELECT cur FROM clk WHERE k='map'),0),       'prev', COALESCE((SELECT prev FROM clk WHERE k='map'),0)),
    'instagram',  jsonb_build_object('cur', COALESCE((SELECT cur FROM clk WHERE k='instagram'),0), 'prev', COALESCE((SELECT prev FROM clk WHERE k='instagram'),0)),
    'shares',     jsonb_build_object('cur', COALESCE((SELECT cur FROM clk WHERE k='share'),0),     'prev', COALESCE((SELECT prev FROM clk WHERE k='share'),0))
  );
$$;

REVOKE ALL ON FUNCTION public.venue_report(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venue_report(uuid) TO service_role;
