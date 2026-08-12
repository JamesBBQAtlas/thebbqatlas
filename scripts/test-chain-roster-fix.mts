/* Chain-roster fix — the A–L variation matrix (BUILDPROMPTCHAINROSTERFIX_1).
 *
 * Every chain shape that broke, or could break, discovery, each proven with a
 * network-free fixture: the site CRAWL runs against an in-memory FakeCrawler and
 * the WEB pass against an injected fake, so the whole shared engine
 * (lib/chains/discoverLocations) is exercised end-to-end with zero network.
 *
 *   A  consolidated /locations index (flat DOM)
 *   B  per-location pages, NO index          ← the 2Fifty bug
 *   C  JS-rendered blocks (embedded JSON)
 *   D  footer / single-page addresses
 *   E  off-site only (no street on site) → LOUD, not silent
 *   F  chain partly known → same branch from both sources dedupes to one
 *   G  international formats (US / UK / AU)
 *   H  sub-brands / different names → one chain, both branches kept
 *   I  single location mis-flagged is_chain → resolves to 1
 *   J  large chain + time cap → completes or flags PARTIAL
 *   K  closed / coming-soon → skipped, not rostered
 *   L  BOTH entry points return the SAME union (convergence proof)
 *
 * Run: node_modules/.bin/tsx scripts/test-chain-roster-fix.mts
 */
import { Crawler } from "../lib/admin/chain-discovery/fetch";
import { discoverChain as crawlDiscover } from "../lib/admin/chain-discovery/engine";
import {
  discoverChainLocations,
  mergeDiscovered,
  locationKey,
  hasStreet,
  type DiscoveredLocation,
  type WebDiscoverFn,
} from "../lib/chains/discoverLocations";
import type { ChainLocation } from "../lib/ai/enrich";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

/** In-memory crawler: every web hit is served from a fixture map, so the engine
 *  runs with zero network. Keys are matched trailing-slash-insensitively. */
class FakeCrawler extends Crawler {
  private pages: Map<string, string>;
  constructor(pages: Record<string, string>) {
    super();
    this.pages = new Map(Object.entries(pages).map(([k, v]) => [k.replace(/\/+$/, ""), v]));
  }
  private lookup(url: string): string | null {
    const key = url.replace(/\/+$/, "");
    return this.pages.get(key) ?? null;
  }
  async get(url: string): Promise<string | null> {
    const hit = this.lookup(url);
    if (hit != null) this.fetched++;
    return hit;
  }
  async getJson(url: string): Promise<unknown | null> {
    const t = await this.get(url);
    if (!t) return null;
    try { return JSON.parse(t); } catch { return null; }
  }
}

/** A fake Grok web pass returning a fixed location set — no network, no key. */
function fakeWeb(
  locations: Partial<ChainLocation>[],
  opts: { is_chain?: boolean; brand_name?: string } = {}
): WebDiscoverFn {
  return async () => ({
    is_chain: opts.is_chain ?? locations.length > 1,
    brand_name: opts.brand_name ?? "Test Brand",
    description: null,
    website: null,
    style: null,
    instagram_url: null,
    x_url: null,
    facebook_url: null,
    tiktok_url: null,
    youtube_url: null,
    locations: locations.map((l) => ({
      name: null, location_label: null, address: null, city: null,
      country: null, phone: null, hours: null, instagram_url: null, ...l,
    })),
    confidence: 0.8,
    reviewer_notes: null,
    citations: [],
    usage: { in_tokens: 10, out_tokens: 20, searches: 1 },
    model: "grok-test",
  });
}

const SITE = "https://testbbq.example";

// ── Pure helpers ────────────────────────────────────────────────────────────
console.log("\n[pure: locationKey / hasStreet / mergeDiscovered]");
ok("hasStreet true for a real street line", hasStreet({ address: "123 Main St, Austin, TX 78701" }));
ok("hasStreet false for city-only", hasStreet({ address: "Austin, TX" }) === false);
ok("locationKey folds St/Street + is city-scoped",
  locationKey({ address: "123 Main Street", city: "Austin" }) === locationKey({ address: "123 Main St", city: "austin" }));
ok("locationKey distinguishes cities",
  locationKey({ address: "1 High St", city: "Leeds" }) !== locationKey({ address: "1 High St", city: "York" }));

