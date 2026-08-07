import { createAnonClient } from "@/lib/supabase/anon";
import type { PublicRestaurant } from "@/lib/types/public";

/**
 * Phase 8a — the public read path.
 *
 * These read the `public_venues` view (approved rows, public columns only) with
 * the anon client, so they return exactly the `PublicRestaurant` contract and
 * are safe to expose to a native app or a versioned public API. Internal
 * server/admin code keeps using `getRestaurants` (full `Restaurant`); public
 * surfaces should prefer these.
 */
export async function getPublicVenues(): Promise<PublicRestaurant[]> {
  try {
    const db = createAnonClient();
    const { data, error } = await db
      .from("public_venues")
      .select("*")
      .order("is_featured", { ascending: false })
      .order("name", { ascending: true });
    if (error || !data) return [];
    return data as PublicRestaurant[];
  } catch {
    return [];
  }
}

export async function getPublicVenueBySlug(
  slug: string
): Promise<PublicRestaurant | null> {
  try {
    const db = createAnonClient();
    const { data, error } = await db
      .from("public_venues")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return null;
    return data as PublicRestaurant;
  } catch {
    return null;
  }
}
