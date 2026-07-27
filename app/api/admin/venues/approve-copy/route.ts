import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * Promote (or discard) a live venue's pending_copy (VENUE-SYSTEM-SPEC §5b).
 * action="approve" copies pending_copy → hook/description and clears it;
 * action="discard" just clears it. The public page only changes on approve.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  const action = body.action === "discard" ? "discard" : "approve";
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  const { data: row, error } = await ctx.db
    .from("restaurants")
    .select("id, pending_changes")
    .eq("id", restaurantId)
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }
  if (!row.pending_changes) {
    return NextResponse.json({ error: "No pending changes to act on." }, { status: 400 });
  }

  // Approve commits the WHOLE proposed change set (copy + every structured
  // field) and clears the bag; discard just clears it.
  const proposed = row.pending_changes as Record<string, unknown>;
  const patch: Record<string, unknown> =
    action === "approve" ? { ...proposed, pending_changes: null } : { pending_changes: null };

  const { error: updErr } = await ctx.db
    .from("restaurants")
    .update(patch)
    .eq("id", restaurantId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, action });
}
