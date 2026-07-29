import type { SupabaseClient, User } from "@supabase/supabase-js";
import { sendWelcome } from "./senders";
import { emailFirstNameFrom } from "@/lib/email/recipient";

/**
 * Run once when a new user first authenticates: record any marketing consent
 * they chose at signup, and send the welcome email EXACTLY ONCE. The welcome is
 * gated by an atomic flag flip (welcome_email_sent false→true), so concurrent
 * callers (auth callback + client post-signup) can't double-send.
 */
export async function syncSignup(db: SupabaseClient, user: User): Promise<void> {
  try {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

    // Record marketing consent from signup metadata, once.
    if (meta.marketing_opt_in !== undefined) {
      const { data: prof } = await db
        .from("profiles")
        .select("marketing_opt_in_at")
        .eq("id", user.id)
        .maybeSingle();
      if (prof && !prof.marketing_opt_in_at) {
        await db
          .from("profiles")
          .update({
            marketing_opt_in: Boolean(meta.marketing_opt_in),
            marketing_opt_in_at: new Date().toISOString(),
            marketing_opt_in_text:
              typeof meta.marketing_opt_in_text === "string"
                ? meta.marketing_opt_in_text
                : null,
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
