import { NextResponse } from "next/server";
import { recordSearchImpressions } from "@/lib/analytics/record";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Records that a set of venues appeared in a directory/search result list
 * (Fable C-1 search_impressions). Fired as a fire-and-forget beacon from the
 * listing pages so ISR-cached hubs can still capture per-session impressions.
 * Session hash + bot filter + per-day dedupe are computed server-side in
 * recordSearchImpressions from the request headers.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    page?: string;
    items?: { restaurantId?: string; position?: number }[];
  };
  const page = String(body.page ?? "").slice(0, 200);
  const items = (Array.isArray(body.items) ? body.items : [])
    .filter((it) => it && UUID_RE.test(String(it.restaurantId)))
    .slice(0, 100)
    .map((it, i) => ({
      restaurantId: String(it.restaurantId),
      position: Number.isFinite(Number(it.position)) ? Number(it.position) : i + 1,
    }));

  if (!page || !items.length) return NextResponse.json({ ok: true });

  await recordSearchImpressions({ items, page, headers: request.headers });
  return NextResponse.json({ ok: true });
}
