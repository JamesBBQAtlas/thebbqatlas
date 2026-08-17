/**
 * The column projection for public LISTING reads (Part 4 — directory/map/home perf).
 *
 * Kept in its own dependency-free module so it can be unit-tested without pulling
 * `next/cache` or the Supabase client, and so the denylist below is the single source
 * of truth for "what a public listing is allowed to fetch".
 *
 * The heavy admin/enrichment columns below are NEVER rendered on a public listing, yet
 * `select("*")` pulled them for all ~530 approved rows on every read — and re-read them
 * every time an admin write busted the `venues` cache. During the chain-roster storms
 * that oversized read is what tipped the anon path past its statement-timeout and served
 * the 75-row seed fallback (17 Aug incident). Measured across the approved set:
 *   dossier 484 kB · enrichment_debug 530 kB · enrichment_cost_breakdown 103 kB
 *   (+ enrichment_sources / pending_changes / pending_copy / hero_exif / hero_dup_check /
 *    instagram_posts) ≈ 65% of the row payload.
 */

/** Heavy admin/enrichment columns a public listing must never fetch. */
export const HEAVY_EXCLUDED_COLUMNS = [
  "dossier",
  "enrichment_debug",
  "enrichment_cost_breakdown",
  "enrichment_sources",
  "pending_changes",
  "pending_copy",
  "hero_exif",
  "hero_dup_check",
  "instagram_posts",
] as const;

/**
 * Every `restaurants` column EXCEPT the heavy ones above — a denylist, so it can never
 * accidentally omit a small field a listing consumer relies on. A NEW column is simply
 * not fetched here until added (fails safe: no heavy blob leaks back into the hot read).
 * The single venue page (getRestaurantBySlug) still selects everything it needs.
 */
export const LIST_COLUMN_ARRAY = [
  "id", "slug", "name", "description", "style", "lat", "lng", "address", "city",
  "country", "website", "price_level", "avg_rating", "review_count", "hero_image_url",
  "is_featured", "status", "created_at", "country_code", "alcohol", "offerings",
  "category", "permanently_closed", "phone", "hours", "event_starts_at",
  "event_ends_at", "owner_id", "is_premium", "premium_until", "instagram_url",
  "x_url", "facebook_url", "tiktok_url", "youtube_url", "brand_id", "location_label",
  "enriched_at", "instagram_handle", "hero_post_url", "needs_attention",
  "attention_reason", "hero_source", "hook", "enrichment_cost", "enrichment_model",
  "chain_parent_id", "premium_tier", "claimed_by", "claimed_at", "hero_uploaded_by",
  "hero_photo_credit", "hero_rights_granted", "hero_reward_granted", "chain_rostered_at",
  "possible_duplicate_of", "duplicate_reason", "flagship_unset", "chain_candidate",
  "manual_copy", "manual_copy_at", "contact_email", "outreach_next_followup_at",
  "outreach_status", "featured_video_id", "featured_video_title",
  "featured_video_channel", "featured_video_thumb", "details_confirmed_at",
  "details_confirmed_email", "first_submission_id", "first_submitted_by",
  "first_submitted_at", "updated_at", "updated_by", "updated_by_actor",
  "manual_category", "manual_category_at", "faq", "manual_faq", "manual_faq_at",
  "geo_precision", "geo_confidence", "geo_source", "geo_locked", "info_note",
] as const;

/** The PostgREST `select()` string for a public listing read. */
export const LIST_COLUMNS = LIST_COLUMN_ARRAY.join(", ");
