import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The signed-in user's state for one venue — their check-in (note + visibility)
 * and whether they've saved it. Fetched client-side after hydration (Fable H-1)
 * so the venue page itself can be static: no cookies are read during its render.
 * Anonymous → { authed:false, checkIn:null, saved:false }.
 */
export async function GET(request: Request) {
  const restaurantId = new URL(request.url).searchParams.get("restaurantId") ?? "";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !UUID_RE.test(restaurantId)) {
    return NextResponse.json({ authed: Boolean(user), checkIn: null, saved: false });
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
  });
}
