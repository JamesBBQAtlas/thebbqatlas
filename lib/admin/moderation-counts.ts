import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The Moderation Queue's pending counts (Part 8). ONE source of truth for the queue's
 * tab counts and the admin-nav pill badge, so the badge can never disagree with the
 * queue again. The badge was reading `review_photos` (0) for photos while the 22 pending
 * venue photos live in `media` (kind='image', surfaced by patch 0064) — so it summed to
 * 0 and hid itself. This counts what the queue actually shows.
 */
async function headCount(
  db: SupabaseClient,
  table: string,
  filters: { col: string; val: string }[]
): Promise<number> {
  try {
    let q = db.from(table).select("*", { count: "exact", head: true });
    for (const f of filters) q = q.eq(f.col, f.val);
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export interface ModerationCounts {
  /** All pending submissions — the Submissions AND Corrections tabs. */
  submissions: number;
  claims: number;
  reviews: number;
  /** review_photos + media(kind='image') pending — the Photos tab (post-0064). */
  photos: number;
  /** Sum of every tab — the nav-pill badge value. */
  total: number;
}

/** Compute the queue's per-tab pending counts + total, matching the Moderation page. */
export async function moderationQueueCounts(db: SupabaseClient): Promise<ModerationCounts> {
  const [submissions, claims, reviews, reviewPhotos, mediaImages] = await Promise.all([
    headCount(db, "submissions", [{ col: "moderation_status", val: "pending" }]),
    headCount(db, "restaurant_claims", [{ col: "status", val: "pending" }]),
    headCount(db, "reviews", [{ col: "status", val: "pending" }]),
    headCount(db, "review_photos", [{ col: "status", val: "pending" }]),
    headCount(db, "media", [{ col: "status", val: "pending" }, { col: "kind", val: "image" }]),
  ]);
  const photos = reviewPhotos + mediaImages;
  return { submissions, claims, reviews, photos, total: submissions + claims + reviews + photos };
}
