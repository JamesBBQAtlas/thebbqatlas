import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequestUser } from "@/lib/auth/request-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { userOwnsVenue, getListingStatus } from "@/lib/account/listing";
import { logAdminAction } from "@/lib/admin/audit-log";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Owner hero-photo control (Pro tier). A Pro owner may choose their venue hero from
 * photos THEY uploaded that are ALREADY APPROVED. It never writes live — it becomes a
 * pending `suggestions` row (kind='hero_set') an admin signs off, exactly like the other
 * owner edits. Gated SERVER-SIDE on ownership + Pro (getListingStatus().hasControl).
 *
 *  GET  ?restaurantId=…  → the owner's approved-image candidates for this venue.
 *  POST { restaurantId, mediaId } → stage the chosen photo as a pending hero.
 */

async function gate(request: Request, restaurantId: string) {
  // B8 — accept a Bearer token (native) OR cookie (web); web flow is unchanged.
  const auth = await getRequestUser(request);
  if (!auth) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const user = auth.user;
  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : auth.db;
  if (!(await userOwnsVenue(db, user.id, restaurantId))) {
    return { error: NextResponse.json({ error: "You don't own this venue." }, { status: 403 }) };
  }
  const listing = await getListingStatus(db, user.id, restaurantId);
  if (!listing.hasControl) {
    return { error: NextResponse.json({ error: "Choosing your hero photo needs the Pro tier." }, { status: 403 }) };
  }
  return { user, db };
}

export async function GET(request: Request) {
  const restaurantId = new URL(request.url).searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "Missing venue" }, { status: 400 });
  const g = await gate(request, restaurantId);
  if (g.error) return g.error;

  // Candidates: the owner's OWN approved images for this venue (already moderated).
  const { data } = await g.db
    .from("media")
    .select("id, url, caption")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", g.user.id)
    .eq("kind", "image")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(48);
  return NextResponse.json({ candidates: data ?? [] });
}

export async function POST(request: Request) {
  if (!(await rateLimit(`ownerhero:${clientIp(request)}`, 30, 3600))) {
    return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const mediaId = typeof body.mediaId === "string" ? body.mediaId : "";
  if (!restaurantId || !mediaId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  const g = await gate(request, restaurantId);
  if (g.error) return g.error;

  // The chosen photo must be one of the owner's OWN approved images for this venue.
  const { data: media } = await g.db
    .from("media")
    .select("id, url, restaurant_id, user_id, status, kind")
    .eq("id", mediaId)
    .maybeSingle();
  if (
    !media ||
    media.restaurant_id !== restaurantId ||
    media.user_id !== g.user.id ||
    media.status !== "approved" ||
    media.kind !== "image"
  ) {
    return NextResponse.json({ error: "Pick one of your approved photos." }, { status: 400 });
  }

  const { data: cur } = await g.db.from("restaurants").select("name, hero_image_url").eq("id", restaurantId).single();

  // One pending hero request per owner+venue — supersede any prior one.
  await g.db
    .from("suggestions")
    .update({ status: "superseded" })
    .eq("restaurant_id", restaurantId)
    .eq("created_by", g.user.id)
    .eq("kind", "hero_set")
    .eq("status", "pending");

  const { data: row, error } = await g.db
    .from("suggestions")
    .insert({
      kind: "hero_set",
      restaurant_id: restaurantId,
      title: `Hero photo — ${cur?.name ?? "venue"}`,
      summary: "Owner chose a new hero photo (from their approved photos)",
      current: { hero_image_url: cur?.hero_image_url ?? null },
      proposed: { hero_image_url: media.url, hero_source: "owner_pick", media_id: media.id },
      status: "pending",
      created_by: g.user.id,
    })
    .select("id")
    .single();
  if (error) { console.error("[owner/hero] error:", error.message); return NextResponse.json({ error: "Could not update the hero." }, { status: 500 }); }

  await logAdminAction({
    db: g.db, actorId: g.user.id, actorEmail: g.user.email ?? null,
    action: "owner.hero_submit",
    entityType: "restaurant",
    entityId: restaurantId,
    summary: "owner proposed a hero photo",
    context: { route: "owner/venues/hero", suggestion_id: row?.id, media_id: media.id },
  });

  return NextResponse.json({ ok: true, pending: true });
}
