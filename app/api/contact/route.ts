import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { sendContactNotification } from "@/lib/email/senders";
import { isPriorityUser } from "@/lib/priority/senders";

export const dynamic = "force-dynamic";

/**
 * Public contact form. Stores the message server-side via the service-role
 * client — contact_messages is deliberately RLS-locked with no public policy
 * (same pattern as email_subscribers), so the service role is the ONLY writer.
 * That means the key must be present: if it isn't we say so (503) rather than
 * quietly attempting an anon insert RLS would reject. Basic validation + honeypot.
 */
export async function POST(request: Request) {
  // Service role is required to write the RLS-locked table. Fail loud, not silent.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  // Rate limit: 5 messages per IP per hour (backstops Vercel Firewall).
  if (!(await rateLimit(`contact:${clientIp(request)}`, 5, 3600))) {
    return NextResponse.json(
      { error: "Too many messages — please try again later." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));

  // Honeypot: bots fill hidden fields.
  if (body.company) return NextResponse.json({ ok: true });

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const subject = String(body.subject ?? "").trim().slice(0, 160) || null;
  const message = String(body.message ?? "").trim();

  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || message.length < 5) {
    return NextResponse.json(
      { error: "Please add your name, a valid email, and a message." },
      { status: 400 }
    );
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: "Message is too long." }, { status: 400 });
  }

  // Trust signal from the SESSION, not the email header (can't be spoofed): a
  // signed-in venue owner or premium member is flagged priority in admin intake.
  let userId: string | null = null;
  let priority = false;
  try {
    const s = await createClient();
    userId = (await s.auth.getUser()).data.user?.id ?? null;
    if (userId) priority = await isPriorityUser(userId);
  } catch {
    /* anonymous — normal intake */
  }

  const db = createAdminClient();

  const { error } = await db.from("contact_messages").insert({
    name,
    email,
    subject,
    message,
    user_id: userId,
    priority,
  });
  if (error) {
    return NextResponse.json({ error: "Could not send — please try again." }, { status: 500 });
  }

  // Ping the team so the message is actually seen (no admin inbox page yet).
  // Best-effort: the message is already stored, so a mail hiccup never fails it.
  try {
    await sendContactNotification({ name, email, subject, message });
  } catch {
    /* notification is best-effort */
  }

  return NextResponse.json({ ok: true });
}
