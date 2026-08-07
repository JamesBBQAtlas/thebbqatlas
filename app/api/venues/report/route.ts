import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownsVenue } from "@/lib/account/listing";

export const dynamic = "force-dynamic";

/**
 * Phase 5.2 — the venue report data, owner-gated. Returns the last-30-days vs
 * prior-30-days metrics (views, click-throughs by destination, saves, check-ins,
 * search appearances) for the owner's venue. Non-owners get 403.
 */
export async function GET(request: Request) {
  const restaurantId = new URL(request.url).searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "Missing venue" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;
  if (!(await ownsVenue(admin, user.id, restaurantId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await admin.rpc("venue_report", { p_restaurant_id: restaurantId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, report: data });
}