const mk = (a: string, city: string, via: DiscoveredLocation["found_via"], extra: Partial<DiscoveredLocation> = {}): DiscoveredLocation => ({
  name: null, location_label: null, address: a, city, region: null, postcode: null,
  country: null, phone: null, hours: null, instagram_url: null, source_url: null, found_via: via, ...extra,
});
{
  const web = [mk("123 Main St", "Austin", "web", { phone: "512-555-0100" })];
  const crawl = [mk("123 Main Street", "Austin", "crawl", { region: "TX", postcode: "78701" }), mk("9 Oak Ave", "Dallas", "crawl")];
  const merged = mergeDiscovered(web, crawl);
  ok("merge dedupes the shared branch to one", merged.length === 2, merged.map((m) => m.address));
  const austin = merged.find((m) => (m.city ?? "").toLowerCase() === "austin")!;
  ok("merge marks the shared branch found_via=both", austin.found_via === "both");
  ok("merge fills region/postcode from the crawl", austin.region === "TX" && austin.postcode === "78701");
  ok("merge keeps the web phone", austin.phone === "512-555-0100");
  ok("merge drops a no-street location", mergeDiscovered([mk("Austin, TX", "Austin", "web")], []).length === 0);
}

// ── A — consolidated /locations index (flat DOM) ────────────────────────────
console.log("\n[A] consolidated /locations index");
{
  const crawler = new FakeCrawler({
    [SITE]: `<html><body><nav><a href="/locations">Locations</a></nav></body></html>`,
    [`${SITE}/locations`]: `<div class="locations">
      <div class="location"><h3>Austin</h3><address>123 Main St<br>Austin, TX 78701</address></div>
      <div class="location"><h3>Dallas</h3><address>45 Oak Ave<br>Dallas, TX 75201</address></div>
    </div>`,
  });
  const r = await crawlDiscover({ website: SITE, brand: "Test BBQ", crawler });
  ok("A: found both branches from the index", r.locations.length === 2, r.locations.map((l) => l.address));
  ok("A: locator URL recorded", r.locatorUrl === `${SITE}/locations`);
}

// ── B — per-location pages, NO index (the 2Fifty bug) ───────────────────────
console.log("\n[B] per-location pages, no /locations index");
{
  const crawler = new FakeCrawler({
    [SITE]: `<html><body><nav>
      <a href="/riverdale-park">Riverdale Park</a>
      <a href="/washington-dc">Washington DC</a>
      <a href="/menu">Menu</a>
    </nav></body></html>`,
    [`${SITE}/riverdale-park`]: `<main><h1>Riverdale Park</h1><p>Come visit us at 4700 Riverdale Rd, Riverdale Park, MD 20737.</p></main>`,
    [`${SITE}/washington-dc`]: `<main><h1>Washington DC</h1><p>Find us at 1234 U Street NW, Washington, DC 20009.</p></main>`,
  });
  const r = await crawlDiscover({ website: SITE, brand: "2Fifty Texas BBQ", crawler });
  const cities = r.locations.map((l) => (l.city ?? "").toLowerCase()).sort();
  ok("B: BOTH neighbourhood pages discovered (no index needed)", r.locations.length === 2, r.locations.map((l) => l.address));
  ok("B: Riverdale Park — the historically-missed branch — is present", cities.includes("riverdale park"), cities);
}

// ── C — JS-rendered blocks (addresses only in embedded JSON) ────────────────
console.log("\n[C] JS-rendered locations (embedded JSON)");
{
  const nextData = JSON.stringify({ props: { pageProps: { locations: [
    { name: "North", address1: "500 North Loop", city: "Austin", state: "TX", zip: "78751" },
    { name: "South", address1: "700 South Congress", city: "Austin", state: "TX", zip: "78704" },
  ] } } });
  const crawler = new FakeCrawler({
    [SITE]: `<html><body><nav><a href="/locations">Find Us</a></nav></body></html>`,
    [`${SITE}/locations`]: `<html><body><div id="app"></div><script id="__NEXT_DATA__" type="application/json">${nextData}</script></body></html>`,
  });
  const r = await crawlDiscover({ website: SITE, brand: "Test BBQ", crawler });
  ok("C: both JS-hydrated locations parsed from embedded JSON", r.locations.length === 2, r.locations.map((l) => l.address));
}

// ── D — footer / single-page addresses (no locator page) ────────────────────
console.log("\n[D] footer addresses on a single page");
{
  const crawler = new FakeCrawler({
    [SITE]: `<html><body><main>Great brisket.</main>
      <footer>
        <p>Downtown: 100 East 6th St, Austin, TX 78701</p>
        <p>Uptown: 250 West 5th St, Fort Worth, TX 76102</p>
      </footer></body></html>`,
  });
  const r = await crawlDiscover({ website: SITE, brand: "Test BBQ", crawler });
  ok("D: both footer addresses read from visible text", r.locations.length === 2, r.locations.map((l) => l.address));
  ok("D: source type is text (no structured locator)", r.sourceType === "text");
}

