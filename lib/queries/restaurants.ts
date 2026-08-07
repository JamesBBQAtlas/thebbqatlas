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
    // Permanently-closed venues are excluded from every public listing surface —
    // map, directory, Featured, "nearby", and the public spot count all read
    // through here (Fix 7). The individual venue page uses getRestaurantBySlug
    // (below), which does NOT filter, so a closed venue still renders with its
    // "Permanently closed" banner rather than 404-ing.
    return (data as Restaurant[]).filter((r) => !r.permanently_closed);
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

export interface NearbyVenue {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  country_code: string | null;
  style: Restaurant["style"];
  lat: number;
  lng: number;
  distance_km: number;
}

/**
 * Nearest approved venues to a point, computed in Postgres (Fable H-1) — replaces
 * loading the whole restaurants table into Node and haversine-sorting it in JS on
 * every venue render. Returns only the fields the "nearby" cards + locator map
 * need. Empty on bad coords or error.
 */
export async function getNearbyVenues(
  lat: number | null | undefined,
  lng: number | null | undefined,
  excludeId: string,
  limit = 6
): Promise<NearbyVenue[]> {
  if (!Number.isFinite(lat as number) || !Number.isFinite(lng as number)) return [];
  if (lat === 0 && lng === 0) return [];
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase.rpc("nearby_venues", {
      p_lat: lat,
      p_lng: lng,
      p_exclude: excludeId,
      p_limit: limit,
    });
    if (error || !data) return [];
    return data as NearbyVenue[];
  } catch {
    return [];
  }
}

export async function getRestaurants(): Promise<Restaurant[]> {
  const data = await getSupabaseRestaurantsCached();
  return data ?? FALLBACK_RESTAURANTS;
}

/** Real, non-expired paid Featured listing (Phase 5.1). */
function isPaidFeatured(r: Restaurant): boolean {
  if (!r.is_premium) return false;
  return !r.premium_until || new Date(r.premium_until).getTime() > Date.now();
}

/** Featured venues for the homepage/directory: admin-featured OR a paid Featured
 *  listing. Paid listings sort first. */
export async function getFeaturedRestaurants(limit = 3): Promise<Restaurant[]> {
  const all = await getRestaurants();
  return all
    .filter((r) => r.is_featured || isPaidFeatured(r))
    .sort((a, b) => Number(isPaidFeatured(b)) - Number(isPaidFeatured(a)))
    .slice(0, limit);
}

// Permanently-closed venues, for the OPT-IN map "ghost pin" layer only. Kept out
// of getRestaurants() (and therefore every default listing + count); surfaced
// here solely so the map can show them behind the "Show closed venues" toggle.
async function getClosedRestaurantsUncached(): Promise<Restaurant[]> {
  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("status", "approved")
      .eq("permanently_closed", true);
    return ((data ?? []) as Restaurant[]).filter(
      (r) => Number.isFinite(r.lat) && Number.isFinite(r.lng)
    );
  } catch {
    return [];
  }
}

const getClosedRestaurantsCached = unstable_cache(
  getClosedRestaurantsUncached,
  ["closed-restaurants"],
  { tags: [VENUES_TAG], revalidate: 3600 }
);

export async function getClosedRestaurants(): Promise<Restaurant[]> {
  return getClosedRestaurantsCached();
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