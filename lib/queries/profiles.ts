import { createAnonClient } from "@/lib/supabase/anon";
import type { CheckIn } from "@/lib/types/database";

/** Public-safe profile projection (the only columns anon may read — see F-02). */
export interface PublicProfile {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

/**
 * Look up a public profile by username (case-insensitive; usernames are stored
 * lowercased). Uses the cookie-LESS anon client on purpose: the `authenticated`
 * RLS policy on profiles is own-row-only, so a signed-in visitor reading another
 * user's profile through their session would see nothing. The anon role has the
 * `profiles_select_public_safe` policy + column-scoped grant, so it returns the
 * safe columns for ANY user — correct for a public page. Never throws.
 */
export async function getPublicProfileByUsername(
  username: string
): Promise<PublicProfile | null> {
  const uname = username.trim().toLowerCase();
  if (!uname) return null;
  try {
    const db = createAnonClient();
    const { data } = await db
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .eq("username", uname)
      .maybeSingle();
    return (data as PublicProfile) ?? null;
  } catch {
    return null;
  }
}

/**
 * A user's PUBLIC check-ins (newest first) with venue info. Anon reads these via
 * the `public checkins read` policy (visibility = 'public'). Private check-ins
 * are never returned. Never throws.
 */
export async function getPublicCheckInsForUser(
  userId: string,
  limit = 60
): Promise<CheckIn[]> {
  try {
    const db = createAnonClient();
    const { data } = await db
      .from("check_ins")
      .select(
        "id, user_id, restaurant_id, note, visibility, created_at, updated_at, restaurants(name, slug, city, country)"
      )
      .eq("user_id", userId)
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(limit);
    // PostgREST types the FK embed as an array; the relationship is to-one, so
    // the runtime value is a single object. Cast through unknown to match CheckIn.
    return (data ?? []) as unknown as CheckIn[];
  } catch {
    return [];
  }
}

/** A recent public visitor to a venue, credited by username. */
export interface Visitor {
  userId: string;
  username: string | null;
  displayName: string | null;
  note: string | null;
  created_at: string;
}

/**
 * Recent PUBLIC check-ins for a venue, joined to the visitor's public profile so
 * contributions can be credited by @username. Two-step (check-ins, then a single
 * profiles-by-id fetch) because check_ins.user_id references auth.users, not
 * profiles, so PostgREST can't embed the relationship directly. Never throws.
 */
export async function getRecentVisitors(
  restaurantId: string,
  limit = 12
): Promise<Visitor[]> {
  try {
    const db = createAnonClient();
    const { data: checkins } = await db
      .from("check_ins")
      .select("user_id, note, created_at")
      .eq("restaurant_id", restaurantId)
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!checkins || checkins.length === 0) return [];

    const userIds = [...new Set(checkins.map((c) => c.user_id as string))];
    const { data: profiles } = await db
      .from("profiles")
      .select("id, display_name, username")
      .in("id", userIds);
    const byId = new Map(
      (profiles ?? []).map((p) => [p.id as string, p])
    );

    return checkins.map((c) => {
      const p = byId.get(c.user_id as string) as
        | { display_name: string | null; username: string | null }
        | undefined;
      return {
        userId: c.user_id as string,
        username: p?.username ?? null,
        displayName: p?.display_name ?? null,
        note: (c.note as string | null) ?? null,
        created_at: c.created_at as string,
      };
    });
  } catch {
    return [];
  }
}
