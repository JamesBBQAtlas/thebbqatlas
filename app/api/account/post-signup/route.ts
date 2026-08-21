import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { syncSignup } from "@/lib/email/signup";

/**
 * Covers the signup path where a session is created immediately (no email
 * confirmation) and the auth callback doesn't fire. Idempotent — safe to call
 * more than once; the welcome only sends once.
 */
export async function POST(request: Request) {
  // B8 — accept a Bearer token (native) OR cookie (web); web flow is unchanged.
  const auth = await getRequestUser(request);
  if (!auth) return NextResponse.json({ ok: true });
  await syncSignup(auth.db, auth.user);
  return NextResponse.json({ ok: true });
}
