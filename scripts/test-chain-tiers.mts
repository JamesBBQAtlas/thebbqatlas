/* Patch 0068 — chain discovery TIER ORDERING (the spine). Pure guard: a model's
 * web-research branch list never pre-empts or outranks a real tier, and is always gated.
 * Order: own feed → render engine → provider → web hint (last resort, gated).
 * Run: node_modules/.bin/tsx scripts/test-chain-tiers.mts
 */
import {
  selectChainSeeds,
  toSeed,
  crawlOwnFeed,
  webOnly,
  WEB_HINT_GATE_REASON,
} from "../lib/admin/chain-tiers";
import type { SeedLocation } from "../lib/admin/chain-seed";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

const seed = (label: string, extra: Partial<SeedLocation> = {}): SeedLocation => ({
  name: label, address: `${label} Rd`, city: label, ...extra,
});
const providerSeed = (label: string): SeedLocation => seed(label, { provider_refs: [`osm:node/${label}`], lat: 1, lng: 2 });
const n = (arr: SeedLocation[]) => arr.length;

console.log("\n[crawlOwnFeed / webOnly — split by found_via]");
{
  const locs = [
    { name: "A", found_via: "crawl" as const },
    { name: "B", found_via: "web" as const },
    { name: "C", found_via: "both" as const },
  ];
  ok("own feed = crawl + both (not web)", crawlOwnFeed(locs).length === 2 && !crawlOwnFeed(locs).some((l) => l.name === "B"));
  ok("webOnly = only found_via 'web'", webOnly(locs).length === 1 && webOnly(locs)[0].name === "B");
  ok("toSeed: branch label becomes the seed name (Part A)", toSeed({ location_label: "Acworth", name: "City Barbeque", city: "Acworth" }).name === "Acworth");
}

console.log("\n[THE SPINE — a handful of Grok snippets never beats real records]");
{
  // Crawl blocked (empty), provider tier returned 76 real records, Grok found 3.
  const r = selectChainSeeds({
    crawlSeeds: [],
    webSeeds: [seed("g1"), seed("g2"), seed("g3")],
    engineSeeds: [],
    providerSeeds: Array.from({ length: 76 }, (_, i) => providerSeed(`p${i}`)),
    forceProviders: false,
  });
  ok("provider tier wins — 76 records rostered", r.tier === "provider" && n(r.seeds) === 76, { tier: r.tier, n: n(r.seeds) });
  ok("the 3 Grok snippets are DEMOTED, not merged", !r.seeds.some((s) => (s.name ?? "").startsWith("g")) && r.demotedWeb === 3);
  ok("provider seeds keep their provider_refs (gated downstream)", r.seeds.every((s) => (s.provider_refs ?? []).length > 0));
}

console.log("\n[render engine outranks Grok too]");
{
  const r = selectChainSeeds({ crawlSeeds: [], webSeeds: [seed("g1"), seed("g2")], engineSeeds: [seed("e1"), seed("e2"), seed("e3")], providerSeeds: [], forceProviders: false });
  ok("engine wins over web, web demoted", r.tier === "engine" && n(r.seeds) === 3 && r.demotedWeb === 2 && !r.seeds.some((s) => (s.name ?? "").startsWith("g")));
}

console.log("\n[force providers — the 'Roster from providers' button]");
{
  const forced = selectChainSeeds({ crawlSeeds: [seed("c1")], webSeeds: [seed("g1")], engineSeeds: [], providerSeeds: [providerSeed("p1"), providerSeed("p2")], forceProviders: true });
  ok("forced → provider records only (crawl + web ignored)", forced.tier === "provider" && n(forced.seeds) === 2);
  const forcedEmpty = selectChainSeeds({ crawlSeeds: [seed("c1")], webSeeds: [], engineSeeds: [], providerSeeds: [], forceProviders: true });
  ok("forced but providers empty → tier none (never silently falls back to Grok)", forcedEmpty.tier === "none" && n(forcedEmpty.seeds) === 0);
}

console.log("\n[own feed — crawl wins, but a web-only branch it missed is KEPT, gated (2Fifty)]");
{
  const r = selectChainSeeds({ crawlSeeds: [seed("c1"), seed("c2")], webSeeds: [seed("w1")], engineSeeds: [], providerSeeds: [], forceProviders: false });
  ok("own_feed = crawl seeds + the web supplement", r.tier === "own_feed" && n(r.seeds) === 3);
  ok("crawl seeds are UNGATED (own site)", r.seeds.filter((s) => s.name === "c1" || s.name === "c2").every((s) => !s.gate_reason));
  ok("the web supplement is GATED (verify)", r.seeds.find((s) => s.name === "w1")?.gate_reason === WEB_HINT_GATE_REASON);
}

console.log("\n[last resort — nothing but Grok → gated + loud web_fallback]");
{
  const r = selectChainSeeds({ crawlSeeds: [], webSeeds: [seed("w1"), seed("w2")], engineSeeds: [], providerSeeds: [], forceProviders: false });
  ok("tier 'web', webFallback true", r.tier === "web" && r.webFallback === true);
  ok("every web-only seed is gated", r.seeds.every((s) => s.gate_reason === WEB_HINT_GATE_REASON));
  const empty = selectChainSeeds({ crawlSeeds: [], webSeeds: [], engineSeeds: [], providerSeeds: [], forceProviders: false });
  ok("truly nothing → tier none", empty.tier === "none" && n(empty.seeds) === 0 && !empty.webFallback);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
