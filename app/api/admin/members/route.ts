import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Admin-only member detail — returns a single member's activity (saved spots,
 * check-ins, bookmarks, reviews, follows) plus account meta. Never leaks the
 * service-role key; only the rendered fields below reach the client. The only
 * identifier accepted is the member's uuid (never an email in the query).
 */
export async function GET(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { db } = ctx;

  const [savedRes, checkInsRes, bookmarksRes, reviewsRes, followsRes, profileRes] =
    await Promise.all([
      db
        .from("saved_spots")
        .select("restaurant_id, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
      db
        .from("check_ins")
        .select("restaurant_id, note, visibility, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
      db
        .from("bookmarks")
        .select("title, slug, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
      db
        .from("reviews")
        .select("restaurant_id, rating, body, status, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false }),
      db
        .from("follows")
        .select("following_id, created_at")
        .eq("follower_id", id)
        .order("created_at", { ascending: false }),
      db
        .from("profiles")
        .select(
          "stripe_customer_id, unsubscribe_token, welcome_email_sent, day3_email_sent, marketing_opt_in, marketing_opt_in_at"
        )
        .eq("id", id)
        .single(),
    ]);

  const savedRows = savedRes.data ?? [];
  const checkInRows = checkInsRes.data ?? [];
  const reviewRows = reviewsRes.data ?? [];

  // Resolve venue names in a single query (no reliance on embedded FK joins).
  const restaurantIds = [
    ...new Set(
      [
        ...savedRows.map((r) => r.restaurant_id),
        ...checkInRows.map((r) => r.restaurant_id),
        ...reviewRows.map((r) => r.restaurant_id),
      ].filter(Boolean)
    ),
  ] as string[];

  const venueById = new Map<string, { name: string; slug: string }>();
  if (restaurantIds.length) {
    const { data: venues } = await db
      .from("restaurants")
      .select("id, name, slug")
      .in("id", restaurantIds);
    for (const v of venues ?? []) venueById.set(v.id, { name: v.name, slug: v.slug });
  }

  // Provider comes from the auth user (service role only).
  let provider: string | null = null;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createAdminClient();
      const { data } = await admin.auth.admin.getUserById(id);
      provider = data?.user?.app_metadata?.provider ?? null;
    } catch {
      /* best-effort */
    }
  }

  const savedSpots = savedRows.map((r) => ({
    name: venueById.get(r.restaurant_id)?.name ?? null,
    slug: venueById.get(r.restaurant_id)?.slug ?? null,
    date: r.created_at,
  }));

  const checkIns = checkInRows.map((r) => ({
    name: venueById.get(r.restaurant_id)?.name ?? null,
    slug: venueById.get(r.restaurant_id)?.slug ?? null,
    note: r.note ?? null,
    visibility: r.visibility ?? null,
    date: r.created_at,
  }));

  const bookmarks = (bookmarksRes.data ?? []).map((r) => ({
    title: r.title ?? null,
    slug: r.slug ?? null,
    date: r.created_at,
  }));

  const reviews = reviewRows.map((r) => ({
    name: venueById.get(r.restaurant_id)?.name ?? null,
    slug: venueById.get(r.restaurant_id)?.slug ?? null,
    rating: r.rating,
    body: r.body ?? null,
    status: r.status ?? null,
    date: r.created_at,
  }));

  const follows = (followsRes.data ?? []).map((r) => ({
    followingId: r.following_id,
    date: r.created_at,
  }));

  const p = profileRes.data;
  const meta = {
    id,
    provider,
    stripe_customer_id: p?.stripe_customer_id ?? null,
    unsubscribe_token: Boolean(p?.unsubscribe_token),
    welcome_email_sent: Boolean(p?.welcome_email_sent),
    day3_email_sent: Boolean(p?.day3_email_sent),
    marketing_opt_in: Boolean(p?.marketing_opt_in),
    marketing_opt_in_at: p?.marketing_opt_in_at ?? null,
  };

  return NextResponse.json({
    savedSpots,
    checkIns,
    bookmarks,
    reviews,
    follows,
    meta,
  });
}
