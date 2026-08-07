import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordVenueView } from "@/lib/analytics/record";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Records a venue profile view (Fable H-1 + C-1). Fired as a fire-and-forget
 * beacon from the venue page on mount so the page itself stays static. The
 * session hash + bot filter are computed server-side from the request headers
 * (recordVenueView), so bots are dropped and the anonymous view is deduped once
 * per session per day. Owner self-views are excluded at report time (the row
 * carries user_id). Never errors back to the client.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { restaurantId?: string };
  const restaurantId = String(body.restaurantId ?? "");
  if (!UUID_RE.test(restaurantId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let userId: string | null = null;
  try {
    const s = await createClient();
    userId = (await s.auth.getUser()).data.user?.id ?? null;
  } catch {
    /* anonymous */
  }

  await recordVenueView({ restaurantId, headers: request.headers, userId });
  return NextResponse.json({ ok: true });
}
