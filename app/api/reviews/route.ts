import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/anon";
import { getRequestUser } from "@/lib/auth/request-user";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { revalidateVenues } from "@/lib/cache/venues";

export const dynamic = "force-dynamic";

/**
 * #315 — user reviews (written, moderated, NO star rating). GET returns approved
 * reviews for a venue (public). POST submits a review (auth via cookie OR Bearer)
 * as `pending` for moderation; a member has one review per venue (re-submitting
 * edits it and returns it to the queue).
 */
export async function GET(request: Request) {
  const restaurantId = new URL(request.url).searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "Missing venue" }, { status: 400 });

  const anon = createAnonClient();
  const { data: reviews } = await anon
    .from("reviews")
    .select("id, body, created_at, user_id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = reviews ?? [];
  // Attach reviewer display names (public profile fields).
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  const nameById = new Map<string, { name: string; username: string | null }>();
  if (ids.length) {
    const { data: profs } = await anon
      .from("profiles")
      .select("id, display_name, username")
      .in("id", ids);
    for (const p of profs ?? [])
      nameById.set(p.id, { name: p.display_name ?? "A member", username: p.username ?? null });
  }

  return NextResponse.json({
    reviews: rows.map((r) => ({
      id: r.id,
      body: r.body,
      created_at: r.created_at,
      author: nameById.get(r.user_id)?.name ?? "A member",
      username: nameById.get(r.user_id)?.username ?? null,
    })),
  });
}

export async function POST(request: Request) {
  if (!(await rateLimit(`review:${clientIp(request)}`, 10, 3600))) {
    return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  }

  const auth = await getRequestUser(request);
  if (!auth) return NextResponse.json({ error: "Sign in to leave a review." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "").trim();
  const text = String(body.body ?? "").trim();
  if (!restaurantId) return NextResponse.json({ error: "Missing venue" }, { status: 400 });
  if (text.length < 20 || text.length > 4000) {
    return NextResponse.json(
      { error: "A review needs to be between 20 and 4000 characters." },
      { status: 400 }
    );
  }

  // Service role for the write (append-only, always pending) — the user identity
  // came from the verified cookie/Bearer session above.
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : auth.db;

  const { data: existing } = await admin
    .from("reviews")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin
      .from("reviews")
      .update({ body: text, rating: null, status: "pending" })
      .eq("id", existing.id);
    if (error) { console.error("[reviews] error:", error.message); return NextResponse.json({ error: "Could not save your review." }, { status: 500 }); }
  } else {
    const { error } = await admin.from("reviews").insert({
      restaurant_id: restaurantId,
      user_id: auth.userId,
      body: text,
      rating: null,
      status: "pending",
    });
    if (error) { console.error("[reviews] error:", error.message); return NextResponse.json({ error: "Could not save your review." }, { status: 500 }); }
  }

  revalidateVenues();
  return NextResponse.json({ ok: true, pending: true });
}
