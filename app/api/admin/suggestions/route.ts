import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

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

  if (action === "reject") {
    await ctx.db.from("suggestions").update({ status: "rejected" }).eq("id", id);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // Approve: apply the proposed (whitelisted) fields.
  const proposed = (s.proposed ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(proposed)) {
    if (ALLOWED.has(k) && v !== undefined) update[k] = v;
  }
  if (s.restaurant_id && Object.keys(update).length > 0) {
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

  return NextResponse.json({ ok: true, status: "applied", applied: Object.keys(update) });
}
