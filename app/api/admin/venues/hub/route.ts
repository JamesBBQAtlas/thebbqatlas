import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { toHubVenue } from "@/lib/admin/hub";
import type { Restaurant } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/**
 * Fetch a single venue in the admin-hub shape (HubVenue). Used by the Moderation
 * Queue's in-place enrichment tools to refresh a materialised submission's venue
 * after each action, reusing the exact same row/editor rendering as Listings.
 */
export async function GET(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const { data, error } = await ctx.db.from("restaurants").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: "Venue not found." }, { status: 404 });

  return NextResponse.json({ venue: toHubVenue(data as Restaurant) });
}
