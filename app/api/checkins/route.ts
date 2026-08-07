import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";

/**
 * "I've been here" check-ins. A check-in is one row per (user, restaurant):
 * posting again updates the existing note/visibility rather than duplicating.
 * Writes go through the user's own (cookie OR Bearer) client so RLS enforces
 * auth.uid() = user_id — reachable from web and native alike (Phase 8d).
 *
 * Media on a check-in is handled separately and passes through the existing
 * moderation queue before it appears — this endpoint only records the visit,
 * an optional note, and the public/private toggle.
 */
export async function POST(request: Request) {
  const auth = await getRequestUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  if (!restaurantId) {
    return NextResponse.json({ error: "Missing venue" }, { status: 400 });
  }

  const rawNote = typeof body.note === "string" ? body.note.trim() : "";
  const note = rawNote ? rawNote.slice(0, 1000) : null;
  const visibility = body.visibility === "private" ? "private" : "public";

  const { error } = await auth.db.from("check_ins").upsert(
    {
      user_id: auth.userId,
      restaurant_id: restaurantId,
      note,
      visibility,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,restaurant_id" }
  );

  if (error) {
    return NextResponse.json({ error: "Could not save check-in" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Remove the signed-in user's check-in for a venue. */
export async function DELETE(request: Request) {
  const auth = await getRequestUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const restaurantId =
    new URL(request.url).searchParams.get("restaurantId") ?? "";
  if (!restaurantId) {
    return NextResponse.json({ error: "Missing venue" }, { status: 400 });
  }

  const { error } = await auth.db
    .from("check_ins")
    .delete()
    .eq("user_id", auth.userId)
    .eq("restaurant_id", restaurantId);

  if (error) {
    return NextResponse.json({ error: "Could not remove check-in" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
