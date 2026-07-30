import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import type { Restaurant, SignatureDish, Review } from "@/lib/types/database";
import { FALLBACK_RESTAURANTS } from "@/lib/data/fallback-restaurants";

/** Cache tag for every public read of approved venues — busted on any admin
 *  edit that changes live data (publish, approve, enrich commit, set-flagship,
 *  hero) so the directory/map/venue pages refresh within seconds, not on the
 *  1-hour ISR window. See lib/cache/venues.ts. */
export const VENUES_TAG = "venues";

async function getSupabaseRestaurants(): Promise<Restaurant[] | null> {
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("status", "approved")
      .order("avg_rating", { ascending: false });

    if (error) {
      console.error("[queries.restaurants] DB read failed — serving seed fallback:", error.message);
      return null;
    }
    if (!data?.length) return null;
    return data as Restaurant[];
  } catch (e) {
    console.error("[queries.restaurants] unexpected read error — serving seed fallback:", e);
    return null;
  }
}

// On-demand-revalidatable data cache: the DB read is tagged `venues`, so an
// admin publish/edit that calls revalidateTag("venues") refreshes it at once.
const getSupabaseRestaurantsCached = unstable_cache(getSupabaseRestaurants, ["approved-restaurants"], {
  tags: [VENUES_TAG],
  revalidate: 3600,
});

export async function getRestaurants(): Promise<Restaurant[]> {
  const data = await getSupabaseRestaurantsCached();
  return data ?? FALLBACK_RESTAURANTS;
}

export async function getFeaturedRestaurants(limit = 3): Promise<Restaurant[]> {
  const all = await getRestaurants();
  return all.filter((r) => r.is_featured).slice(0, limit);
}

// The DB half of the slug lookup, tagged `venues` so a publish/edit refreshes
// the venue page within seconds (not on the 1-hour ISR window).
const getRestaurantBySlugCached = unstable_cache(
  async (slug: string): Promise<Restaurant | null> => {
    try {
      const supabase = createAnonClient();
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .eq("slug", slug)
        .eq("status", "approved")
        .single();
      if (data) return data as Restaurant;
    } catch {
      // fall through
    }
    // Prefix match: "franklin-barbecue" → "franklin-barbecue-austin"
    try {
      const supabase = createAnonClient();
      const { data } = await supabase
        .from("restaurants")
        .select("*")
        .like("slug", `${slug}-%`)
        .eq("status", "approved")
        .limit(1)
        .single();
      if (data) return data as Restaurant;
    } catch {
      // fall through
    }
    return null;
  },
  ["restaurant-by-slug"],
  { tags: [VENUES_TAG], revalidate: 3600 }
);

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  const data = await getRestaurantBySlugCached(slug);
  if (data) return data;
  // Fallback data: exact then prefix
  return (
    FALLBACK_RESTAURANTS.find((r) => r.slug === slug) ??
    FALLBACK_RESTAURANTS.find((r) => r.slug.startsWith(`${slug}-`)) ??
    null
  );
}

/** If a requested slug is a retired one, the slug it now points to (for a 301). */
export async function getSlugRedirect(slug: string): Promise<string | null> {
  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("slug_redirects")
      .select("new_slug")
      .eq("old_slug", slug)
      .maybeSingle();
    return (data?.new_slug as string) ?? null;
  } catch {
    return null;
  }
}

export async function getSignatureDishes(restaurantId: string): Promise<SignatureDish[]> {
  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("signature_dishes")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("sort_order");
    if (data?.length) return data as SignatureDish[];
  } catch {
    // fallback
  }
  return [];
}

export async function getReviews(restaurantId: string): Promise<Review[]> {
  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("reviews")
      .select("*, profiles(username)")
      .eq("restaurant_id", restaurantId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (data) return data as Review[];
  } catch {
    // fallback
  }
  return [];
}