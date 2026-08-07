import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendSubscriberWelcome,
  sendSubscriberDrip1,
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
  const dayAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = dayAgo(1);
  const threeDaysAgo = dayAgo(3);
  const sevenDaysAgo = dayAgo(7);
  const nowIso = new Date(now).toISOString();

  const { data: subs, error } = await db
    .from("email_subscribers")
    .select("id, email, created_at, unsubscribe_token, welcome_sent_at, day1_sent_at, day3_sent_at, day7_sent_at, became_member_at")
    .is("unsubscribed_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return { ok: false, error: error.message, welcome: 0, drip1: 0, drip3: 0, drip7: 0 };
  }
  const rows = subs ?? [];
  if (rows.length === 0)
    return { ok: true, welcome: 0, drip1: 0, drip3: 0, drip7: 0, becameMember: 0, considered: 0 };

  // Member emails (lowercased) — the drip STOPS the moment a subscriber has an
  // account. Best-effort: if the helper is unavailable, no one is wrongly skipped.
  const memberEmails = new Set<string>();
  try {
    const { data: members } = await db.rpc("marketing_members");
    for (const m of (members ?? []) as { email: string }[]) {
      if (m.email) memberEmails.add(m.email.toLowerCase());
    }
  } catch {
    /* fall through — treat as no known members this run */
  }

  const stamp = (id: string, col: string) =>
    db.from("email_subscribers").update({ [col]: nowIso }).eq("id", id);

  let welcome = 0;
  let drip1 = 0;
  let drip3 = 0;
  let drip7 = 0;
  let becameMember = 0;

  for (const r of rows) {
    const token = String(r.unsubscribe_token);
    const created = r.created_at as string;
    const id = r.id as string;

    // STOP condition: they registered → record it once, send nothing further.
    if (memberEmails.has(String(r.email).toLowerCase())) {
      if (!r.became_member_at) {
        await stamp(id, "became_member_at");
        becameMember += 1;
      }
      continue;
    }

    // One action per subscriber per run, in order — welcome, then day 1 → 3 → 7.
    if (!r.welcome_sent_at) {
      await sendSubscriberWelcome({ to: r.email, unsubscribeToken: token });
      await stamp(id, "welcome_sent_at");
      welcome += 1;
      continue;
    }
    if (created <= oneDayAgo && !r.day1_sent_at) {
      await sendSubscriberDrip1({ to: r.email, unsubscribeToken: token });
      await stamp(id, "day1_sent_at");
      drip1 += 1;
      continue;
    }
    if (created <= threeDaysAgo && !r.day3_sent_at) {
      await sendSubscriberDrip3({ to: r.email, unsubscribeToken: token });
      await stamp(id, "day3_sent_at");
      drip3 += 1;
      continue;
    }
    if (created <= sevenDaysAgo && !r.day7_sent_at) {
      await sendSubscriberDrip7({ to: r.email, unsubscribeToken: token });
      await stamp(id, "day7_sent_at");
      drip7 += 1;
      continue;
    }
  }

  return { ok: true, welcome, drip1, drip3, drip7, becameMember, considered: rows.length };
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
