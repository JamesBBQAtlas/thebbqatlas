import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * Quick-photo mode (Phase C). Paste one public Instagram post/reel permalink to
 * set (or clear) a venue's embedded hero — no full re-enrichment. This is how we
 * photo-up the existing live venues fast. Empty postUrl clears the hero.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  const postUrl = typeof body.postUrl === "string" ? body.postUrl.trim() : "";
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  if (postUrl && !/instagram\.com\/(p|reel)\/[\w-]+/i.test(postUrl)) {
    return NextResponse.json(
      { error: "Not an Instagram post URL (expected instagram.com/p/… or /reel/…)." },
      { status: 400 }
    );
  }

  const { error } = await ctx.db
    .from("restaurants")
    .update({ hero_post_url: postUrl || null })
    .eq("id", restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, hero_post_url: postUrl || null });
}
