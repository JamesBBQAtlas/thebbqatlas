import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * Approved community photos for a venue — feeds the Hero panel's "Choose from
 * user photos" picker (§4). Image media only.
 */
export async function GET(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const { data } = await ctx.db
    .from("media")
    .select("id, url, caption")
    .eq("restaurant_id", id)
    .eq("kind", "image")
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(24);

  return NextResponse.json({ photos: data ?? [] });
}
