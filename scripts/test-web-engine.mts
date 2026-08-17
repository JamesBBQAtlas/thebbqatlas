/* Web-Read Engine — adapters, feed→seeds hand-off, orchestrator, loud-empty.
 * Pure + network-free (the browser is stubbed). Olo is tested against a REAL slice of
 * City Barbeque's live NomNom feed captured via Chrome.
 * Run: node_modules/.bin/tsx scripts/test-web-engine.mts
 */
import { parseLocatorFeed, extractOlo, extractYext, extractToast, extractAlgolia, extractGeneric } from "../lib/web-engine/locators";
import { feedBranchesToSeeds } from "../lib/web-engine/feed-to-seeds";
import { discoverViaEngine, readPage, clearReadPageCache } from "../lib/web-engine/read-page";
import type { PageRenderer, ReadPageResult, CapturedResponse } from "../lib/web-engine/types";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

// ── REAL Olo/NomNom feed slice (City Barbeque, captured live). Note Arlington's
// label ≠ its city (Columbus) — the exact label/city trap. ──
const OLO_FEED = {
  restaurants: [
    { id: 253893, name: "Acworth", storename: "City Barbeque", slug: "acworth", streetaddress: "3574 Cobb Pkwy NW", streetaddress2: "", city: "Acworth", state: "GA", zip: "30101", country: "US", latitude: 34.0419922, longitude: -84.6939357, telephone: "(678) 919-8560" },
    { id: 61290, name: "Arlington", storename: "City Barbeque", slug: "arlington", streetaddress: "2111 W Henderson Rd", streetaddress2: "", city: "Columbus", state: "OH", zip: "43220", country: "US", latitude: 40.0570721, longitude: -83.076101, telephone: "(614) 538-8890" },
    { id: 61291, name: "Avon", storename: "City Barbeque", slug: "avon", streetaddress: "9116 Rockville Rd", streetaddress2: "", city: "Indianapolis", state: "IN", zip: "46234", country: "US", latitude: 39.7643656, longitude: -86.3232959, telephone: "(317) 454-8233" },
  ],
};

console.log("\n[Olo/NomNom — the City Barbeque feed maps to clean branches]");
{
  const b = extractOlo(OLO_FEED);
  ok("three branches extracted", b.length === 3, b.length);
  ok("brand_name is the BRAND (storename), not the location", b[0].brand_name === "City Barbeque");
  ok("location_label is the BRANCH label (name), not the city", b[0].location_label === "Acworth");
  ok("Arlington's label and city stay distinct (label≠city)", b[1].location_label === "Arlington" && b[1].city === "Columbus");
  ok("street / region / postcode / coords / phone mapped", b[0].address === "3574 Cobb Pkwy NW" && b[0].region === "GA" && b[0].postcode === "30101" && b[0].lat === 34.0419922 && b[0].phone === "(678) 919-8560");
  ok("external_id carried for idempotency", b[0].external_id === "253893");
}

console.log("\n[parseLocatorFeed — prefers the known platform, LOUD debug]");
{
  const responses: CapturedResponse[] = [
    { url: "https://nomnom-prod-api.citybbq.com/restaurants?nomnom=locations", status: 200, body: OLO_FEED },
    { url: "https://tags.example.com/analytics", status: 200, body: { events: [1, 2] } },
  ];
  const feed = parseLocatorFeed(responses);
  ok("platform detected as olo", feed.platform === "olo", feed.platform);
  ok("brand_name surfaced from the feed", feed.brand_name === "City Barbeque");
  ok("debug is loud: tier network, counts present", feed.debug.tier === "network" && feed.debug.branchCount === 3 && feed.debug.candidatePayloads === 2);
}

console.log("\n[Yext / Toast / Algolia / generic — documented shapes]");
{
  const yext = { response: { entities: [{ id: "e1", profile: { name: "Downtown", address: { line1: "10 Main St", line2: "Ste 2", city: "Austin", region: "TX", postalCode: "78701", countryCode: "US" }, mainPhone: "+15120000000", yextDisplayCoordinate: { latitude: 30.26, longitude: -97.74 } } }] } };
  const y = extractYext(yext);
  ok("Yext entity → branch with nested address + coords", y.length === 1 && y[0].address === "10 Main St Ste 2" && y[0].city === "Austin" && y[0].region === "TX" && y[0].lat === 30.26);

  const toast = { restaurants: [{ guid: "g1", name: "Smoke Co", location: { name: "Riverside", address1: "5 River Rd", city: "Waco", state: "TX", zip: "76701", latitude: 31.5, longitude: -97.1, phone: "254-000-0000" } }] };
  const t = extractToast(toast);
  ok("Toast nested-location → branch", t.length === 1 && t[0].address === "5 River Rd" && t[0].city === "Waco" && t[0].location_label === "Riverside");

  const algolia = { hits: [{ objectID: "a1", name: "Midtown", address1: "7 Oak Ave", city: "Tulsa", state: "OK", postalcode: "74103", _geoloc: { lat: 36.1, lng: -95.9 } }] };
  const a = extractAlgolia(algolia);
  ok("Algolia hit → branch (generic field mapping)", a.length === 1 && a[0].address === "7 Oak Ave" && a[0].city === "Tulsa" && a[0].region === "OK");

  // Generic walker finds a nested array of custom-shaped location objects.
  const custom = { data: { stores: [{ storeName: "North", street: "1 Elm St", locality: "Reno", province: "NV", postal_code: "89501", lat: 39.5, lon: -119.8 }] } };
  const g = extractGeneric(custom);
  ok("generic walker finds a nested custom locator array", g.length === 1 && g[0].address === "1 Elm St" && g[0].city === "Reno" && g[0].region === "NV" && g[0].lng === -119.8);
}