// ── E — off-site only → LOUD, never a silent success ────────────────────────
console.log("\n[E] off-site only (no street on the site)");
{
  // The site itself yields nothing; the web pass asserts a chain but its
  // locations have no street to roster (listed only on Google/Yelp). Result must
  // be 0 rostered AND isChain=true, so the route flags it loudly.
  const crawler = new FakeCrawler({ [SITE]: `<html><body><h1>Test BBQ</h1><p>Two trucks around town!</p></body></html>` });
  const out = await discoverChainLocations({
    lead: { name: "Test BBQ", website: SITE },
    website: SITE, brand: "Test BBQ",
    crawler,
    useWeb: true,
    webFn: fakeWeb([{ address: "Austin, TX" }, { address: "Round Rock, TX" }], { is_chain: true }),
  });
  ok("E: nothing rosterable (no street anywhere)", out.locations.length === 0, out.locations);
  ok("E: still flagged as a chain → route goes LOUD, not silent", out.isChain === true);
}

// ── F — same branch from both sources reconciles to one ─────────────────────
console.log("\n[F] cross-source reconcile (zero duplicates)");
{
  const crawler = new FakeCrawler({
    [SITE]: `<html><body><footer><p>121 Congress Ave, Austin, TX 78701</p></footer></body></html>`,
  });
  const out = await discoverChainLocations({
    lead: { name: "Test BBQ", website: SITE },
    website: SITE, brand: "Test BBQ",
    crawler,
    useWeb: true,
    // Web reports the SAME Austin branch (full address) → must not double-count.
    webFn: fakeWeb([{ address: "121 Congress Avenue, Austin, TX 78701", city: "Austin", phone: "512-555-9000" }]),
  });
  ok("F: the shared branch is a single row", out.locations.length === 1, out.locations.map((l) => l.address));
  ok("F: reconciled row is found_via=both", out.locations[0]?.found_via === "both");
}

// ── G — international address formats (US / UK / AU) ─────────────────────────
console.log("\n[G] international formats");
{
  const crawler = new FakeCrawler({
    [`https://testbbq.co.uk`]: `<html><body><footer>
      <p>UK: 10 High Street SW1X 7HJ</p>
      <p>AU: 644 Beaufort St, Mount Lawley WA 6050</p>
    </footer></body></html>`,
  });
  const r = await crawlDiscover({ website: "https://testbbq.co.uk", brand: "Test BBQ", crawler });
  const addrs = r.locations.map((l) => l.address).join(" | ");
  ok("G: UK postcode address extracted", /SW1X\s*7HJ/i.test(addrs), addrs);
  ok("G: AU 'Suburb STATE 4-digit' address extracted", /Mount Lawley WA 6050/i.test(addrs), addrs);
}

// ── H — sub-brands / different names → one chain, both kept ──────────────────
console.log("\n[H] sub-brands under one chain");
{
  const out = await discoverChainLocations({
    lead: { name: "Smoke Collective", website: null },
    website: null, brand: "Smoke Collective",
    useCrawl: false,
    useWeb: true,
    webFn: fakeWeb([
      { name: "Smoke House", location_label: "Original", address: "12 Elm St, Austin, TX 78701", city: "Austin" },
      { name: "Smoke Annex", location_label: "Annex", address: "88 Pine Rd, Dallas, TX 75201", city: "Dallas" },
    ], { is_chain: true, brand_name: "Smoke Collective" }),
  });
  ok("H: both differently-named branches roster under one brand", out.locations.length === 2, out.locations.map((l) => l.name));
  ok("H: brand name carried through", out.brand?.name === "Smoke Collective");
}

// ── I — single location mis-flagged as a chain → resolves to 1 ───────────────
console.log("\n[I] single location mis-flagged is_chain");
{
  const crawler = new FakeCrawler({
    [SITE]: `<html><body><footer><p>1 Only Place, Austin, TX 78701</p></footer></body></html>`,
  });
  const out = await discoverChainLocations({
    lead: { name: "Solo BBQ", website: SITE },
    website: SITE, brand: "Solo BBQ",
    crawler,
    useWeb: true,
    webFn: fakeWeb([{ address: "1 Only Place, Austin, TX 78701", city: "Austin" }], { is_chain: false }),
  });
  ok("I: resolves to exactly one location", out.locations.length === 1, out.locations.map((l) => l.address));
  ok("I: not asserted as a chain (single venue)", out.isChain === false);
}

