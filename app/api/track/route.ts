import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyticsCtx } from "@/lib/analytics/server";

const ALLOWED = new Set([
  "affiliate",
  "website",
  "phone",
  "email",
  "instagram",
  "map",
  "share",
  "save",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Append-only click capture (Fable C-1 hardened). Fire-and-forget from the
 * browser (sendBeacon). Now: drops bot traffic, stamps a privacy-preserving
 * daily session hash, validates restaurant_id, and dedupes an identical
 * (session, venue, event) within 30 minutes so a double-tap isn't two clicks.
 * Written with the service-role client so the dedupe read and bot/self filters
 * actually work. Never throws back to the client.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const eventType = String(body.event_type ?? "").slice(0, 32);
  if (!ALLOWED.has(eventType)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const ctx = analyticsCtx(req.headers);
  if (ctx.is_bot) return NextResponse.json({ ok: true }); // never count bots

  const str = (v: unknown, max: number) =>
    v == null ? null : String(v).slice(0, max);
  const rawRid = body.restaurant_id ? String(body.restaurant_id) : null;
  const restaurantId = rawRid && UUID_RE.test(rawRid) ? rawRid : null;

  // Best-effort signed-in attribution (cookie session), without blocking on it.
  let userId: string | null = null;
  try {
    const s = await createClient();
    userId = (await s.auth.getUser()).data.user?.id ?? null;
  } catch {
    /* anonymous */
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true }); // no writer available
  }

  try {
    const db = createAdminClient();

    // Dedupe window: same session + venue + event within 30 minutes = one click.
    if (ctx.session_hash) {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      let q = db
        .from("click_events")
        .select("id")
        .eq("session_hash", ctx.session_hash)
        .eq("event_type", eventType)
        .gte("created_at", since)
        .limit(1);
      q = restaurantId ? q.eq("restaurant_id", restaurantId) : q.is("restaurant_id", null);
      const { data: dup } = await q.maybeSingle();
      if (dup) return NextResponse.json({ ok: true, deduped: true });
    }

    await db.from("click_events").insert({
      event_type: eventType,
      restaurant_id: restaurantId,
      partner: str(body.partner, 48),
      target_url: str(body.target_url, 2048),
      page_path: str(body.page_path, 512),
      subtag: str(body.subtag, 120),
      user_id: userId,
      session_hash: ctx.session_hash,
      is_bot: false,
    });
  } catch {
    /* swallow — telemetry must not error */
  }

  return NextResponse.json({ ok: true });
}
