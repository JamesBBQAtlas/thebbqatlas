import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidateVenues } from "@/lib/cache/venues";

export const dynamic = "force-dynamic";

/**
 * Delete a venue row (Fix 5) — for the bogus rows a roster scan occasionally
 * produces. Destructive, so the UI confirms first. If the row had a live slug we
 * leave a 301 redirect to a sensible target (its chain flagship if it's a chain
 * member, else none) so any indexed URL doesn't 404. A chain PARENT that still
 * has branches is refused — detach or delete the branches first — so we never
 * orphan siblings.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId required." }, { status: 400 });

  const { data: row, error: loadErr } = await ctx.db
    .from("restaurants")
    .select("id, slug, chain_parent_id")
    .eq("id", restaurantId)
    .single();
  if (loadErr || !row) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  // Refuse to delete a flagship/parent that still has branches pointing at it.
  const { count: siblingCount } = await ctx.db
    .from("restaurants")
    .select("id", { count: "exact", head: true })
    .eq("chain_parent_id", restaurantId);
  if ((siblingCount ?? 0) > 0) {
    return NextResponse.json(
      { error: `This venue has ${siblingCount} chain branch(es) attached — detach or delete them first.` },
      { status: 409 }
    );
  }

  // Leave a 301 from the retired slug to the chain flagship, when it's a branch.
  if (row.slug && row.chain_parent_id) {
    const { data: parent } = await ctx.db
      .from("restaurants")
      .select("slug")
      .eq("id", row.chain_parent_id)
      .single();
    if (parent?.slug && parent.slug !== row.slug) {
      await ctx.db
        .from("slug_redirects")
        .upsert({ old_slug: row.slug, new_slug: parent.slug }, { onConflict: "old_slug" });
    }
  }

  const { error: delErr } = await ctx.db.from("restaurants").delete().eq("id", restaurantId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  revalidateVenues();
  return NextResponse.json({ ok: true, deleted: restaurantId });
}