console.log("\n[feedBranchesToSeeds — Part A naming + normStreet dedupe]");
{
  const branches = extractOlo(OLO_FEED);
  const { seeds, deduped, dropped } = feedBranchesToSeeds(branches, "City Barbeque");
  ok("a seed per real branch", seeds.length === 3 && deduped === 0 && dropped === 0);
  ok("a distinct branch label is kept; a redundant label==city (Acworth) is dropped", seeds[1].name === "Arlington" && seeds[0].name === null);
  ok("the city stays the city (Arlington→Columbus)", seeds[1].city === "Columbus" && seeds[1].name === "Arlington");

  // A label that equals its city is dropped (no name==city venue).
  const cityLabel = feedBranchesToSeeds([{ location_label: "Waco", address: "1 A St", city: "Waco" }], "Smoke Co");
  ok("a label equal to the city is dropped (Part A tripwire)", cityLabel.seeds[0].name === null);

  // A label equal to the brand is dropped too.
  const brandLabel = feedBranchesToSeeds([{ location_label: "Smoke Co", address: "2 B St", city: "Dallas" }], "Smoke Co");
  ok("a label equal to the brand is dropped", brandLabel.seeds[0].name === null);

  // Two branches at the same physical street collapse (normStreet key).
  const dup = feedBranchesToSeeds([
    { location_label: "A", address: "3574 Cobb Pkwy NW", city: "Acworth" },
    { location_label: "B", address: "3574 Cobb Parkway Northwest", city: "Acworth" },
  ], "City Barbeque");
  ok("same physical street collapses to one seed", dup.seeds.length === 1 && dup.deduped === 1);

  // A branch with neither street nor city is dropped, not seeded.
  const empty = feedBranchesToSeeds([{ location_label: "Ghost" }], "X");
  ok("a branch with no street and no city is dropped", empty.seeds.length === 0 && empty.dropped === 1);
}

// A stub renderer that returns canned network responses — the browser seam.
const rendererWith = (responses: CapturedResponse[], nodes = 1200): PageRenderer =>
  async () => ({
    finalUrl: "https://x/locations",
    networkResponses: responses,
    dom: "<html><body>rendered</body></html>",
    text: "rendered",
    debug: { renderedNodes: nodes, capturedPayloads: responses.length, tier: responses.length ? "network" : "dom", browserMs: 900 },
  });

console.log("\n[discoverViaEngine — render→intercept→seeds, loud debug]");
{
  clearReadPageCache();
  const good = await discoverViaEngine({
    url: "https://www.citybbq.com/locations", brand: "City Barbeque",
    renderer: rendererWith([{ url: "https://nomnom-prod-api.citybbq.com/restaurants", status: 200, body: OLO_FEED }]),
  });
  ok("engine yields seeds from the intercepted feed", good.seeds.length === 3 && good.platform === "olo" && good.debug.tier === "network");
  ok("engine surfaces the feed's brand name", good.brandName === "City Barbeque");

  clearReadPageCache();
  // No structured feed, but the page rendered → fall back to DOM (loud).
  const domOnly = await discoverViaEngine({ url: "https://x/locations", brand: "X", renderer: rendererWith([]) });
  ok("no feed but rendered DOM → tier dom, DOM returned for fallback parsing", domOnly.debug.tier === "dom" && Boolean(domOnly.dom));

  clearReadPageCache();
  // Nothing usable at all → LOUD zero with a hand-seed reason, never silent.
  const emptyRenderer: PageRenderer = async () => ({ finalUrl: "https://x", networkResponses: [], dom: null, text: null, debug: { renderedNodes: 3, capturedPayloads: 0, tier: null } });
  const dead = await discoverViaEngine({ url: "https://x", brand: "X", renderer: emptyRenderer });
  ok("truly unreadable → tier none + hand-seed reason (loud, not silent)", dead.debug.tier === "none" && /hand-seed/.test(dead.debug.reason ?? ""), dead.debug);
}

console.log("\n[readPage — retry once, then loud empty; never throws]");
{
  clearReadPageCache();
  let n = 0;
  const throwThenOk: PageRenderer = async (req) => { n++; if (n === 1) throw new Error("transient"); return { finalUrl: req.url, networkResponses: [], dom: "ok", text: null, debug: { capturedPayloads: 0, tier: "dom" } }; };
  const r1 = await readPage({ url: "https://x/1", capture: { dom: true } }, throwThenOk);
  ok("a transient render failure is retried then succeeds", r1.dom === "ok" && n === 2);

  clearReadPageCache();
  const alwaysThrow: PageRenderer = async () => { throw new Error("down"); };
  const r2 = await readPage({ url: "https://x/2" }, alwaysThrow);
  ok("a persistent failure returns a LOUD structured empty, never throws", r2.networkResponses.length === 0 && /render failed twice/.test(r2.debug.error ?? ""), r2.debug);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
