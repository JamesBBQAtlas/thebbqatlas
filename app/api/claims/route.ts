import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Owner/seller claims a venue. Creates a pending claim (one per user+venue)
 * that an admin then approves in the moderation console, and flips the user's
 * account type so their My Atlas reflects their new role immediately.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const restaurantId: string | undefined = body.restaurantId;
  const roleRequested = body.roleRequested === "seller" ? "seller" : "owner";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : null;
  const email =
    typeof body.email === "string" && body.email.trim()
      ? body.email.trim()
      : user.email ?? null;

  if (!restaurantId) {
    return NextResponse.json({ error: "Missing venue" }, { status: 400 });
  }

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const { data: venue } = await db
    .from("restaurants")
    .select("id")
    .eq("id", restaurantId)
    .single();
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }

  const { error } = await db.from("restaurant_claims").upsert(
    {
      restaurant_id: restaurantId,
      user_id: user.id,
      role_requested: roleRequested,
      note,
      contact_email: email,
      status: "pending",
    },
    { onConflict: "restaurant_id,user_id" }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Reflect the chosen role on the profile right away (pending verification).
  await db
    .from("profiles")
    .upsert({ id: user.id, account_type: roleRequested }, { onConflict: "id" });

  return NextResponse.json({ ok: true });
}
