import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { logAdminAction } from "@/lib/admin/audit-log";

/**
 * Owner/seller claims a venue. Creates a pending claim (one per user+venue)
 * that an admin then approves in the moderation console, and flips the user's
 * account type so their My Atlas reflects their new role immediately.
 */
export async function POST(request: Request) {
  // Phase 8c — cap claim spam (10/IP/hour).
  if (!(await rateLimit(`claim:${clientIp(request)}`, 10, 3600))) {
    return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  }

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

  const { data: claimRow, error } = await db
    .from("restaurant_claims")
    .upsert(
      {
        restaurant_id: restaurantId,
        user_id: user.id,
        role_requested: roleRequested,
        note,
        contact_email: email,
        // A re-claim (e.g. after a prior rejection) resets the row to pending +
        // clears the previous decision so the admin sees a fresh request.
        status: "pending",
        decided_by: null,
        decided_at: null,
        decision_note: null,
      },
      { onConflict: "restaurant_id,user_id" }
    )
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Reflect the chosen role on the profile right away (pending verification).
  await db
    .from("profiles")
    .upsert({ id: user.id, account_type: roleRequested }, { onConflict: "id" });

  // Audit (Prompt 1) — the claimant's own submit. actorId = the user.
  await logAdminAction({
    db, actorId: user.id, actorEmail: user.email ?? null,
    action: "claim.submit",
    entityType: "restaurant_claim",
    entityId: claimRow?.id ?? null,
    summary: `claim submitted (${roleRequested}) for venue ${restaurantId}`,
    context: { route: "claims", restaurant_id: restaurantId, contact_email: email },
  });

  return NextResponse.json({ ok: true });
}
