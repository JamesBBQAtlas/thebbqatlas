import { sendEmail } from "@/lib/email/send";
import { EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/email/config";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * M6 — alert the team when a scheduled job FAILS. Before this, only db-export emailed on
 * failure; a crash in link-health / photo-safety / the lifecycle drips surfaced only as a
 * silent 500 indistinguishable from "nothing found" (a dead weekly photo re-sweep would
 * be invisible). Mirrors db-export's alert. Best-effort and never throws — the console
 * breadcrumb is the fallback when email is off.
 */
export async function reportCronFailure(
  job: string,
  err: unknown,
  meta?: Record<string, unknown>
): Promise<void> {
  const detail =
    err instanceof Error ? `${err.message}\n\n${err.stack ?? ""}` : String(err);
  // eslint-disable-next-line no-console
  console.error(`[cron:${job}] FAILED:`, detail, meta ?? "");
  try {
    await sendEmail({
      to: EMAIL_REPLY_TO,
      from: EMAIL_FROM.transactional,
      stream: "transactional",
      type: "cron_failure",
      subject: `⚠️ Cron failed: ${job}`,
      html:
        `<p>The scheduled job <strong>${escapeHtml(job)}</strong> failed.</p>` +
        `<pre>${escapeHtml(detail)}</pre>` +
        (meta ? `<pre>${escapeHtml(JSON.stringify(meta, null, 2))}</pre>` : ""),
      text:
        `Cron failed: ${job}\n\n${detail}` +
        (meta ? `\n\n${JSON.stringify(meta, null, 2)}` : ""),
    });
  } catch {
    // best-effort — the console.error above is the durable breadcrumb.
  }
}
