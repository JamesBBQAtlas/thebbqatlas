import type { SupabaseClient } from "@supabase/supabase-js";
import { PREMIUM, LISTING } from "@/lib/stripe/config";

/**
 * Admin Revenue summary (Build Prompt 3b). A READ-ONLY roll-up of the money
 * tables for the back office. Two recurring streams + one-off orders:
 *   • Consumer premium  → `subscriptions` (plan='premium')
 *   • Featured listings → entitlement on `restaurants` (is_premium + premium_tier)
 *   • One-off orders    → `orders`
 *
 * MRR is ESTIMATED from the configured list prices × the count of paying
 * subscriptions (active + past_due — i.e. committed, excluding free trials),
 * NOT read back from Stripe invoices. It is a directional figure for the
 * operator, explicitly labelled as such in the UI. All reads go through the
 * caller's db (the admin page passes the service-role client).
 */

/** "$4.99" / "$29" / "£10.50" → integer minor units (cents). 0 if unparseable. */
export function priceToMinorUnits(display: string): number {
  const m = display.replace(/[^0-9.]/g, "");
  if (!m) return 0;
  const n = Number(m);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

const ENTITLED = ["active", "trialing", "past_due"] as const;

export type OrderRow = {
  id: string;
  description: string | null;
  type: string | null;
  amountTotal: number | null;
  currency: string | null;
  status: string | null;
  createdAt: string | null;
};

export type RevenueSummary = {
  stripeLive: boolean;
  premium: {
    active: number;
    trialing: number;
    pastDue: number;
    canceled: number;
    cancelingSoon: number; // entitled now but cancel_at_period_end
    total: number;
  };
  listing: {
    active: number; // restaurants with a live featured entitlement
  };
  priceMinorUnits: { premium: number; listing: number };
  /** Estimated monthly recurring revenue in minor units (cents), from list prices. */
  mrrMinorUnits: number;
  orders: {
    countAll: number;
    count30d: number;
    gross30dMinorUnits: number;
    recent: OrderRow[];
  };
  currency: string;
};

type SubFilter = { eq: [string, unknown] } | { in: [string, string[]] };

async function countSubs(db: SupabaseClient, filters: SubFilter[]): Promise<number> {
  try {
    let q = db.from("subscriptions").select("*", { count: "exact", head: true });
    for (const f of filters) {
      q = "eq" in f ? q.eq(f.eq[0], f.eq[1]) : q.in(f.in[0], f.in[1]);
    }
    const { count } = await q;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function getRevenueSummary(db: SupabaseClient): Promise<RevenueSummary> {
  const premiumPrice = priceToMinorUnits(PREMIUM.price);
  const listingPrice = priceToMinorUnits(LISTING.price);

  const [
    active,
    trialing,
    pastDue,
    canceled,
    cancelingSoon,
    premiumTotal,
    featuredActive,
    ordersAll,
    orders30dRows,
    recentRows,
  ] = await Promise.all([
    countSubs(db, [{ eq: ["plan", "premium"] }, { eq: ["status", "active"] }]),
    countSubs(db, [{ eq: ["plan", "premium"] }, { eq: ["status", "trialing"] }]),
    countSubs(db, [{ eq: ["plan", "premium"] }, { eq: ["status", "past_due"] }]),
    countSubs(db, [{ eq: ["plan", "premium"] }, { eq: ["status", "canceled"] }]),
    countSubs(db, [
      { eq: ["plan", "premium"] },
      { eq: ["cancel_at_period_end", true] },
      { in: ["status", ENTITLED as unknown as string[]] },
    ]),
    countSubs(db, [{ eq: ["plan", "premium"] }]),
    // Featured listing entitlement lives on restaurants (set by the webhook).
    (async () => {
      try {
        const { count } = await db
          .from("restaurants")
          .select("*", { count: "exact", head: true })
          .eq("is_premium", true)
          .eq("premium_tier", LISTING.tier);
        return count ?? 0;
      } catch {
        return 0;
      }
    })(),
    (async () => {
      try {
        const { count } = await db.from("orders").select("*", { count: "exact", head: true });
        return count ?? 0;
      } catch {
        return 0;
      }
    })(),
    (async () => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      try {
        const { data } = await db
          .from("orders")
          .select("amount_total, currency, status, created_at")
          .eq("status", "paid")
          .gte("created_at", since);
        return data ?? [];
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        const { data } = await db
          .from("orders")
          .select("id, description, type, amount_total, currency, status, created_at")
          .order("created_at", { ascending: false })
          .limit(10);
        return data ?? [];
      } catch {
        return [];
      }
    })(),
  ]);

  const gross30d = (orders30dRows as { amount_total: number | null }[]).reduce(
    (sum, o) => sum + (o.amount_total ?? 0),
    0
  );

  // MRR = committed paying subs (active + past_due; a trial pays $0 for now) × list price.
  const payingPremium = active + pastDue;
  const mrr = payingPremium * premiumPrice + featuredActive * listingPrice;

  const recent: OrderRow[] = (recentRows as Record<string, unknown>[]).map((o) => ({
    id: String(o.id),
    description: (o.description as string | null) ?? null,
    type: (o.type as string | null) ?? null,
    amountTotal: (o.amount_total as number | null) ?? null,
    currency: (o.currency as string | null) ?? null,
    status: (o.status as string | null) ?? null,
    createdAt: (o.created_at as string | null) ?? null,
  }));

  const currency =
    recent.find((o) => o.currency)?.currency?.toUpperCase() ?? "USD";

  return {
    stripeLive: Boolean(process.env.STRIPE_SECRET_KEY),
    premium: {
      active,
      trialing,
      pastDue,
      canceled,
      cancelingSoon,
      total: premiumTotal,
    },
    listing: { active: featuredActive },
    priceMinorUnits: { premium: premiumPrice, listing: listingPrice },
    mrrMinorUnits: mrr,
    orders: {
      countAll: ordersAll,
      count30d: (orders30dRows as unknown[]).length,
      gross30dMinorUnits: gross30d,
      recent,
    },
    currency,
  };
}

/** Format integer minor units (cents) as a currency string. */
export function fmtMinorUnits(minor: number, currency = "USD"): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(major);
  } catch {
    return `$${major.toFixed(2)}`;
  }
}
