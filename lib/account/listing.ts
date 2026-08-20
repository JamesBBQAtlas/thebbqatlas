import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Phase 5.1 — venue listing entitlement helpers.
 *
 * Ownership is `restaurants.owner_id` (set when an admin approves a claim), with
 * an approved restaurant_claims row as a fallback. The paid "Featured" state is
 * `restaurants.is_premium` (+ premium_tier / premium_until), set by the Stripe
 * webhook — kept ON the restaurant so featured placement and the verified badge
 * are a simple column read.
 */

/** Does this user own the venue (approved claim / owner link)? */
export async function ownsVenue(
  db: SupabaseClient,
  userId: string,
  restaurantId: string
): Promise<boolean> {
  const { data: r } = await db
    .from("restaurants")
    .select("owner_id")
    .eq("id", restaurantId)
    .maybeSingle();
  if (r?.owner_id && r.owner_id === userId) return true;
  const { data: claim } = await db
    .from("restaurant_claims")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userId)
    .eq("status", "approved")
    .maybeSingle();
  return Boolean(claim);
}

/** Build Prompt 2 name for the ownership check — the single source of truth every
 *  owner-scoped guard (owner dashboard, owner edits, product links, pin) uses. */
export const userOwnsVenue = ownsVenue;

export interface ListingStatus {
  owns: boolean;
  /**
   * Time-boxed FEATURED prominence active (placement + badge). Bought à-la-carte per
   * week on top of any tier — NOT what gates links/hero. Lives on is_premium/premium_until.
   */
  isFeatured: boolean;
  /**
   * PAGE CONTROL active — the $49 Pro tier. THIS is what unlocks hero control + all owner
   * links. Lives on listing_tier='pro' + listing_until.
   */
  hasControl: boolean;
  /** The page-control tier: null | 'pro' | 'lower'. */
  tier: string | null;
  /** Featured window end (prominence). */
  until: string | null;
  /** Page-control (Pro) subscription current-period end. */
  controlUntil: string | null;
}

/** The current user's ownership + entitlement state for a venue. */
export async function getListingStatus(
  db: SupabaseClient,
  userId: string | null,
  restaurantId: string
): Promise<ListingStatus> {
  const { data: r } = await db
    .from("restaurants")
    .select("owner_id, is_premium, premium_until, listing_tier, listing_until")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!r) return { owns: false, isFeatured: false, hasControl: false, tier: null, until: null, controlUntil: null };

  let owns = Boolean(userId && r.owner_id === userId);
  if (!owns && userId) owns = await ownsVenue(db, userId, restaurantId);

  // Featured prominence — the time-boxed weekly window (placement + badge).
  const featuredLive = !r.premium_until || new Date(r.premium_until).getTime() > Date.now();
  const isFeatured = Boolean(r.is_premium) && featuredLive;

  // Page control — the $49 Pro tier (hero + all links). Independent of Featured.
  const tier = (r.listing_tier as string | null) ?? null;
  const controlLive = !r.listing_until || new Date(r.listing_until).getTime() > Date.now();
  const hasControl = tier === "pro" && controlLive;

  return {
    owns,
    isFeatured,
    hasControl,
    tier,
    until: (r.premium_until as string) ?? null,
    controlUntil: (r.listing_until as string) ?? null,
  };
}

/**
 * Pure helper mirroring hasControl for a restaurant row already in hand (owner
 * dashboard, venue page) — the $49 Pro tier is active. Keeps the "what unlocks hero +
 * links" rule in ONE place instead of re-deriving it per call-site.
 */
export function hasPageControl(row: {
  listing_tier?: string | null;
  listing_until?: string | null;
}): boolean {
  const live = !row.listing_until || new Date(row.listing_until).getTime() > Date.now();
  return row.listing_tier === "pro" && live;
}
