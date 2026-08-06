import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendSubscriberWelcome,
  sendSubscriberDrip3,
  sendSubscriberDrip7,
} from "@/lib/email/senders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Footer-newsletter lifecycle (email_subscribers list). Runs daily via Vercel
 * Cron. For each active subscriber, at most ONE action per run, in priority
 * order — welcome first, then day-3 before day-7:
 *
 *   1. WELCOME  — anyone with no welcome logged yet (backfills early signups who
 *                 predate the on-subscribe send; new signups already got theirs).
 *   2. DRIP_3   — created_at ≥ 3 days ago and no drip_3 yet.
 *   3. DRIP_7   — created_at ≥ 7 days ago, drip_3 ALREADY sent (a prior run), and
 *                 no drip_7 yet.
 *
 * Eligibility is "at least N days old AND not yet sent" (not "exactly N days"),
 * so nobody is skipped if the scheduler is deployed late or misses a day. Every
 * send is deduped against email_log (idempotent — a second run the same day
 * sends nothing), and unsubscribed rows are excluded. day-7 requires drip_3 to
 * already be in the log, so the two never arrive together.
 */
async function runSubscriberLifecycle(limit: number) {
  const db = createAdminClient();
  const now = Date.now();
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: subs, error } = await db
    .from("email_subscribers")
    .select("email, created_at, unsubscribe_token")
    .is("unsubscribed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return { ok: false, error: error.message, welcome: 0, drip3: 0, drip7: 0 };
  }
  const rows = subs ?? [];
  if (rows.length === 0) return { ok: true, welcome: 0, drip3: 0, drip7: 0, considered: 0 };

  // What's already been sent? Build email → set(type) from the audit log, only
  // counting real sends (sent/skipped) so a transient 'failed' can retry.
  const emails = rows.map((r) => r.email);
  const sentByEmail = new Map<string, Set<string>>();
  const { data: logs } = await db
    .from("email_log")
    .select("to_email, type, status")
    .in("to_email", emails)
    .in("type", ["welcome", "drip_3", "drip_7"])
    .in("status", ["sent", "skipped"]);
  for (const l of logs ?? []) {
    const set = sentByEmail.get(l.to_email) ?? new Set<string>();
    set.add(l.type);
    sentByEmail.set(l.to_email, set);
  }

  let welcome = 0;
  let drip3 = 0;
  let drip7 = 0;

  for (const r of rows) {
    const done = sentByEmail.get(r.email) ?? new Set<string>();
    const token = String(r.unsubscribe_token);
    const created = r.created_at as string;

    // 1. Welcome backfill — highest priority, guarantees welcome precedes drips.
    if (!done.has("welcome")) {
      await sendSubscriberWelcome({ to: r.email, unsubscribeToken: token });
      welcome += 1;
      continue; // one action per subscriber per run
    }
    // 2. Day-3.
    if (created <= threeDaysAgo && !done.has("drip_3")) {
      await sendSubscriberDrip3({ to: r.email, unsubscribeToken: token });
      drip3 += 1;
      continue;
    }
    // 3. Day-7 — only after drip_3 has landed in a prior run.
    if (created <= sevenDaysAgo && done.has("drip_3") && !done.has("drip_7")) {
      await sendSubscriberDrip7({ to: r.email, unsubscribeToken: token });
      drip7 += 1;
      continue;
    }
  }

  return { ok: true, welcome, drip3, drip7, considered: rows.length };
}

function parseLimit(url: string): number {
  const raw = parseInt(new URL(url).searchParams.get("limit") ?? "500", 10);
  return Math.min(Math.max(Number.isFinite(raw) ? raw : 500, 1), 2000);
}

/** Scheduled entrypoint — Vercel Cron issues GET with Bearer CRON_SECRET. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const cronOk =
    Boolean(process.env.CRON_SECRET) && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await runSubscriberLifecycle(parseLimit(request.url));
  return NextResponse.json(result);
}

/** Manual "run now" for an authenticated admin (same job). */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await runSubscriberLifecycle(parseLimit(request.url));
  return NextResponse.json(result);
}
