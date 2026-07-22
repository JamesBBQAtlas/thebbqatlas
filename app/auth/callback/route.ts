import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { syncSignup } from "@/lib/email/signup";
import { safeNext } from "@/lib/auth/next";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Validated to prevent an open redirect (must be a same-origin path).
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // First authentication for a new account → welcome + consent (idempotent).
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) await syncSignup(supabase, user);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
