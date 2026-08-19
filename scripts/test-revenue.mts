/* Admin Revenue summary (Build Prompt 3b) — MRR math + price parsing over a fake db.
 * Run: node_modules/.bin/tsx scripts/test-revenue.mts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRevenueSummary, priceToMinorUnits, fmtMinorUnits } from "../lib/admin/revenue";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

// In-memory query evaluator: a chainable builder that filters small datasets the
// same way the Supabase client would, so the summary's counts/sums are exercised
// over the REAL getRevenueSummary code path.
type Row = Record<string, unknown>;
function makeDb(data: { subscriptions: Row[]; restaurants: Row[]; orders: Row[] }): SupabaseClient {
  function builder(table: keyof typeof data) {
    let rows = [...data[table]];
    let head = false;
    let limit = Infinity;
    const api: Record<string, unknown> = {
      select(_cols: string, opts?: { head?: boolean }) { head = Boolean(opts?.head); return api; },
      eq(col: string, val: unknown) { rows = rows.filter((r) => r[col] === val); return api; },
      in(col: string, vals: unknown[]) { rows = rows.filter((r) => vals.includes(r[col])); return api; },
      gte(col: string, val: string) { rows = rows.filter((r) => String(r[col]) >= val); return api; },
      order() { return api; },
      limit(n: number) { limit = n; return api; },
      then(resolve: (v: { data: Row[]; count: number | null }) => void) {
        const sliced = rows.slice(0, limit);
        resolve({ data: head ? [] : sliced, count: head ? rows.length : sliced.length });
      },
    };
    return api;
  }
  return { from: (t: keyof typeof data) => builder(t) } as unknown as SupabaseClient;
}

console.log("\n[priceToMinorUnits — display strings → cents]");
{
  ok('"$4.99" → 499', priceToMinorUnits("$4.99") === 499);
  ok('"$29" → 2900', priceToMinorUnits("$29") === 2900);
  ok('"£10.50" → 1050 (currency symbol stripped)', priceToMinorUnits("£10.50") === 1050);
  ok('"" → 0', priceToMinorUnits("") === 0);
  ok('"free" → 0', priceToMinorUnits("free") === 0);
}

console.log("\n[fmtMinorUnits]");
{
  ok("499 USD → $4.99", fmtMinorUnits(499, "USD") === "$4.99");
  ok("2900 USD → $29.00", fmtMinorUnits(2900, "USD") === "$29.00");
  ok("0 → $0.00", fmtMinorUnits(0, "USD") === "$0.00");
}

console.log("\n[getRevenueSummary — counts, MRR math, orders]");
{
  const now = Date.now();
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();
  const db = makeDb({
    subscriptions: [
      { plan: "premium", status: "active", cancel_at_period_end: false },
      { plan: "premium", status: "active", cancel_at_period_end: true },  // active but canceling
      { plan: "premium", status: "trialing", cancel_at_period_end: false },
      { plan: "premium", status: "past_due", cancel_at_period_end: false },
      { plan: "premium", status: "canceled", cancel_at_period_end: false },
      { plan: "other", status: "active", cancel_at_period_end: false },   // must be ignored (not premium)
    ],
    restaurants: [
      { is_premium: true, premium_tier: "featured" },
      { is_premium: true, premium_tier: "featured" },
      { is_premium: false, premium_tier: null },     // not counted
      { is_premium: true, premium_tier: null },       // not featured → not counted
    ],
    orders: [
      { id: "o1", description: "BBQ Mail", type: "mail", amount_total: 1500, currency: "usd", status: "paid", created_at: iso(2) },
      { id: "o2", description: "Old order", type: "mail", amount_total: 999, currency: "usd", status: "paid", created_at: iso(45) }, // >30d
      { id: "o3", description: "Refunded", type: "mail", amount_total: 500, currency: "usd", status: "refunded", created_at: iso(1) }, // not paid
    ],
  });

  const rev = await getRevenueSummary(db);
  ok("premium active = 2", rev.premium.active === 2, rev.premium);
  ok("premium trialing = 1", rev.premium.trialing === 1);
  ok("premium past_due = 1", rev.premium.pastDue === 1);
  ok("premium canceled = 1", rev.premium.canceled === 1);
  ok("cancelingSoon = 1 (entitled + cancel_at_period_end)", rev.premium.cancelingSoon === 1, rev.premium);
  ok("premium total = 5 (only plan='premium')", rev.premium.total === 5, rev.premium);
  ok("featured listings = 2 (is_premium && tier=featured)", rev.listing.active === 2, rev.listing);

  // MRR = paying premium (active + past_due = 3) × premiumPrice + featured (2) × listingPrice
  const expected = 3 * rev.priceMinorUnits.premium + 2 * rev.priceMinorUnits.listing;
  ok("MRR = 3×premium + 2×listing (trialing excluded)", rev.mrrMinorUnits === expected, { got: rev.mrrMinorUnits, expected });

  ok("orders all-time = 3", rev.orders.countAll === 3, rev.orders.countAll);
  ok("orders 30d (paid only) = 1", rev.orders.count30d === 1, rev.orders.count30d);
  ok("gross 30d = 1500", rev.orders.gross30dMinorUnits === 1500, rev.orders.gross30dMinorUnits);
  ok("recent orders capped at 10 and present", rev.orders.recent.length === 3);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
