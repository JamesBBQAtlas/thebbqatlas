import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import type { Restaurant, SignatureDish, Review } from "@/lib/types/database";
import { FALLBACK_RESTAURANTS } from "@/lib/data/fallback-restaurants";
import { LIST_COLUMNS } from "@/lib/queries/list-columns";
import { isLiveVenue } from "@/lib/venues/live-count";
import { readWithRetry, makeLkg } from "@/lib/queries/read-retry";
import { reportFallbackServed } from "@/lib/ops/fallback-alert";

export { LIST_COLUMNS } from "@/lib/queries/list-columns";

/** Cache tag for every public read of approved venues — busted on any admin
 *  edit that changes live data (publish, approve, enrich commit, set-flagship,
 *  hero) so the directory/map/venue pages refresh within seconds, not on the
 *  1-hour ISR window. See lib/cache/venues.ts. */
export const VENUES_TAG = "venues";

// Last-known-good real venue list (per warm instance) — served on a genuine
// failure instead of the generic 75-row seed (BUILD PROMPT 75, Fix 1a.2).
const approvedLkg = makeLkg<Restaurant[]>();

/**
 * ONE attempt at the approved-venues read. THROWS on DB error OR on zero live rows
 * — never returns null/empty (BUILD PROMPT 75, Fix 1). Because it throws, the
 * unstable_cache wrapper below never PERSISTS a failure: Next does not cache a
 * rejected promise, so the very next request retries the DB and self-heals. The
 * old code returned null here, and unstable_cache happily cached that null for an
 * hour → the "75-venue" freeze. Throwing is the fix.
 */
async function readApprovedOnce(): Promise<Restaurant[]> {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select(LIST_COLUMNS)
    .eq("status", "approved")
    .order("avg_rating", { ascending: false });

  if (error) {
    throw new Error(`[queries.restaurants] approved read failed: ${error.message}`);
  }
  // Permanently-closed venues are excluded from every public listing surface —
  // map, directory, Featured, "nearby", and the public spot count all read
  // through here. The ONE live-venue predicate (Part 9) keeps the public count
  // in lockstep with the admin breakdown.
  const live = ((data ?? []) as unknown as Restaurant[]).filter(isLiveVenue);
  if (!live.length) {
    // A populated DB never returns 0 live rows; treat it as an anomaly and REFUSE
    // to cache it, rather than freezing an empty/seed result for an hour.
    throw new Error("[queries.restaurants] approved read returned 0 live rows — refusing to cache empty");
  }
  return live;
}

/** Retry the read a couple of times before ever giving up — a cold-start / pooler
 *  blip is over in milliseconds, so this catches ~all of them BEFORE any fallback
 *  is reachable (Fix 1a.1). On success, refresh the last-known-good snapshot. */
async function fetchApprovedRestaurants(): Promise<Restaurant[]> {
  const live = await readWithRetry(readApprovedOnce);
  approvedLkg.set(live);
  return live;
}

// On-demand-revalidatable data cache: the DB read is tagged `venues`, so an
// admin publish/edit that calls revalidateTag("venues") refreshes it at once.
// fetchApprovedRestaurants THROWS on failure, so a bad read is never cached.
const getSupabaseRestaurantsCached = unstable_cache(fetchApprovedRestaurants, ["approved-restaurants"], {
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
  try {
    return await getSupabaseRestaurantsCached();
  } catch (e) {
    // Reached ONLY during a real outage (all retries failed at a cache-refresh
    // moment). Served uncached for this single request — the throw above means the
    // cache stays clean and the next successful request returns real data. Prefer
    // last-known-good REAL venues over the generic seed, and always fail LOUD.
    const lkg = approvedLkg.get();
    reportFallbackServed("approved-restaurants", e, {
      servedLastKnownGood: Boolean(lkg),
      // Only the SEED case (no last-known-good yet) is an emergency worth an email —
      // serving real last-known-good is the safety net working and is audit-logged only.
      servedSeed: !lkg,
      count: lkg?.length ?? FALLBACK_RESTAURANTS.length,
    });
    return lkg ?? FALLBACK_RESTAURANTS;
  }
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
// THROWS on DB error (BUILD PROMPT 75, Fix 1c) so a transient failure is never
// cached as an empty ghost-pin layer for an hour. An empty result with no error is
// legitimate (there may simply be no closed venues) and is cached normally.
async function getClosedRestaurantsUncached(): Promise<Restaurant[]> {
  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("restaurants")
    .select(LIST_COLUMNS)
    .eq("status", "approved")
    .eq("permanently_closed", true);
  if (error) throw new Error(`[queries.restaurants] closed read failed: ${error.message}`);
  return ((data ?? []) as unknown as Restaurant[]).filter(
    (r) => Number.isFinite(r.lat) && Number.isFinite(r.lng)
  );
}

const getClosedRestaurantsCached = unstable_cache(
  getClosedRestaurantsUncached,
  ["closed-restaurants"],
  { tags: [VENUES_TAG], revalidate: 3600 }
);

export async function getClosedRestaurants(): Promise<Restaurant[]> {
  try {
    return await getClosedRestaurantsCached();
  } catch (e) {
    // Uncached fallback — the ghost-pin layer is non-critical, so an empty list is
    // fine here; it self-heals next request (never a cached failure).
    reportFallbackServed("closed-restaurants", e, { servedLastKnownGood: false });
    return [];
  }
}

// The DB half of the slug lookup, tagged `venues` so a publish/edit refreshes
// the venue page within seconds (not on the 1-hour ISR window).
// THROWS on a real DB error (BUILD PROMPT 75, Fix 1c) so a transient blip can't
// cache a null and 404 a real venue page for an hour. A genuine not-found (no row,
// no error) returns null and is cached normally. Uses maybeSingle() so "no rows"
// is a clean null rather than an error we'd otherwise have to distinguish.
const getRestaurantBySlugCached = unstable_cache(
  async (slug: string): Promise<Restaurant | null> => {
    const supabase = createAnonClient();
    const exact = await supabase
      .from("restaurants")
      .select("*")
      .eq("slug", slug)
      .eq("status", "approved")
      .maybeSingle();
    if (exact.error) throw new Error(`[queries.restaurants] slug read failed: ${exact.error.message}`);
    if (exact.data) return exact.data as Restaurant;

    // Prefix match: "franklin-barbecue" → "franklin-barbecue-austin"
    const prefix = await supabase
      .from("restaurants")
      .select("*")
      .like("slug", `${slug}-%`)
      .eq("status", "approved")
      .limit(1)
      .maybeSingle();
    if (prefix.error) throw new Error(`[queries.restaurants] slug prefix read failed: ${prefix.error.message}`);
    if (prefix.data) return prefix.data as Restaurant;

    return null;
  },
  ["restaurant-by-slug"],
  { tags: [VENUES_TAG], revalidate: 3600 }
);

export async function getRestaurantBySlug(slug: string): Promise<Restaurant | null> {
  let data: Restaurant | null = null;
  try {
    data = await getRestaurantBySlugCached(slug);
  } catch (e) {
    // Outage path — uncached, self-heals next request. Fall through to seed lookup.
    reportFallbackServed("restaurant-by-slug", e, { servedLastKnownGood: false, slug });
  }
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