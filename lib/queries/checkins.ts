import type { SupabaseClient } from "@supabase/supabase-js";
import { createAnonClient } from "@/lib/supabase/anon";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CheckIn, CheckInVisibility } from "@/lib/types/database";

/**
 * Reads for check-ins and the visit/save metrics that power the monetization
 * case. Counts are TRUTHFUL — they reflect every real row (public and private
 * alike) — so they use the service-role client where available to see past RLS.
 * If no service key is present we fall back to the caller's client, which will
 * only see public/own rows; that under-counts rather than inventing numbers.
 */
async function reader(base?: SupabaseClient): Promise<SupabaseClient> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return createAdminClient();
  // Cookie-less anon fallback keeps public metric reads ISR-safe (F-06). It only
  // sees public rows, so counts under-report rather than inventing numbers.
  return base ?? createAnonClient();
}

export interface VenueMetrics {
  visited: number;
  saved: number;
}

/** Total check-ins and total saves for a venue. Never throws. */
export async function getVenueMetrics(
  restaurantId: string
): Promise<VenueMetrics> {
  try {
    const db = await reader();
    const [checkins, saves] = await Promise.all([
      db
        .from("check_ins")
        .select("*", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId),
      db
        .from("saved_spots")
        .select("*", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId),
    ]);
    return { visited: checkins.count ?? 0, saved: saves.count ?? 0 };
  } catch {
    return { visited: 0, saved: 0 };
  }
}

/** The signed-in user's own check-in for a venue, if any. */
export async function getUserCheckIn(
  db: SupabaseClient,
  userId: string,
  restaurantId: string
): Promise<{ note: string | null; visibility: CheckInVisibility } | null> {
  try {
    const { data } = await db
      .from("check_ins")
      .select("note, visibility")
      .eq("user_id", userId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (!data) return null;
    return {
      note: data.note ?? null,
      visibility: (data.visibility ?? "public") as CheckInVisibility,
    };
  } catch {
    return null;
  }
}

/** All of a user's check-ins with venue info, newest first. */
export async function getUserCheckIns(
  db: SupabaseClient,
  userId: string
): Promise<CheckIn[]> {
  try {
    const { data } = await db
      .from("check_ins")
      .select("*, restaurants(name, slug, city, country)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    return (data ?? []) as CheckIn[];
  } catch {
    return [];
  }
}
