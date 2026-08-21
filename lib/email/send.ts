import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_ENABLED, EMAIL_REPLY_TO } from "./config";

export type EmailStatus = "sent" | "failed" | "skipped";

export interface SendParams {
  to: string;
  subject: string;
  html: string;
  text: string;
  from: string;
  stream: "transactional" | "marketing";
  type: string;
  userId?: string | null;
  replyTo?: string;
  headers?: Record<string, string>;
}

async function logEmail(row: {
  to_email: string;
  type: string;
  stream: string;
  status: EmailStatus;
  subject?: string;
  provider_id?: string | null;
  error?: string | null;
  user_id?: string | null;
}) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const admin = createAdminClient();
    await admin.from("email_log").insert(row);
  } catch {
    // audit logging is best-effort — never let it break a send
  }
}

/**
 * M3 — marketing opt-out enforced at the choke point. A `stream: "marketing"` send to
 * someone who unsubscribed (email_subscribers.unsubscribed_at set) or explicitly opted
 * out (profiles.marketing_opt_in === false) is refused HERE, so consent can never be
 * bypassed by a caller that forgot to filter. Transactional mail is unaffected. Lookup
 * errors never block a send (returns false).
 */
async function isMarketingSuppressed(to: string, userId?: string | null): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const admin = createAdminClient();
    const { data: sub } = await admin
      .from("email_subscribers")
      .select("unsubscribed_at")
      .eq("email", to)
      .maybeSingle();
    if (sub?.unsubscribed_at) return true;
    if (userId) {
      const { data: prof } = await admin
        .from("profiles")
        .select("marketing_opt_in")
        .eq("id", userId)
        .maybeSingle();
      if (prof && prof.marketing_opt_in === false) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Send one email through Resend. Entirely gated: with no RESEND_API_KEY the
 * send is a logged no-op (status 'skipped'), never a crash. Always ships both
 * html + text. Never throws — returns a status the caller can ignore.
 */
export async function sendEmail(p: SendParams): Promise<{
  status: EmailStatus;
  id?: string;
  error?: string;
}> {
  if (!EMAIL_ENABLED) {
    // Log the email TYPE only — never the recipient address (PII) to stdout.
    console.log(`[email:skipped] ${p.type} (RESEND_API_KEY not set)`);
    await logEmail({
      to_email: p.to,
      type: p.type,
      stream: p.stream,
      status: "skipped",
      subject: p.subject,
      user_id: p.userId ?? null,
    });
    return { status: "skipped" };
  }

  // M3 — refuse a marketing send to an opted-out recipient (choke-point enforcement).
  if (p.stream === "marketing" && (await isMarketingSuppressed(p.to, p.userId))) {
    console.log(`[email:suppressed] ${p.type} — recipient opted out of marketing`);
    await logEmail({
      to_email: p.to,
      type: p.type,
      stream: p.stream,
      status: "skipped",
      subject: p.subject,
      error: "marketing opt-out",
      user_id: p.userId ?? null,
    });
    return { status: "skipped" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: p.from,
        to: [p.to],
        subject: p.subject,
        html: p.html,
        text: p.text,
        reply_to: p.replyTo ?? EMAIL_REPLY_TO,
        ...(p.headers ? { headers: p.headers } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = data?.message || `Resend HTTP ${res.status}`;
      await logEmail({
        to_email: p.to,
        type: p.type,
        stream: p.stream,
        status: "failed",
        subject: p.subject,
        error,
        user_id: p.userId ?? null,
      });
      return { status: "failed", error };
    }
    await logEmail({
      to_email: p.to,
      type: p.type,
      stream: p.stream,
      status: "sent",
      subject: p.subject,
      provider_id: data?.id ?? null,
      user_id: p.userId ?? null,
    });
    return { status: "sent", id: data?.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : "send error";
    await logEmail({
      to_email: p.to,
      type: p.type,
      stream: p.stream,
      status: "failed",
      subject: p.subject,
      error,
      user_id: p.userId ?? null,
    });
    return { status: "failed", error };
  }
}
