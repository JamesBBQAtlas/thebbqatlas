-- 087 — M12: covering indexes on the foreign keys flagged by the performance advisor.
-- Fine at 811 venues today (venue reads are 2–4ms), but reviews/signature_dishes and
-- the ownership/attribution FKs will seq-scan as those tables grow. Idempotent + additive.

create index if not exists addresses_user_id_idx                      on addresses(user_id);
create index if not exists ai_usage_log_user_id_idx                   on ai_usage_log(user_id);
create index if not exists contact_messages_user_id_idx               on contact_messages(user_id);
create index if not exists content_audit_changed_by_idx               on content_audit(changed_by);
create index if not exists email_log_user_id_idx                      on email_log(user_id);
create index if not exists enrichment_runs_created_by_idx             on enrichment_runs(created_by);
create index if not exists follows_following_id_idx                   on follows(following_id);
create index if not exists media_user_id_idx                          on media(user_id);
create index if not exists outreach_log_created_by_idx                on outreach_log(created_by);
create index if not exists restaurant_claims_decided_by_idx           on restaurant_claims(decided_by);
create index if not exists restaurant_claims_user_id_idx              on restaurant_claims(user_id);
create index if not exists restaurants_chain_parent_hint_idx          on restaurants(chain_parent_hint);
create index if not exists restaurants_first_submission_id_idx        on restaurants(first_submission_id);
create index if not exists restaurants_first_submitted_by_idx         on restaurants(first_submitted_by);
create index if not exists restaurants_owner_id_idx                   on restaurants(owner_id);
create index if not exists restaurants_possible_duplicate_of_idx      on restaurants(possible_duplicate_of);
create index if not exists restaurants_updated_by_idx                 on restaurants(updated_by);
create index if not exists review_photos_moderated_by_idx             on review_photos(moderated_by);
create index if not exists review_photos_review_id_idx                on review_photos(review_id);
create index if not exists reviews_moderated_by_idx                   on reviews(moderated_by);
create index if not exists reviews_restaurant_id_idx                  on reviews(restaurant_id);
create index if not exists reviews_user_id_idx                        on reviews(user_id);
create index if not exists role_change_log_actor_id_idx               on role_change_log(actor_id);
create index if not exists role_change_log_target_id_idx              on role_change_log(target_id);
create index if not exists signature_dishes_restaurant_id_idx         on signature_dishes(restaurant_id);
create index if not exists submissions_materialized_restaurant_id_idx on submissions(materialized_restaurant_id);
create index if not exists submissions_possible_duplicate_of_idx      on submissions(possible_duplicate_of);
create index if not exists submissions_submitted_by_idx               on submissions(submitted_by);
create index if not exists submissions_target_restaurant_id_idx       on submissions(target_restaurant_id);
create index if not exists venue_views_user_id_idx                    on venue_views(user_id);
