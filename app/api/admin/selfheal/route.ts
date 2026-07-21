import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { GROK_ENABLED } from "@/lib/ai/grok";
import { runSelfHealSweep } from "@/lib/selfheal/venues";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Run a self-healing sweep: find thin/closed venues, run Grok, and file
 * suggestions into the approval queue. Callable by an admin (manual "run now")
 * or by the scheduled cron (Authorization: Bearer CRON_SECRET). Never edits
 * live content — it only creates pending suggestions.
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  const cronOk =
    Boolean(process.env.CRON_SECRET) && auth === `Bearer ${process.env.CRON_SECRET}`;

  const db = cronOk
    ? createAdminClient()
    : (await requireAdmin())?.db;
  if (!db) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!GROK_ENABLED) {
    return NextResponse.json(
      { error: "AI is off — set XAI_API_KEY to enable self-healing." },
      { status: 503 }
    );
  }

  const limit = Math.min(
    Math.max(parseInt(new URL(request.url).searchParams.get("limit") ?? "4", 10) || 4, 1),
    12
  );
  const result = await runSelfHealSweep(db, limit);
  return NextResponse.json(result);
}
