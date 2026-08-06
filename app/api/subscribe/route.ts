import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MARKETING_CONSENT_RECORD,
  MARKETING_CONSENT_VERSION,
} from "@/lib/email/consent";
import { sendSubscriberWelcome } from "@/lib/email/senders";

export const dynamic = "force-dynamic";

// Deliberately permissive shape check — real validation is the unique index +
// the consent gate below. Caps length to avoid oversized payloads.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Public newsletter signup. Writes to email_subscribers via the service role
 * (RLS denies the browser any direct access). UK-GDPR/PECR: we refuse to store
 * anything without explicit, unbundled consent (`consent === true`), and we
 * persist the exact wording + version the visitor agreed to.
 */
export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  }

  let body: { email?: string; consent?: boolean; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }
  if (body.consent !== true) {
    return NextResponse.json({ ok: false, error: "consent_required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Light abuse backstop (Vercel Firewall covers the edge). Best-effort only.
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { data: allowed } = await admin.rpc("check_rate_limit", {
      p_key: `subscribe:${ip}`,
      p_limit: 10,
      p_window_seconds: 3600,
    });
    if (allowed === false) {
      return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }
  } catch {
    /* non-fatal — never block a genuine signup on the limiter */
  }

  // Upsert on email: re-subscribing refreshes consent and clears any prior
  // unsubscribe. Response never reveals whether the address already existed.
  const { error } = await admin.from("email_subscribers").upsert(
    {
      email,
      consent_text: MARKETING_CONSENT_RECORD,
      consent_version: MARKETING_CONSENT_VERSION,
      source:
        typeof body.source === "string" ? body.source.slice(0, 60) : "footer",
      unsubscribed_at: null,
    },
    { onConflict: "email" }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }

  // Single opt-in: send the welcome immediately (Appendix A). Deduped by the
  // audit log so a repeat submit of the same address never re-welcomes. The
  // send is best-effort — a mail hiccup must never fail a good subscription.
  try {
    const { data: sub } = await admin
      .from("email_subscribers")
      .select("unsubscribe_token")
      .eq("email", email)
      .maybeSingle();
    if (sub?.unsubscribe_token) {
      const { count } = await admin
        .from("email_log")
        .select("id", { count: "exact", head: true })
        .eq("to_email", email)
        .eq("type", "welcome")
        .in("status", ["sent", "skipped"]);
      if (!count) {
        await sendSubscriberWelcome({
          to: email,
          unsubscribeToken: String(sub.unsubscribe_token),
        });
      }
    }
  } catch {
    /* welcome is best-effort — the subscription itself already succeeded */
  }

  return NextResponse.json({ ok: true });
}
