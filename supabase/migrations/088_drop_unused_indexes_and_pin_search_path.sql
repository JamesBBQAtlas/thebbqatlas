-- 088 — L7 + L8.
--
-- L7: drop genuinely-unused indexes to reclaim write cost. Scope is deliberate:
--   we drop only pure telemetry/analytics-rollup or superseded indexes (the ones on
--   high-write tables where an unused index is pure overhead). We DELIBERATELY RETAIN
--   four "unused-but-functional" indexes the advisor also flagged, because each backs a
--   real (if infrequent) lookup that just hasn't incremented stats yet:
--     • media_safety_status_idx / review_photos_safety_status_idx — the weekly photo
--       re-sweep queries by safety_status.
--     • email_subscribers_token_idx — unsubscribe-by-token lookup.
--     • submissions_submitter_ip_idx — antispam IP checks.
--   Also retained: admin_audit_log_entity_idx / _actor_idx (back the admin change-log
--   filters; admin_audit_log is append-only + low-write, so they cost ~nothing).
--
-- L8: pin the mutable search_path on admin_audit_log_no_mutate (the one advisor WARN).

drop index if exists restaurants_offerings_gin;
drop index if exists restaurants_geo_unverified_idx;
drop index if exists click_events_media_pick_idx;
drop index if exists click_events_rollup_idx;
drop index if exists venue_views_restaurant_created_idx;
drop index if exists search_impressions_restaurant_created_idx;
drop index if exists submission_abuse_country_idx;
drop index if exists saved_spots_restaurant_id_idx;

create or replace function admin_audit_log_no_mutate()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin_audit_log is append-only; % is not permitted', tg_op;
end;
$$;
