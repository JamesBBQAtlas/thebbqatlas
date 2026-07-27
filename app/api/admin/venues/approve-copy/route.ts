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
    .select("id, pending_copy")
    .eq("id", restaurantId)
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }
  if (!row.pending_copy) {
    return NextResponse.json({ error: "No pending copy to act on." }, { status: 400 });
  }

  const pc = row.pending_copy as { hook?: string | null; description?: string | null };
  const patch: Record<string, unknown> =
    action === "approve"
      ? { hook: pc.hook ?? null, description: pc.description ?? "", pending_copy: null }
      : { pending_copy: null };

  const { error: updErr } = await ctx.db
    .from("restaurants")
    .update(patch)
    .eq("id", restaurantId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, action });
}
