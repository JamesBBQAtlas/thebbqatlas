import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkLibraryLinks, type CheckSummary } from "@/lib/media/link-health";
import { sendEmail } from "@/lib/email/send";
import { EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/email/config";
import { reportCronFailure } from "@/lib/ops/cron-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Part C — weekly library link-health sweep, so pulled/dead content is caught even
 * if nobody opens the admin. Re-checks the whole Watch/Read/Listen library and,
 * when anything is BROKEN, emails the admin inbox so James hears about it without
 * opening the page. Does NOT auto-unpublish (James's call) — it only flags.
 */
async function runLinkHealth(): Promise<CheckSummary & { emailed: boolean }> {
  const db = createAdminClient();
  const summary = await checkLibraryLinks(db);

  let emailed = false;
  if (summary.broken > 0) {
    const lines = summary.brokenItems.map((b) => `• ${b.id}${b.note ? ` — ${b.note}` : ""}`).join("\n");
    const text = `Library link-health sweep found ${summary.broken} broken link(s) out of ${summary.total} checked (${summary.ok} OK, ${summary.unchecked} unchecked).\n\nBroken:\n${lines}\n\nReview them in /admin/watch-read-listen.`;
    const html = `<p><strong>${summary.broken}</strong> broken library link(s) found (of ${summary.total} checked · ${summary.ok} OK · ${summary.unchecked} unchecked).</p><pre>${lines.replace(/</g, "&lt;")}</pre><p>Review them in <a href="https://thebbqatlas.com/admin/watch-read-listen">the WRL admin</a>.</p>`;
    const res = await sendEmail({
      to: EMAIL_REPLY_TO,
      subject: `⚠️ ${summary.broken} broken library link(s) — The BBQ Atlas`,
      html,
      text,
      from: EMAIL_FROM.transactional,
      stream: "transactional",
      type: "link_health",
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
  try {
    return NextResponse.json(await runLinkHealth());
  } catch (e) {
    await reportCronFailure("link-health", e);
    return NextResponse.json({ ok: false, error: "cron failed" }, { status: 500 });
  }
}

/** Manual "run now" for an authenticated admin. */
export async function POST() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await runLinkHealth());
  } catch (e) {
    await reportCronFailure("link-health", e);
    return NextResponse.json({ ok: false, error: "cron failed" }, { status: 500 });
  }
}
