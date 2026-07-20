import type { SupabaseClient } from "@supabase/supabase-js";

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

    const notExpired =
      !data?.current_period_end ||
      new Date(data.current_period_end).getTime() > Date.now();
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
