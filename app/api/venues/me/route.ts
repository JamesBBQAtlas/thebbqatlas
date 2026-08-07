import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getVenueMetrics } from "@/lib/queries/checkins";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Per-request state for one venue, fetched client-side after hydration (Fable
 * H-1) so the venue page itself can be static (no cookies read during render):
 *  - the LIVE visit/save counts (metrics) — public, always current, so the
 *    "N have been here / saved" line no longer freezes in the ISR cache.
 *  - the signed-in user's own check-in (note + visibility) and saved state.
 * Anonymous → authed:false, checkIn:null, saved:false, but metrics still return.
 */
export async function GET(request: Request) {
  const restaurantId = new URL(request.url).searchParams.get("restaurantId") ?? "";
  const valid = UUID_RE.test(restaurantId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const metrics = valid ? await getVenueMetrics(restaurantId) : { visited: 0, saved: 0 };

  if (!user || !valid) {
    return NextResponse.json({ authed: Boolean(user), checkIn: null, saved: false, metrics });
  }

  const [ci, ss] = await Promise.all([
    supabase
      .from("check_ins")
      .select("note, visibility")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
    supabase
      .from("saved_spots")
      .select("restaurant_id")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    authed: true,
    checkIn: ci.data ?? null,
    saved: Boolean(ss.data),
    metrics,
  });
}
