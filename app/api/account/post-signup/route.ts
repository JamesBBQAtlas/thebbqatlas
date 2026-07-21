import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncSignup } from "@/lib/email/signup";

/**
 * Covers the signup path where a session is created immediately (no email
 * confirmation) and the auth callback doesn't fire. Idempotent — safe to call
 * more than once; the welcome only sends once.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true });
  await syncSignup(supabase, user);
  return NextResponse.json({ ok: true });
}
