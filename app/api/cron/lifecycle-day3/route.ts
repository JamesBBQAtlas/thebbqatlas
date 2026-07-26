import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDay3 } from "@/lib/email/senders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Day-3 lifecycle "social drip" (P10). Runs daily via Vercel Cron. Finds
 * marketing-opted-in accounts that are ~3 days old and haven't had the drip yet,
 * flips an atomic per-row guard (day3_email_sent false→true) so a send can never
 * double-fire, resolves the address from auth, and sends the marketing email.
 *
 * A 30-day lower bound means we never retro-blast old accounts, and the migration
 * backfills every existing account to already-sent — so only genuinely new
 * signups (after launch) ever receive it.
 */
async function runDay3Sweep(limit: number) {
  const db = createAdminClient();
  const now = Date.now();
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error } = await db
    .from("profiles")
    .select("id, unsubscribe_token")
    .eq("marketing_opt_in", true)
    .eq("day3_email_sent", false)
    .lte("created_at", threeDaysAgo)
    .gte("created_at", thirtyDaysAgo)
    .limit(limit);

  if (error) {
    return { ok: false, error: error.message, sent: 0, considered: 0 };
  }

  let sent = 0;
  for (const row of candidates ?? []) {
    // Atomic guard: only the caller that flips false→true is allowed to send.
    const { data: flipped } = await db
      .from("profiles")
      .update({ day3_email_sent: true })
      .eq("id", row.id)
      .eq("day3_email_sent", false)
      .select("id");
    if (!flipped || flipped.length === 0) continue;

    const { data: userRes } = await db.auth.admin.getUserById(row.id);
    const email = userRes?.user?.email;
    if (!email) continue; // no address — guard already set, so we won't retry

    await sendDay3({
      to: email,
      userId: row.id,
      unsubscribeToken: String(row.unsubscribe_token),
    });
    sent += 1;
  }

  return { ok: true, sent, considered: candidates?.length ?? 0 };
}

function parseLimit(url: string): number {
  const raw = parseInt(new URL(url).searchParams.get("limit") ?? "100", 10);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 100, 1), 500);
}

/** Scheduled entrypoint — Vercel Cron issues GET with Bearer CRON_SECRET. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const cronOk =
    Boolean(process.env.CRON_SECRET) && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await runDay3Sweep(parseLimit(request.url));
  return NextResponse.json(result);
}

/** Manual "run now" for an authenticated admin (same job). */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await runDay3Sweep(parseLimit(request.url));
  return NextResponse.json(result);
}
