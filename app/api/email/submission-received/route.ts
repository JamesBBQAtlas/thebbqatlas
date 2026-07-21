import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSubmissionReceived } from "@/lib/email/senders";

export const dynamic = "force-dynamic";

/**
 * Fire the "submission received" email after a venue is submitted. To avoid
 * being an open email relay, we only send once we've confirmed a matching
 * submission was actually created in the last 15 minutes — either by the
 * provided contact email, or by the signed-in submitter (sent to their own
 * account email). Otherwise it's a no-op.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const body = await request.json().catch(() => ({}));
  const email =
    typeof body.email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)
      ? body.email.trim()
      : null;
  const venueName = typeof body.venueName === "string" ? body.venueName.slice(0, 160) : undefined;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ ok: true });
  const admin = createAdminClient();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  let target: string | null = null;
  if (email) {
    const { data } = await admin
      .from("submissions")
      .select("id")
      .eq("contact_email", email)
      .gte("created_at", since)
      .limit(1);
    if (data && data.length) target = email;
  } else if (user?.email) {
    const { data } = await admin
      .from("submissions")
      .select("id")
      .eq("submitted_by", user.id)
      .gte("created_at", since)
      .limit(1);
    if (data && data.length) target = user.email;
  }

  if (!target) return NextResponse.json({ ok: true, sent: false });

  await sendSubmissionReceived({ to: target, venueName });
  return NextResponse.json({ ok: true, sent: true });
}
