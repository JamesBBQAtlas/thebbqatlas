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
  isFeatured: boolean; // paid Featured entitlement active
  tier: string | null;
  until: string | null;
}

/** The current user's ownership + Featured state for a venue. */
export async function getListingStatus(
  db: SupabaseClient,
  userId: string | null,
  restaurantId: string
): Promise<ListingStatus> {
  const { data: r } = await db
    .from("restaurants")
    .select("owner_id, is_premium, premium_tier, premium_until")
    .eq("id", restaurantId)
    .maybeSingle();
  if (!r) return { owns: false, isFeatured: false, tier: null, until: null };

  let owns = Boolean(userId && r.owner_id === userId);
  if (!owns && userId) owns = await ownsVenue(db, userId, restaurantId);

  const notExpired = !r.premium_until || new Date(r.premium_until).getTime() > Date.now();
  const isFeatured = Boolean(r.is_premium) && notExpired;

  return {
    owns,
    isFeatured,
    tier: (r.premium_tier as string) ?? null,
    until: (r.premium_until as string) ?? null,
  };
}
