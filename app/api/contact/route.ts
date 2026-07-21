import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public contact form. Stores the message (server-side, via the service-role
 * client so no public insert policy is needed). Basic validation + honeypot.
 */
export async function POST(request: Request) {
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

  const db = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : await createClient();

  const { error } = await db.from("contact_messages").insert({
    name,
    email,
    subject,
    message,
  });
  if (error) {
    return NextResponse.json({ error: "Could not send — please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
