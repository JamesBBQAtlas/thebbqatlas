/* Chain-branch SEO title differentiation (Build note) — pure title/H1 rules.
 * Run: node_modules/.bin/tsx scripts/test-venue-title.mts
 */
import { venueDisplayTitle, venueH1, isChainBranch, venueLocality } from "../lib/seo/venue-title";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

const acworth = { name: "City Barbeque", city: "Acworth", region: "GA", country: "United States", chain_parent_id: "flagship-1" };
const dublin = { name: "City Barbeque", city: "Dublin", region: "OH", country: "United States", chain_parent_id: "flagship-1" };
const single = { name: "Franklin Barbecue", city: "Austin", region: "TX", country: "United States", chain_parent_id: null };

console.log("\n[venueDisplayTitle — chain branches get city+region, singles unchanged]");
{
  ok("branch title → 'Brand — City, Region'", venueDisplayTitle(acworth) === "City Barbeque — Acworth, GA");
  ok("a DIFFERENT branch is distinct", venueDisplayTitle(dublin) === "City Barbeque — Dublin, OH");
  ok("two branches of one chain have DIFFERENT titles", venueDisplayTitle(acworth) !== venueDisplayTitle(dublin));
  ok("single-location venue is UNCHANGED (already unique)", venueDisplayTitle(single) === "Franklin Barbecue");
}

console.log("\n[venueH1 — city only (no region)]");
{
  ok("branch H1 → 'Brand — City'", venueH1(acworth) === "City Barbeque — Acworth");
  ok("single-location H1 unchanged", venueH1(single) === "Franklin Barbecue");
  ok("two branches have distinct H1s", venueH1(acworth) !== venueH1(dublin));
}

console.log("\n[edge cases]");
{
  ok("isChainBranch true only with a parent", isChainBranch(acworth) && !isChainBranch(single));
  ok("no city → falls back to the bare name (never 'Brand — ')", venueDisplayTitle({ name: "X BBQ", city: null, region: null, chain_parent_id: "p" }) === "X BBQ");
  ok("region == city is not doubled", venueLocality({ name: "Y", city: "Singapore", region: "Singapore", chain_parent_id: "p" }, { withRegion: true }) === "Singapore");
  ok("no region → city only in the title", venueDisplayTitle({ name: "Z BBQ", city: "Leeds", region: null, chain_parent_id: "p" }) === "Z BBQ — Leeds");
  // A future-rostered chain: any row with a chain_parent_id gets the treatment — proves
  // it's a render-time rule, not a per-chain data edit.
  ok("a brand-new chain's branch is differentiated with zero extra work", venueDisplayTitle({ name: "New Chain BBQ", city: "Tulsa", region: "OK", chain_parent_id: "future-flagship" }) === "New Chain BBQ — Tulsa, OK");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
