/* Premium entitlement gate (Build Prompt 3a) — the single server-side source of
 * truth for "is this user premium". Pure logic over a fake db; no network.
 * Run: node_modules/.bin/tsx scripts/test-entitlements.mts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPremiumStatus, isPremium, isEntitledStatus } from "../lib/account/entitlements";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

// Minimal stand-in for the one query getPremiumStatus makes:
//   db.from("subscriptions").select(...).eq("user_id", id).maybeSingle()
// `row` is whatever that subscription row would be (null = no billing account).
function fakeDb(row: Record<string, unknown> | null): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

const FUTURE = new Date(Date.now() + 30 * 864e5).toISOString(); // +30d
const PAST = new Date(Date.now() - 30 * 864e5).toISOString();   // -30d

console.log("\n[isEntitledStatus — which raw statuses count as paid access]");
{
  ok("active is entitled", isEntitledStatus("active"));
  ok("trialing is entitled (paid experience during trial)", isEntitledStatus("trialing"));
  ok("past_due is entitled (grace — access kept while Stripe retries)", isEntitledStatus("past_due"));
  ok("canceled is NOT entitled", !isEntitledStatus("canceled"));
  ok("unpaid is NOT entitled", !isEntitledStatus("unpaid"));
  ok("incomplete is NOT entitled", !isEntitledStatus("incomplete"));
  ok("incomplete_expired is NOT entitled", !isEntitledStatus("incomplete_expired"));
  ok("null / undefined / empty are NOT entitled", !isEntitledStatus(null) && !isEntitledStatus(undefined) && !isEntitledStatus(""));
}

console.log("\n[getPremiumStatus — status × period-end, over the real code path]");
{
  const active = await getPremiumStatus(fakeDb({ status: "active", current_period_end: FUTURE, cancel_at_period_end: false, stripe_customer_id: "cus_1" }), "u");
  ok("active + future period → premium", active.isPremium === true, active);
  ok("active surfaces status + hasBillingAccount", active.status === "active" && active.hasBillingAccount === true);

  const trialing = await getPremiumStatus(fakeDb({ status: "trialing", current_period_end: FUTURE, cancel_at_period_end: false, stripe_customer_id: "cus_2" }), "u");
  ok("trialing + future → premium", trialing.isPremium === true);

  const pastDue = await getPremiumStatus(fakeDb({ status: "past_due", current_period_end: FUTURE, cancel_at_period_end: false, stripe_customer_id: "cus_3" }), "u");
  ok("past_due + future → premium (grace)", pastDue.isPremium === true);

  const canceled = await getPremiumStatus(fakeDb({ status: "canceled", current_period_end: FUTURE, cancel_at_period_end: true, stripe_customer_id: "cus_4" }), "u");
  ok("canceled → NOT premium (even if period not yet ended)", canceled.isPremium === false, canceled);
  ok("canceled still reports cancel_at_period_end + billing account", canceled.cancelAtPeriodEnd === true && canceled.hasBillingAccount === true);

  const expired = await getPremiumStatus(fakeDb({ status: "active", current_period_end: PAST, cancel_at_period_end: false, stripe_customer_id: "cus_5" }), "u");
  ok("active but period EXPIRED → NOT premium (belt-and-braces vs a stale webhook)", expired.isPremium === false, expired);

  const none = await getPremiumStatus(fakeDb(null), "u");
  ok("no subscription row → NOT premium, no billing account", none.isPremium === false && none.hasBillingAccount === false);
  ok("no row → status null", none.status === null);

  const noEnd = await getPremiumStatus(fakeDb({ status: "active", current_period_end: null, cancel_at_period_end: false, stripe_customer_id: "cus_6" }), "u");
  // M2 — fail CLOSED on a null period end: an active row with no end date is NOT entitled
  // (a missed cancellation webhook must not leave it entitled forever with no backstop).
  ok("active with no period_end → NOT premium (M2 failsafe)", noEnd.isPremium === false);
}

console.log("\n[isPremium — boolean convenience wrapper agrees with getPremiumStatus]");
{
  ok("isPremium true for active+future", (await isPremium(fakeDb({ status: "active", current_period_end: FUTURE, cancel_at_period_end: false, stripe_customer_id: "c" }), "u")) === true);
  ok("isPremium false for canceled", (await isPremium(fakeDb({ status: "canceled", current_period_end: FUTURE, cancel_at_period_end: true, stripe_customer_id: "c" }), "u")) === false);
  ok("isPremium false when the read throws (fail-closed)", (await isPremium({ from: () => { throw new Error("boom"); } } as unknown as SupabaseClient, "u")) === false);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
