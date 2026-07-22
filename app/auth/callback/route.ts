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

      // Enforce 2FA step-up: the OAuth / magic-link session lands at aal1, so if
      // the account has a verified factor we send them to the TOTP challenge
      // before granting access. Fail CLOSED — only skip the challenge when we can
      // confirm no step-up is needed (already aal2, or no factor at all). On any
      // ambiguity we route through /login/mfa, which forwards those users on.
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const noStepUpNeeded =
        aal?.currentLevel === "aal2" ||
        (aal?.currentLevel === "aal1" && aal?.nextLevel === "aal1");
      if (!noStepUpNeeded) {
        return NextResponse.redirect(
          `${origin}/login/mfa?next=${encodeURIComponent(next)}`
        );
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
