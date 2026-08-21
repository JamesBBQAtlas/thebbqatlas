import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sweepPhotoSafety, type SweepSummary } from "@/lib/admin/photo-safety";
import { PHOTO_SAFETY_ENABLED } from "@/lib/ai/photo-safety";
import { sendEmail } from "@/lib/email/send";
import { EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/email/config";
import { reportCronFailure } from "@/lib/ops/cron-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Prompt 4b — weekly photo-safety re-sweep. Screens the least-recently-checked
 * community photos (unchecked first, then stalest) so nothing sits unscreened even
 * if nobody opens the admin. When anything is FLAGGED it emails the admin inbox.
 * Like the link-health sweep it only FLAGS — it never unpublishes or rejects (a human
 * decides). Bounded per run to stay cheap. Dormant when XAI_API_KEY isn't set.
 */
async function runPhotoSafety(): Promise<SweepSummary & { emailed: boolean }> {
  const db = createAdminClient();
  const summary = await sweepPhotoSafety(db, { limit: 200 });

  let emailed = false;
  if (summary.flagged > 0) {
    const text =
      `Weekly photo-safety sweep flagged ${summary.flagged} photo(s) for review ` +
      `(screened ${summary.screened}: ${summary.passed} pass, ${summary.errors} error).\n\n` +
      `Review and decide in /admin/media — flagged items are sorted to the top. ` +
      `Nothing was unpublished; a flag is only a signal.`;
    const html =
      `<p><strong>${summary.flagged}</strong> photo(s) flagged by the weekly safety sweep ` +
      `(of ${summary.screened} screened · ${summary.passed} pass · ${summary.errors} error).</p>` +
      `<p>Review them in <a href="https://thebbqatlas.com/admin/media">Media moderation</a> — ` +
      `flagged items sort to the top. Nothing was unpublished; a flag is only a signal.</p>`;
    const res = await sendEmail({
      to: EMAIL_REPLY_TO,
      subject: `⚠️ ${summary.flagged} photo(s) flagged by safety sweep — The BBQ Atlas`,
      html,
      text,
      from: EMAIL_FROM.transactional,
      stream: "transactional",
      type: "photo_safety",
    });
    emailed = res.status === "sent";
  }
  return { ...summary, emailed };
}

/** Scheduled entrypoint — Vercel Cron issues GET with Bearer CRON_SECRET. */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const ok = Boolean(process.env.CRON_SECRET) && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!PHOTO_SAFETY_ENABLED) {
    return NextResponse.json({ skipped: true, reason: "XAI_API_KEY not set" });
  }
  try {
    return NextResponse.json(await runPhotoSafety());
  } catch (e) {
    await reportCronFailure("photo-safety", e);
    return NextResponse.json({ ok: false, error: "cron failed" }, { status: 500 });
  }
}

/** Manual "run now" for an authenticated admin. */
export async function POST() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await runPhotoSafety());
  } catch (e) {
    await reportCronFailure("photo-safety", e);
    return NextResponse.json({ ok: false, error: "cron failed" }, { status: 500 });
  }
}