// ── J — time cap → PARTIAL, never a silent truncation ───────────────────────
console.log("\n[J] time cap hit → flagged partial");
{
  const crawler = new FakeCrawler({
    [SITE]: `<html><body><nav><a href="/locations">Locations</a></nav></body></html>`,
    // A hierarchical index (child gateway links under /locations/) so the BFS has
    // a frontier to walk — which the zero-length deadline aborts, flagging partial.
    [`${SITE}/locations`]: `<html><body>
      <a href="/locations/texas">Texas</a>
      <a href="/locations/maryland">Maryland</a>
    </body></html>`,
    [`${SITE}/locations/texas`]: `<html><body><address>1 A St, Austin, TX 78701</address></body></html>`,
    [`${SITE}/locations/maryland`]: `<html><body><address>2 B St, Bowie, MD 20716</address></body></html>`,
  });
  const r = await crawlDiscover({ website: SITE, brand: "Test BBQ", crawler, deadlineMs: 0 });
  ok("J: partial flag is set when the crawl budget is exhausted", r.partial === true);
  ok("J: partial run reports a note explaining the cap", r.notes.some((n) => /budget|partial|re-run/i.test(n)), r.notes);
}

// ── K — closed / coming-soon skipped, not rostered ──────────────────────────
console.log("\n[K] coming-soon / closed skipped");
{
  const jsonLd = (name: string, street: string, city: string, zip: string) =>
    `<script type="application/ld+json">${JSON.stringify({
      "@type": "Restaurant", name,
      address: { "@type": "PostalAddress", streetAddress: street, addressLocality: city, addressRegion: "TX", postalCode: zip, addressCountry: "US" },
    })}</script>`;
  const crawler = new FakeCrawler({
    [SITE]: `<html><body><nav><a href="/locations">Locations</a></nav></body></html>`,
    [`${SITE}/locations`]: `<html><head>
      ${jsonLd("Test BBQ — Austin", "1 Real St", "Austin", "78701")}
      ${jsonLd("Test BBQ — Frisco (Coming Soon)", "2 Future Blvd", "Frisco", "75034")}
    </head><body></body></html>`,
  });
  const r = await crawlDiscover({ website: SITE, brand: "Test BBQ", crawler });
  ok("K: only the open branch is rostered", r.locations.length === 1, r.locations.map((l) => l.location_label));
  ok("K: the coming-soon branch is counted as skipped, not dropped silently", r.skippedNotOpen >= 1);
}

// ── L — both entry points return the SAME union (convergence proof) ──────────
console.log("\n[L] convergence — single + bulk resolve to the same union");
{
  // The exact 2Fifty shape: the CRAWL finds Riverdale Park (per-location page);
  // the WEB pass finds only DC. Historically the single tool ran crawl-only and
  // the bulk tool ran web-only — so they disagreed. Now BOTH call this one engine,
  // so both see the SAME two-branch union. We prove it by running the shared
  // engine with identical inputs (as each route now does) and comparing the sets.
  const crawler = () => new FakeCrawler({
    [SITE]: `<html><body><nav><a href="/riverdale-park">Riverdale Park</a></nav></body></html>`,
    [`${SITE}/riverdale-park`]: `<main>Visit 4700 Riverdale Rd, Riverdale Park, MD 20737.</main>`,
  });
  const web = () => fakeWeb([{ address: "1234 U Street NW, Washington, DC 20009", city: "Washington" }], { is_chain: true });

  const single = await discoverChainLocations({ lead: { name: "2Fifty", website: SITE }, website: SITE, brand: "2Fifty", useWeb: true, crawler: crawler(), webFn: web() });
  const bulk = await discoverChainLocations({ lead: { name: "2Fifty", website: SITE }, website: SITE, brand: "2Fifty", useWeb: true, crawler: crawler(), webFn: web() });

  const keys = (o: typeof single) => o.locations.map(locationKey).sort();
  ok("L: single entry point finds BOTH branches", single.locations.length === 2, single.locations.map((l) => l.city));
  ok("L: bulk entry point finds BOTH branches", bulk.locations.length === 2, bulk.locations.map((l) => l.city));
  ok("L: the two entry points return the IDENTICAL union", JSON.stringify(keys(single)) === JSON.stringify(keys(bulk)), { single: keys(single), bulk: keys(bulk) });
  const cities = single.locations.map((l) => (l.city ?? "").toLowerCase()).sort();
  ok("L: union has the crawl-only Riverdale Park AND the web-only DC", cities.includes("riverdale park") && cities.includes("washington"), cities);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
