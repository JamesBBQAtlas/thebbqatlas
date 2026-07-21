import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { syncSignup } from "@/lib/email/signup";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/profile";

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
