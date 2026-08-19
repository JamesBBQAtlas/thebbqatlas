import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin/audit-log";

export const dynamic = "force-dynamic";

/**
 * Admin-only member rename — change a member's username and/or display name (the
 * "firestarter → flamephoenix" hand-edit, now auditable). Service-role write; every
 * change writes one `admin_audit_log` row (action `user.username_change`). Never
 * touches role/account_type (those have their own guarded paths).
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.username === "string") patch.username = body.username.trim();
  if (typeof body.display_name === "string") patch.display_name = body.display_name.trim();
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Provide a username and/or display_name to change." }, { status: 400 });
  }

  const { db, userId: actorId } = ctx;
  const { data: before, error: readErr } = await db
    .from("profiles")
    .select("username, display_name")
    .eq("id", id)
    .single();
  if (readErr || !before) return NextResponse.json({ error: "Member not found." }, { status: 404 });

  // No-op guard — nothing actually changing.
  const changed: Record<string, { old: unknown; new: unknown }> = {};
  for (const k of Object.keys(patch)) {
    if (String(before[k as keyof typeof before] ?? "") !== String(patch[k] ?? "")) {
      changed[k] = { old: before[k as keyof typeof before] ?? null, new: patch[k] ?? null };
    }
  }
  if (Object.keys(changed).length === 0) {
    return NextResponse.json({ ok: true, message: "No change." });
  }

  const { error: updErr } = await db.from("profiles").update(patch).eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  let targetEmail: string | null = null;
  try {
    const { data: u } = await db.auth.admin.getUserById(id);
    targetEmail = u?.user?.email ?? null;
  } catch {
    /* email best-effort */
  }
  await logAdminAction({
    db, actorId,
    action: "user.username_change",
    entityType: "profile",
    entityId: id,
    summary:
      "username" in changed
        ? `username ${changed.username.old ?? "—"} → ${changed.username.new ?? "—"}`
        : `display name ${changed.display_name?.old ?? "—"} → ${changed.display_name?.new ?? "—"}`,
    diff: changed,
    context: { route: "admin/members", target_email: targetEmail },
  });

  return NextResponse.json({ ok: true, changed: Object.keys(changed) });
}

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
