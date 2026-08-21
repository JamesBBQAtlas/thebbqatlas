import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PremiumStatus = {
  isPremium: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasBillingAccount: boolean;
};

const ACTIVE = new Set(["active", "trialing", "past_due"]);

/**
 * Whether a user currently has premium access. Premium is an entitlement
 * derived from an active subscription — independent of account type, so any
 * consumer/owner/seller who subscribes gets the premium experience.
 */
export async function getPremiumStatus(
  db: SupabaseClient,
  userId: string
): Promise<PremiumStatus> {
  try {
    const { data } = await db
      .from("subscriptions")
      .select("status, current_period_end, cancel_at_period_end, stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();

    // M2 — fail CLOSED on a missing period end. A null current_period_end used to be
    // treated as "not expired" (entitled forever), so a MISSED cancellation webhook could
    // leave a row entitled with no time backstop. Require a present, future period end;
    // an active sub always carries one (the webhook writes it), so this only denies the
    // anomalous null-until row, never a legitimate subscriber.
    const periodEndMs = data?.current_period_end
      ? new Date(data.current_period_end).getTime()
      : null;
    const notExpired = periodEndMs != null && periodEndMs > Date.now();
    const isPremium = !!data && ACTIVE.has(data.status) && notExpired;

    return {
      isPremium,
      status: data?.status ?? null,
      currentPeriodEnd: data?.current_period_end ?? null,
      cancelAtPeriodEnd: data?.cancel_at_period_end ?? false,
      hasBillingAccount: !!data?.stripe_customer_id,
    };
  } catch {
    return {
      isPremium: false,
      status: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      hasBillingAccount: false,
    };
  }
}

/** True when the given status counts as an active entitlement. Exported so the gate
 *  logic is unit-testable in isolation from the DB. */
export function isEntitledStatus(status: string | null | undefined): boolean {
  return Boolean(status && ACTIVE.has(status));
}

/** Server-side premium check (Build Prompt 3 §1). The single source of truth — never
 *  gate on the client. */
export async function isPremium(db: SupabaseClient, userId: string): Promise<boolean> {
  return (await getPremiumStatus(db, userId)).isPremium;
}

/**
 * Route/server-action guard for premium-only server work (Build Prompt 3 §1).
 * Resolves the signed-in user from the request cookies, then reads their
 * entitlement through the SERVICE-ROLE client so the check is robust to the
 * subscriptions RLS policy (the entitlement is never trusted from the client).
 * Returns `{ userId }` when premium, otherwise `null` — callers 401/403 on null.
 */
export async function requirePremium(): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Prefer the service-role client for the entitlement read so a missing or
  // restrictive RLS policy can never silently deny a genuinely-paid user. Fall
  // back to the request-scoped client if the service key isn't configured.
  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  return (await isPremium(db, user.id)) ? { userId: user.id } : null;
}
