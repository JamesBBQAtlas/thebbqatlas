import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidateVenues } from "@/lib/cache/venues";
import { logAdminAction } from "@/lib/admin/audit-log";

export const dynamic = "force-dynamic";

/**
 * Ownership REVOKE (Prompt 2 acceptance #3). An admin revokes a previously-approved
 * claim: the claim goes to status='revoked', and the venue's owner_id link is cleared
 * if it pointed at that user. Edit rights vanish IMMEDIATELY — ownsVenue()/userOwnsVenue()
 * only count an approved claim or a matching owner_id, so a revoked owner can no longer
 * submit owner edits/pins/links or set a hero. The user's ACCOUNT is preserved (we never
 * touch profiles here); they simply no longer own this venue. Fully audited.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const claimId = String(body.claimId ?? "");
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : null;
  if (!claimId) return NextResponse.json({ error: "claimId is required." }, { status: 400 });

  const { data: claim } = await ctx.db
    .from("restaurant_claims")
    .select("id, restaurant_id, user_id, role_requested, status")
    .eq("id", claimId)
    .single();
  if (!claim) return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  if (claim.status !== "approved") {
    return NextResponse.json(
      { error: `Only an approved claim can be revoked (this one is ${claim.status}).` },
      { status: 409 }
    );
  }

  // 1) Mark the claim revoked (distinct from a never-approved 'rejected').
  const { error: cErr } = await ctx.db
    .from("restaurant_claims")
    .update({
      status: "revoked",
      decided_by: ctx.userId,
      decided_at: new Date().toISOString(),
      decision_note: notes,
    })
    .eq("id", claimId);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  // 2) Clear the venue's owner_id link, but ONLY if it points at this user (don't
  //    clobber a different owner that was set via another claim).
  const { data: venue } = await ctx.db
    .from("restaurants")
    .select("id, owner_id")
    .eq("id", claim.restaurant_id)
    .single();
  let ownerCleared = false;
  if (venue && venue.owner_id === claim.user_id) {
    const { error: vErr } = await ctx.db
      .from("restaurants")
      .update({ owner_id: null })
      .eq("id", claim.restaurant_id);
    if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
    ownerCleared = true;
  }

  await logAdminAction({
    db: ctx.db,
    actorId: ctx.userId,
    action: "ownership.revoke",
    entityType: "restaurant_claim",
    entityId: claim.id,
    summary: `ownership revoked (${claim.role_requested}) for venue ${claim.restaurant_id}`,
    diff: { status: { old: "approved", new: "revoked" }, owner_id: ownerCleared ? { old: claim.user_id, new: null } : undefined },
    context: { route: "admin/owners/revoke", user_id: claim.user_id, owner_cleared: ownerCleared, ...(notes ? { reason: notes } : {}) },
  });

  revalidateVenues();
  return NextResponse.json({ ok: true, ownerCleared });
}
