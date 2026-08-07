import type { SupabaseClient, User } from "@supabase/supabase-js";
import { sendWelcome } from "./senders";
import { emailFirstNameFrom } from "@/lib/email/recipient";
import { MARKETING_AUTOENROLL_RECORD } from "@/lib/email/consent";

/**
 * Run once when a new user first authenticates: record any marketing consent
 * they chose at signup, and send the welcome email EXACTLY ONCE. The welcome is
 * gated by an atomic flag flip (welcome_email_sent false→true), so concurrent
 * callers (auth callback + client post-signup) can't double-send.
 */
export async function syncSignup(db: SupabaseClient, user: User): Promise<void> {
  try {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

    // Marketing: opt-OUT model — a new member is auto-enrolled (with the notice
    // wording logged) UNLESS they explicitly opted out. Runs once. Covers OAuth
    // signups (no AuthForm metadata) too, which default to enrolled.
    {
      const { data: prof } = await db
        .from("profiles")
        .select("marketing_opt_in_at")
        .eq("id", user.id)
        .maybeSingle();
      if (prof && !prof.marketing_opt_in_at) {
        const optIn = meta.marketing_opt_in === false ? false : true;
        const text =
          typeof meta.marketing_opt_in_text === "string" && meta.marketing_opt_in_text
            ? meta.marketing_opt_in_text
            : optIn
              ? MARKETING_AUTOENROLL_RECORD
              : null;
        await db
          .from("profiles")
          .update({
            marketing_opt_in: optIn,
            marketing_opt_in_at: new Date().toISOString(),
            marketing_opt_in_text: text,
          })
          .eq("id", user.id);
      }
    }

    // Welcome email — atomic flip guarantees a single send.
    const { data: flipped } = await db
      .from("profiles")
      .update({ welcome_email_sent: true })
      .eq("id", user.id)
      .eq("welcome_email_sent", false)
      .select("display_name, unsubscribe_token");

    if (flipped && flipped.length > 0 && user.email) {
      const row = flipped[0] as {
        display_name?: string;
        unsubscribe_token?: string;
      };
      // Greet by first name per the email policy: display_name → OAuth name →
      // NO name (never the email prefix). null → the template greets nameless.
      await sendWelcome({
        to: user.email,
        name:
          emailFirstNameFrom({
            displayName: row.display_name,
            email: user.email,
            metadata: user.user_metadata as Record<string, unknown> | null,
          }) ?? undefined,
        userId: user.id,
        unsubscribeToken: row.unsubscribe_token,
      });
    }
  } catch {
    // never let signup email/consent sync break auth
  }
}
