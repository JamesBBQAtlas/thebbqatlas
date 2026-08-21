import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidateVenues } from "@/lib/cache/venues";

export const dynamic = "force-dynamic";

/**
 * Operator dismisses a false-positive chain candidate: clear the chain flags and
 * treat the venue as a normal single venue — no scan required. Only clears flags
 * on a candidate that has NOT been rostered into a real chain (no siblings).
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  // Safety: never dismiss a venue that already has chain siblings pointing at it.
  const { count } = await ctx.db
    .from("restaurants")
    .select("id", { count: "exact", head: true })
    .eq("chain_parent_id", restaurantId);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "This venue has chain locations — can't dismiss it as a single venue." },
      { status: 409 }
    );
  }

  const { error } = await ctx.db
    .from("restaurants")
    .update({ chain_candidate: false, flagship_unset: false, chain_rostered_at: null })
    .eq("id", restaurantId);
  if (error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });

  revalidateVenues();
  return NextResponse.json({ ok: true, message: "Cleared — treated as a single venue." });
}
