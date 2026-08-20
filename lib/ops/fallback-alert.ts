import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin/audit-log";
import { sendEmail } from "@/lib/email/send";
import { EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/email/config";

/**
 * Fail LOUD when a public read serves its fallback (BUILD PROMPT 75). A silent
 * fallback that looks authoritative is how the "75-venue" seed reached production
 * three times. This emits a real, visible alert — an append-only audit row AND an
 * email — so "we're serving the fallback" is never invisible again.
 *
 * Throttled per warm instance (one alert / 10 min) so a real outage doesn't fire a
 * storm of emails/rows on every request. Everything is best-effort and fire-and-
 * forget: the alert must never slow, or throw into, the request that's serving the
 * page. (The audit row may itself fail if the DB is the thing that's down — that's
 * fine; the email still goes, and the console.error is unconditional.)
 */

let lastAlertAt = 0;
const THROTTLE_MS = 10 * 60 * 1000;

export function reportFallbackServed(
  source: string,
  err: unknown,
  meta?: Record<string, unknown>
): void {
  // Unconditional — always in the logs, even inside the throttle window.
  console.error(`[ALERT][fallback] "${source}" served fallback:`, err, meta ?? {});

  const now = Date.now();
  if (now - lastAlertAt < THROTTLE_MS) return;
  lastAlertAt = now;

  void emitAlert(source, err, meta);
}

async function emitAlert(source: string, err: unknown, meta?: Record<string, unknown>): Promise<void> {
  const detail = err instanceof Error ? err.message : String(err);

  // Durable record (best-effort — may fail if the DB is what's down).
  try {
    await logAdminAction({
      db: createAdminClient(),
      actorId: null,
      actorEmail: "system:ops",
      action: "ops.fallback_served",
      entityType: "system",
      entityId: null,
      summary: `Public read "${source}" fell back${meta?.servedLastKnownGood ? " (served last-known-good real data)" : " (served seed)"} — ${detail}`,
      context: { source, error: detail, ...meta },
    });
  } catch {
    /* swallow — never throw into the request path */
  }

  // Email alert (best-effort; independent of the DB).
  try {
    const servedLkg = Boolean(meta?.servedLastKnownGood);
    await sendEmail({
      to: EMAIL_REPLY_TO,
      subject: `⚠️ Fallback served (${source}) — The BBQ Atlas`,
      text:
        `A public read fell back to ${servedLkg ? "last-known-good real data" : "the SEED"} for "${source}".\n\n` +
        `Error: ${detail}\nMeta: ${JSON.stringify(meta ?? {})}\n\n` +
        `The cache is NOT poisoned — the read throws on failure, so unstable_cache never persists it; ` +
        `it self-heals on the next successful request. If this repeats, check DB/pooler health.`,
      html:
        `<p>A public read fell back to <strong>${servedLkg ? "last-known-good real data" : "the SEED"}</strong> for <code>${source}</code>.</p>` +
        `<p>Error: <code>${detail.replace(/</g, "&lt;")}</code></p>` +
        `<p>The cache is <strong>not</strong> poisoned (throw-don't-cache) — it self-heals on the next successful request. If this repeats, check DB/pooler health.</p>`,
      from: EMAIL_FROM.transactional,
      stream: "transactional",
      type: "ops_alert",
    });
  } catch {
    /* swallow */
  }
}
