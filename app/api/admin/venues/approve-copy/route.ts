import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidateVenues } from "@/lib/cache/venues";
import { auditFromPatch } from "@/lib/admin/content-audit";

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
    .select("id, pending_changes, name, description, hook, style, address, city, country, instagram_handle, website")
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
  // Approving applies the AI-proposed copy/fields live now — audit each changed
  // tracked field (the change originated from enrichment; the operator approved).
  if (action === "approve") {
    await auditFromPatch(ctx.db, restaurantId, row as Record<string, unknown>, proposed, {
      source: "ai_enrichment",
      changedBy: ctx.userId,
      note: "approved pending changes",
    });
    revalidateVenues();
  }
  return NextResponse.json({ ok: true, action });
}
