/* Pricing realignment (Aug 19) — the Pro page-control tier vs the separate Featured
 * prominence window. Verifies hero/links gate on PRO, not Featured, and vice-versa.
 * Run: node_modules/.bin/tsx scripts/test-listing-tier.mts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getListingStatus, hasPageControl } from "../lib/account/listing";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

const FUTURE = new Date(Date.now() + 30 * 864e5).toISOString();
const PAST = new Date(Date.now() - 864e5).toISOString();

// Fake db returning one restaurants row for getListingStatus.
function db(row: Record<string, unknown>): SupabaseClient {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
  return { from: () => chain } as unknown as SupabaseClient;
}
const OWNER = "u1";

console.log("\n[hasPageControl — pure: Pro tier active gates hero + links]");
{
  ok("pro + no end → control", hasPageControl({ listing_tier: "pro", listing_until: null }));
  ok("pro + future end → control", hasPageControl({ listing_tier: "pro", listing_until: FUTURE }));
  ok("pro + past end → NO control (lapsed)", !hasPageControl({ listing_tier: "pro", listing_until: PAST }));
  ok("lower tier → NO control (dormant, unlocks nothing yet)", !hasPageControl({ listing_tier: "lower", listing_until: FUTURE }));
  ok("no tier → NO control", !hasPageControl({ listing_tier: null, listing_until: null }));
}

console.log("\n[getListingStatus — Pro control and Featured prominence are INDEPENDENT]");
{
  const proOnly = await getListingStatus(db({ owner_id: OWNER, listing_tier: "pro", listing_until: FUTURE, is_premium: false, premium_until: null }), OWNER, "r");
  ok("Pro only → hasControl true, isFeatured false", proOnly.hasControl === true && proOnly.isFeatured === false, proOnly);

  const featOnly = await getListingStatus(db({ owner_id: OWNER, listing_tier: null, listing_until: null, is_premium: true, premium_until: FUTURE }), OWNER, "r");
  ok("Featured only → isFeatured true, hasControl false (links/hero stay locked)", featOnly.isFeatured === true && featOnly.hasControl === false, featOnly);

  const both = await getListingStatus(db({ owner_id: OWNER, listing_tier: "pro", listing_until: FUTURE, is_premium: true, premium_until: FUTURE }), OWNER, "r");
  ok("Both → both true", both.hasControl === true && both.isFeatured === true);

  const neither = await getListingStatus(db({ owner_id: OWNER, listing_tier: null, listing_until: null, is_premium: false, premium_until: null }), OWNER, "r");
  ok("Neither → both false", neither.hasControl === false && neither.isFeatured === false);

  const lapsedFeatured = await getListingStatus(db({ owner_id: OWNER, listing_tier: "pro", listing_until: FUTURE, is_premium: true, premium_until: PAST }), OWNER, "r");
  ok("Featured window expired → isFeatured false, Pro still true", lapsedFeatured.isFeatured === false && lapsedFeatured.hasControl === true, lapsedFeatured);

  ok("ownership surfaced from owner_id", both.owns === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
