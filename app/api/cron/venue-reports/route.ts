import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendVenueMonthlyReport } from "@/lib/email/senders";
import { reportCronFailure } from "@/lib/ops/cron-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Phase 5.2 — monthly venue reports. For each claimed venue (owner_id set), email
 * the owner their last-30-days performance. Skips venues with no discovery in the
 * window (no "0 discovered you" emails), and dedupes against email_log so a repeat
 * run within ~25 days sends nothing.
 */
async function runVenueReports(limit: number) {
  const db = createAdminClient();

  const { data: venues, error } = await db
    .from("restaurants")
    .select("id, name, slug, owner_id")
    .not("owner_id", "is", null)
    .eq("status", "approved")
    .limit(limit);
  if (error) return { ok: false, error: error.message, sent: 0 };

  const rows = venues ?? [];
  const sinceIso = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString();
  let sent = 0;
  let skippedEmpty = 0;

  for (const v of rows) {
    try {
      const { data: report } = await db.rpc("venue_report", { p_restaurant_id: v.id });
      const views = (report as { views?: { cur?: number } } | null)?.views?.cur ?? 0;
      if (!views) {
        skippedEmpty += 1;
        continue;
      }

      // Owner email (auth) + unsubscribe token (profiles).
      const ownerId = v.owner_id as string;
      const { data: authRes } = await db.auth.admin.getUserById(ownerId);
      const email = authRes?.user?.email;
      if (!email) continue;

      // Dedup: one report per owner-email per ~month.
      const { count } = await db
        .from("email_log")
        .select("id", { count: "exact", head: true })
        .eq("to_email", email)
        .eq("type", "venue_report")
        .gte("created_at", sinceIso)
        .in("status", ["sent", "skipped"]);
      if (count) continue;

      const { data: prof } = await db
        .from("profiles")
        .select("unsubscribe_token")
        .eq("id", ownerId)
        .maybeSingle();

      await sendVenueMonthlyReport({
        to: email,
        venueName: v.name as string,
        venueSlug: v.slug as string,
        report: report as Parameters<typeof sendVenueMonthlyReport>[0]["report"],
        unsubscribeToken: (prof?.unsubscribe_token as string) ?? null,
      });
      sent += 1;
    } catch {
      /* one venue failing must not stop the run */
    }
  }

  return { ok: true, sent, skippedEmpty, considered: rows.length };
}

function parseLimit(url: string): number {
  const raw = parseInt(new URL(url).searchParams.get("limit") ?? "1000", 10);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 1000, 1), 5000);
}

/** Scheduled entrypoint — Vercel Cron issues GET with Bearer CRON_SECRET. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const ok = Boolean(process.env.CRON_SECRET) && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await runVenueReports(parseLimit(request.url)));
  } catch (e) {
    await reportCronFailure("venue-reports", e);
    return NextResponse.json({ ok: false, error: "cron failed" }, { status: 500 });
  }
}

/** Manual "run now" for an authenticated admin. */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await runVenueReports(parseLimit(request.url)));
  } catch (e) {
    await reportCronFailure("venue-reports", e);
    return NextResponse.json({ ok: false, error: "cron failed" }, { status: 500 });
  }
}
