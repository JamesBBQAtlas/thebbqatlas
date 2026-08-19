import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { userOwnsVenue } from "@/lib/account/listing";
import { logAdminAction } from "@/lib/admin/audit-log";
import { haversineKm } from "@/lib/utils/geo";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { PIN_FAR_KM, validCoord } from "@/lib/account/owner-pin";

// A Next.js `route.ts` may ONLY export HTTP handlers + segment config. PIN_FAR_KM
// and validCoord now live in "@/lib/account/owner-pin" so the route can use them
// without exporting them (which broke the production build).
export const dynamic = "force-dynamic";

/**
 * Owner map-pin correction (Build Prompt 2 addendum). An approved owner proposes the
 * venue's exact location by dragging a marker. It NEVER writes live — it becomes a
 * pending `suggestions` row (kind='geo_correction') an admin approves; on approval the
 * pin is written + LOCKED (geo_locked) so enrichment never moves it again. A pin far
 * from the current one (>50 km, or a different hemisphere) is flagged for the admin —
 * never auto-applied. FREE for any claimed owner (an accuracy edit, not premium).
 */
export async function POST(request: Request) {
  if (!(await rateLimit(`ownerpin:${clientIp(request)}`, 20, 3600))) {
    return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const coord = validCoord(body.lat, body.lng);
  if (!restaurantId) return NextResponse.json({ error: "Missing venue" }, { status: 400 });
  if (!coord) return NextResponse.json({ error: "Pick a valid point on the map." }, { status: 400 });

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;
  if (!(await userOwnsVenue(db, user.id, restaurantId))) {
    return NextResponse.json({ error: "You don't own this venue." }, { status: 403 });
  }

  const { data: cur } = await db
    .from("restaurants")
    .select("name, lat, lng")
    .eq("id", restaurantId)
    .single();
  if (!cur) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  const hasCurrent = typeof cur.lat === "number" && typeof cur.lng === "number" && !(cur.lat === 0 && cur.lng === 0);
  const distanceKm = hasCurrent ? Math.round(haversineKm(cur.lat, cur.lng, coord.lat, coord.lng) * 10) / 10 : null;
  const far = distanceKm !== null && distanceKm > PIN_FAR_KM;

  // One pending pin correction per venue+owner — supersede any prior one.
  await db
    .from("suggestions")
    .update({ status: "superseded" })
    .eq("restaurant_id", restaurantId)
    .eq("created_by", user.id)
    .eq("kind", "geo_correction")
    .eq("status", "pending");

  const { data: row, error } = await db
    .from("suggestions")
    .insert({
      kind: "geo_correction",
      restaurant_id: restaurantId,
      title: `Pin correction — ${cur.name ?? "venue"}`,
      summary: distanceKm !== null ? `Owner moved the pin ${distanceKm} km${far ? " — FAR, verify" : ""}` : "Owner set the pin",
      current: { lat: cur.lat ?? null, lng: cur.lng ?? null },
      proposed: { lat: coord.lat, lng: coord.lng, distance_km: distanceKm, far },
      status: "pending",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAdminAction({
    db, actorId: user.id, actorEmail: user.email ?? null,
    action: "owner.pin_submit",
    entityType: "restaurant",
    entityId: restaurantId,
    summary: `owner proposed a pin${distanceKm !== null ? ` (${distanceKm} km move${far ? ", FAR" : ""})` : ""}`,
    diff: { lat: { old: cur.lat ?? null, new: coord.lat }, lng: { old: cur.lng ?? null, new: coord.lng } },
    context: { route: "owner/venues/pin", suggestion_id: row?.id, distance_km: distanceKm, far },
  });

  return NextResponse.json({ ok: true, distanceKm, far });
}
