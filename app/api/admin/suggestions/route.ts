import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { logAdminAction } from "@/lib/admin/audit-log";

// Fields a suggestion is allowed to write when approved.
const ALLOWED = new Set([
  "description",
  "website",
  "phone",
  "hours",
  "price_level",
  "offerings",
  "style",
  "instagram_url",
  "x_url",
  "facebook_url",
  "tiktok_url",
  "youtube_url",
  // PREMIUM owner link fields (Pro tier) — the submit route only lets a Pro owner
  // propose these, so by the time one reaches here it's entitled.
  "shop_url",
  "tickets_url",
  "gift_card_url",
  "order_url",
  "permanently_closed",
]);

/**
 * PATCH — approve or reject a suggestion. Approve applies the proposed change
 * to the venue (whitelisted fields only) and marks it applied. This is the only
 * path by which self-healing touches live content, and it requires an admin.
 */
export async function PATCH(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = String(body.suggestionId ?? "");
  const action = body.action === "approve" ? "approve" : body.action === "reject" ? "reject" : null;
  if (!id || !action) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { data: s } = await ctx.db.from("suggestions").select("*").eq("id", id).single();
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (s.status !== "pending") {
    return NextResponse.json({ error: "Already handled" }, { status: 409 });
  }

  // Is this an owner-submitted accuracy edit (Prompt 2b)? created_by is a real user
  // id rather than the 'self-heal' sentinel.
  const isOwnerEdit = s.kind === "owner_edit";
  const isGeo = s.kind === "geo_correction";

  if (action === "reject") {
    await ctx.db.from("suggestions").update({ status: "rejected" }).eq("id", id);
    await logAdminAction({
      db: ctx.db, actorId: ctx.userId,
      action: isGeo ? "owner.pin_reject" : isOwnerEdit ? "owner.edit_reject" : "suggestion.reject",
      entityType: "restaurant", entityId: s.restaurant_id ?? null,
      summary: `${isGeo ? "pin correction" : isOwnerEdit ? "owner edit" : "suggestion"} rejected`,
      context: { route: "admin/suggestions", suggestion_id: id, kind: s.kind, proposed_by: s.created_by },
    });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // Approve a PIN CORRECTION (Build Prompt 2 addendum) — write the owner's exact pin
  // and LOCK it (geo_source='owner', geo_precision='exact', geo_locked=true) so the
  // enrichment/geocoder never moves it again, and clear any "approximate pin" flag.
  if (isGeo) {
    const p = (s.proposed ?? {}) as { lat?: number; lng?: number };
    if (!s.restaurant_id || typeof p.lat !== "number" || typeof p.lng !== "number") {
      return NextResponse.json({ error: "Malformed pin correction." }, { status: 400 });
    }
    const { data: before } = await ctx.db
      .from("restaurants")
      .select("lat, lng, needs_attention, attention_reason")
      .eq("id", s.restaurant_id)
      .single();
    const pinPatch: Record<string, unknown> = {
      lat: p.lat, lng: p.lng,
      geo_source: "owner", geo_precision: "exact", geo_confidence: 1, geo_locked: true,
    };
    // Clear a pin-approximate / geocode-verify attention flag (only that class).
    const pinFlag = /pin|geocode|postcode|approximate|verify the exact/i;
    if (before?.needs_attention && pinFlag.test(String(before.attention_reason ?? ""))) {
      pinPatch.needs_attention = false;
      pinPatch.attention_reason = null;
    }
    const { error: pinErr } = await ctx.db.from("restaurants").update(pinPatch).eq("id", s.restaurant_id);
    if (pinErr) return NextResponse.json({ error: pinErr.message }, { status: 500 });
    await ctx.db.from("suggestions").update({ status: "applied", applied_at: new Date().toISOString() }).eq("id", id);
    await logAdminAction({
      db: ctx.db, actorId: ctx.userId,
      action: "venue.geo_correct",
      entityType: "restaurant", entityId: s.restaurant_id,
      summary: `owner pin approved + locked${typeof (s.proposed as { distance_km?: number })?.distance_km === "number" ? ` (${(s.proposed as { distance_km?: number }).distance_km} km move)` : ""}`,
      diff: { lat: { old: before?.lat ?? null, new: p.lat }, lng: { old: before?.lng ?? null, new: p.lng } },
      context: { route: "admin/suggestions", suggestion_id: id, proposed_by: s.created_by, geo_locked: true },
    });
    return NextResponse.json({ ok: true, status: "applied", applied: ["lat", "lng", "geo_locked"] });
  }

  // Approve: apply the proposed (whitelisted) fields.
  const proposed = (s.proposed ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(proposed)) {
    if (ALLOWED.has(k) && v !== undefined) update[k] = v;
  }
  // Prompt 2b — an APPROVED copy edit becomes protected hand-written copy, so the
  // enrichment engine never overwrites what a human just signed off (the same
  // manual_copy guard the admin copy editor uses).
  if ("description" in update) {
    update.manual_copy = true;
    update.manual_copy_at = new Date().toISOString();
  }
  if (s.restaurant_id && Object.keys(update).length > 0) {
    update.enriched_at = new Date().toISOString();
    const { error } = await ctx.db
      .from("restaurants")
      .update(update)
      .eq("id", s.restaurant_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await ctx.db
    .from("suggestions")
    .update({ status: "applied", applied_at: new Date().toISOString() })
    .eq("id", id);

  const applied = Object.keys(update).filter((k) => k !== "enriched_at" && k !== "manual_copy" && k !== "manual_copy_at");
  await logAdminAction({
    db: ctx.db, actorId: ctx.userId,
    action: isOwnerEdit ? "owner.edit_approve" : "suggestion.approve",
    entityType: "restaurant", entityId: s.restaurant_id ?? null,
    summary: `${isOwnerEdit ? "owner edit" : "suggestion"} approved — ${applied.join(", ")}`,
    diff: Object.fromEntries(applied.map((k) => [k, { old: (s.current as Record<string, unknown> | null)?.[k] ?? null, new: update[k] }])),
    context: { route: "admin/suggestions", suggestion_id: id, kind: s.kind, proposed_by: s.created_by },
  });

  return NextResponse.json({ ok: true, status: "applied", applied });
}
