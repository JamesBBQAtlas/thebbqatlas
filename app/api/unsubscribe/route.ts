import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/seo/site";
import { MARKETING_CONSENT_RECORD } from "@/lib/email/consent";

/**
 * One-click unsubscribe from marketing. Works without login via a per-profile
 * token. Supports POST (email clients' List-Unsubscribe one-click) and GET
 * (a clicked link → redirect to the confirmation page). Idempotent.
 */
async function setOptIn(token: string | null, optIn: boolean): Promise<boolean> {
  if (!token || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  try {
    const admin = createAdminClient();
    const patch: Record<string, unknown> = { marketing_opt_in: optIn };
    if (optIn) {
      // Resubscribe records fresh, versioned consent (time + exact wording).
      patch.marketing_opt_in_at = new Date().toISOString();
      patch.marketing_opt_in_text = MARKETING_CONSENT_RECORD;
    }
    const { data } = await admin
      .from("profiles")
      .update(patch)
      .eq("unsubscribe_token", token)
      .select("id");

    // The same token space also covers anonymous newsletter subscribers
    // (email_subscribers). One-click unsubscribe must work for both lists.
    const { data: subs } = await admin
      .from("email_subscribers")
      .update({ unsubscribed_at: optIn ? null : new Date().toISOString() })
      .eq("unsubscribe_token", token)
      .select("id");

    return Boolean((data && data.length) || (subs && subs.length));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  // One-click (List-Unsubscribe) never sets resub — it always unsubscribes.
  const optIn = url.searchParams.get("resub") === "1";
  await setOptIn(token, optIn);
  // Always 200 for one-click clients, even if token is unknown.
  return NextResponse.json({ ok: true, marketing_opt_in: optIn });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  await setOptIn(token, false);
  return NextResponse.redirect(
    `${SITE_URL}/unsubscribe?token=${token ?? ""}&done=1`
  );
}
