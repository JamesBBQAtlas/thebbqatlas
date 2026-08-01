import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidateVenues } from "@/lib/cache/venues";

export const dynamic = "force-dynamic";

/**
 * One-tap venue flags (Fix 6 Featured · Fix 7 Permanently closed). Flip either
 * boolean from an admin row and revalidate so the homepage / directory / map /
 * public count update on the next load. Marking a venue permanently closed also
 * forces it OUT of Featured (a closed venue is never "worth the journey").
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId required." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(body, "is_featured")) {
    patch.is_featured = Boolean(body.is_featured);
  }
  if (Object.prototype.hasOwnProperty.call(body, "permanently_closed")) {
    patch.permanently_closed = Boolean(body.permanently_closed);
    if (patch.permanently_closed) patch.is_featured = false; // closed ⇒ never featured
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No flag to change." }, { status: 400 });
  }

  const { error } = await ctx.db.from("restaurants").update(patch).eq("id", restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateVenues();
  return NextResponse.json({ ok: true, ...patch });
}
