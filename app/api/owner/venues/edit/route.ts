import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { userOwnsVenue } from "@/lib/account/listing";
import { sanitizeOwnerPatch, OWNER_EDITABLE_FIELDS } from "@/lib/account/owner-edits";
import { logAdminAction } from "@/lib/admin/audit-log";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Owner accuracy edit (Build Prompt 2b). An APPROVED owner of a venue proposes
 * changes to the FREE-tier accuracy fields (hours/phone/website/socials/
 * description). The edit NEVER writes live — it becomes a pending `suggestions`
 * row (kind='owner_edit', created_by=the owner) that an admin approves through the
 * existing whitelisted apply. One pending owner edit per venue per owner (a new
 * submission supersedes the prior pending one). Every submission is audit-logged.
 */
export async function POST(request: Request) {
  if (!(await rateLimit(`owneredit:${clientIp(request)}`, 30, 3600))) {
    return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "Missing venue" }, { status: 400 });

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;

  // OWNERSHIP GATE — a user may only edit a venue they own (approved claim / owner_id).
  if (!(await userOwnsVenue(db, user.id, restaurantId))) {
    return NextResponse.json({ error: "You don't own this venue." }, { status: 403 });
  }

  const { patch, rejected } = sanitizeOwnerPatch((body.patch ?? {}) as Record<string, unknown>);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid changes to submit.", rejected }, { status: 400 });
  }

  // Current values, to store the before/after and drop no-op fields.
  const { data: current } = await db
    .from("restaurants")
    .select(["name", ...OWNER_EDITABLE_FIELDS].join(", "))
    .eq("id", restaurantId)
    .single();
  if (!current) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  const currentRow = current as unknown as Record<string, unknown>;
  const proposed: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const cur = currentRow[k] ?? null;
    if (JSON.stringify(cur ?? null) === JSON.stringify(v ?? null)) continue; // unchanged
    proposed[k] = v;
    before[k] = cur;
  }
  if (Object.keys(proposed).length === 0) {
    return NextResponse.json({ ok: true, message: "Nothing changed.", rejected });
  }

  // Supersede any prior PENDING owner edit from this owner for this venue, so the
  // queue shows one live request per owner (never a pile of stale proposals).
  await db
    .from("suggestions")
    .update({ status: "superseded" })
    .eq("restaurant_id", restaurantId)
    .eq("created_by", user.id)
    .eq("kind", "owner_edit")
    .eq("status", "pending");

  const { data: row, error } = await db
    .from("suggestions")
    .insert({
      kind: "owner_edit",
      restaurant_id: restaurantId,
      title: `Owner edit — ${(currentRow.name as string) ?? "venue"}`,
      summary: `Owner proposed changes to: ${Object.keys(proposed).join(", ")}`,
      current: before,
      proposed,
      status: "pending",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction({
    db, actorId: user.id, actorEmail: user.email ?? null,
    action: "owner.edit_submit",
    entityType: "restaurant",
    entityId: restaurantId,
    summary: `owner proposed edit — ${Object.keys(proposed).join(", ")}`,
    diff: Object.fromEntries(Object.entries(proposed).map(([k, v]) => [k, { old: before[k] ?? null, new: v }])),
    context: { route: "owner/venues/edit", suggestion_id: row?.id },
  });

  return NextResponse.json({ ok: true, pending: Object.keys(proposed), rejected });
}
