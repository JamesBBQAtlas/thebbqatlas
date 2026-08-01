import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidateVenues } from "@/lib/cache/venues";

export const dynamic = "force-dynamic";

/**
 * Chain membership edits (Fix 5):
 *   - "detach": this row is NOT a sibling of the chain it's attached to — clear
 *     its chain_parent_id / flagship_unset so it stands alone again.
 *   - "attach": this orphan row IS part of a chain — adopt it as a sibling of a
 *     chosen flagship (set chain_parent_id, clear the candidate/flagship-unset
 *     flags, pre-fill any empty brand socials from the flagship). Handles the
 *     "Dinosaur Bar-B-Que Toronto existed as its own seed" case, self-serve.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  const action = body.action === "attach" ? "attach" : body.action === "detach" ? "detach" : null;
  if (!restaurantId || !action) {
    return NextResponse.json({ error: "restaurantId and a valid action are required." }, { status: 400 });
  }

  if (action === "detach") {
    // Guard: don't detach a PARENT that still has branches (that would orphan
    // them). Detach is for a wrongly-attached sibling.
    const { count } = await ctx.db
      .from("restaurants")
      .select("id", { count: "exact", head: true })
      .eq("chain_parent_id", restaurantId);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "This is a chain flagship with branches — detach the branches instead." },
        { status: 409 }
      );
    }
    const { error } = await ctx.db
      .from("restaurants")
      .update({ chain_parent_id: null, flagship_unset: false, chain_candidate: false })
      .eq("id", restaurantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidateVenues();
    return NextResponse.json({ ok: true, action, message: "Detached — now a standalone venue." });
  }

  // action === "attach"
  const parentId = String(body.parentId ?? "");
  if (!parentId) return NextResponse.json({ error: "parentId (the flagship) is required." }, { status: 400 });
  if (parentId === restaurantId) {
    return NextResponse.json({ error: "A venue can't be its own flagship." }, { status: 400 });
  }

  const { data: parent } = await ctx.db
    .from("restaurants")
    .select("id, chain_parent_id, instagram_url, website, x_url, facebook_url, tiktok_url, youtube_url")
    .eq("id", parentId)
    .single();
  if (!parent) return NextResponse.json({ error: "Flagship not found." }, { status: 404 });
  if (parent.chain_parent_id) {
    return NextResponse.json({ error: "Pick the chain's flagship (a top-level parent), not a branch." }, { status: 400 });
  }

  const { data: child } = await ctx.db
    .from("restaurants")
    .select("id, instagram_url, website, x_url, facebook_url, tiktok_url, youtube_url")
    .eq("id", restaurantId)
    .single();
  if (!child) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  const patch: Record<string, unknown> = {
    chain_parent_id: parentId,
    flagship_unset: false,
    chain_candidate: false,
  };
  // Pre-fill empty brand-level socials from the flagship (editable defaults).
  for (const k of ["instagram_url", "website", "x_url", "facebook_url", "tiktok_url", "youtube_url"] as const) {
    if (!child[k] && parent[k]) patch[k] = parent[k];
  }

  const { error } = await ctx.db.from("restaurants").update(patch).eq("id", restaurantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateVenues();
  return NextResponse.json({ ok: true, action, message: "Attached to the chain as a branch." });
}
