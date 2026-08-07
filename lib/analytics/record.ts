import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyticsCtx, type AnalyticsCtx } from "@/lib/analytics/server";

/**
 * Server-side capture writers (Fable C-1). These are append-only and written
 * with the service-role client (the tables are RLS-on with no policies, so no
 * anon/authenticated path can touch them). Bots are dropped; venue-owner
 * self-views are excluded; a per-day session hash dedupes so one person = one
 * view per venue per day. Telemetry never throws back into the render.
 */

/** Record a single venue profile view from the venue page's server render. */
export async function recordVenueView(opts: {
  restaurantId: string;
  headers: Headers;
  userId?: string | null;
  ownerId?: string | null;
}): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const ctx = analyticsCtx(opts.headers);
  if (ctx.is_bot) return; // never count bots
  if (opts.userId && opts.ownerId && opts.userId === opts.ownerId) return; // owner self-view
  try {
    const db = createAdminClient();
    await db.from("venue_views").upsert(
      {
        restaurant_id: opts.restaurantId,
        view_date: ctx.day,
        session_hash: ctx.session_hash,
        is_bot: false,
        referrer: ctx.referrer?.slice(0, 512) ?? null,
        country: ctx.country,
        user_id: opts.userId ?? null,
      },
      { onConflict: "restaurant_id,session_hash,view_date", ignoreDuplicates: true }
    );
  } catch {
    /* telemetry must never break render */
  }
}

/**
 * Record that a set of venues appeared in a directory/search result list.
 * Deduped per (venue, page, session, day) so a browse doesn't explode the table.
 */
export async function recordSearchImpressions(opts: {
  items: { restaurantId: string; position: number }[];
  page: string;
  headers: Headers;
  ctx?: AnalyticsCtx;
}): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  if (!opts.items.length) return;
  const ctx = opts.ctx ?? analyticsCtx(opts.headers);
  if (ctx.is_bot || !ctx.session_hash) return; // bots and un-keyable sessions skipped
  const rows = opts.items.slice(0, 100).map((it) => ({
    restaurant_id: it.restaurantId,
    page: opts.page.slice(0, 200),
    position: it.position,
    session_hash: ctx.session_hash,
    is_bot: false,
    impression_date: ctx.day,
  }));
  try {
    const db = createAdminClient();
    await db
      .from("search_impressions")
      .upsert(rows, {
        onConflict: "restaurant_id,page,session_hash,impression_date",
        ignoreDuplicates: true,
      });
  } catch {
    /* telemetry must never break render */
  }
}
