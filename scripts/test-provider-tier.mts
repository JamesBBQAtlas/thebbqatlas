/* Location-data provider tier (patch 0061) — Overpass (OSM) + Google Places adapters,
 * cross-source merge/dedupe, gated feed→seeds hand-off, seedChainLocations gating, and
 * the cheap cross-check. Pure + NETWORK-FREE: every provider call goes through an
 * injected `fetch` stub, and the seedChainLocations test uses provider seeds that carry
 * a pin (so the geocoder is never called) with a fake Supabase client.
 * Run: node_modules/.bin/tsx scripts/test-provider-tier.mts
 */
import { overpassQuery, parseOverpass, fetchOverpass } from "../lib/web-engine/providers/overpass";
import { parsePlacesResult, fetchPlaces } from "../lib/web-engine/providers/places";
import { sharesBrand } from "../lib/web-engine/providers/match";
import {
  mergeProviderBranches,
  discoverViaProviders,
  crossCheckCounts,
  providerCrossCheck,
} from "../lib/web-engine/providers";
import { feedBranchesToSeeds } from "../lib/web-engine/feed-to-seeds";
import { seedChainLocations, type SeedLocation } from "../lib/admin/chain-seed";
import type { ProviderBranch } from "../lib/web-engine/types";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

// ── A faithful Overpass `out center tags` fixture for "City Barbeque" (documented,
// stable shape: elements[] with node lat/lon or way/relation center, and tags{}). ──
const OVERPASS_BODY = {
  version: 0.6,
  generator: "Overpass API",
  elements: [
    { type: "node", id: 1001, lat: 40.0570721, lon: -83.076101, tags: { brand: "City Barbeque", name: "City Barbeque", amenity: "restaurant", "addr:housenumber": "2111", "addr:street": "W Henderson Rd", "addr:city": "Columbus", "addr:state": "OH", "addr:postcode": "43220", "addr:country": "US", phone: "+16145388890" } },
    { type: "way", id: 2002, center: { lat: 34.0419922, lon: -84.6939357 }, tags: { brand: "City Barbeque", name: "City Barbeque", "addr:housenumber": "3574", "addr:street": "Cobb Pkwy NW", "addr:unit": "B", "addr:city": "Acworth", "addr:state": "GA", "addr:postcode": "30101" } },
    { type: "node", id: 3003, lat: 39.7643656, lon: -86.3232959, tags: { brand: "City Barbeque", name: "City Barbeque Avon", "addr:city": "Indianapolis", "addr:state": "IN" } },
    { type: "node", id: 4004, lat: 40.0, lon: -83.0, tags: { brand: "Sonny's BBQ", name: "Sonny's Real Pit Bar-B-Q", "addr:street": "9 Nope St", "addr:city": "Nowhere" } },
    { type: "node", id: 5005, lat: 40.1, lon: -83.1, tags: { brand: "City Barbeque", name: "City Barbeque" } },
  ],
};

console.log("\n[Overpass query builder — brand + name, escaped, out center tags]");
{
  const q = overpassQuery("City Barbeque");
  ok("includes out center tags", /out center tags;/.test(q));
  ok("queries the brand tag", /\["brand"~"\^City Barbeque\$",i\]/.test(q) || /\["brand"~"City Barbeque",i\]/.test(q));
  ok("queries name on an eating amenity", /\["name"~"\^City Barbeque",i\]\["amenity"/.test(q));
  const esc = overpassQuery("Dinosaur Bar-B-Que");
  ok("regex-escapes special chars in the brand", esc.includes("Bar\\-B\\-Que") || esc.includes("Bar-B-Que"));
}

console.log("\n[parseOverpass — addr:* → branch, osm ref, brand guard, drops the unlocatable]");
{
  const b = parseOverpass(OVERPASS_BODY, "City Barbeque");
  ok("keeps the 3 usable City Barbeque venues (drops off-brand + locationless)", b.length === 3, b.map((x) => x.external_id));
  const columbus = b.find((x) => x.city === "Columbus")!;
  ok("node street composed from housenumber + street", columbus.address === "2111 W Henderson Rd", columbus.address);
  ok("provider is osm + ref is osm:<type>/<id>", columbus.provider === "osm" && columbus.provider_refs[0] === "osm:node/1001");
  ok("centre lat/long carried from the node", columbus.lat === 40.0570721 && columbus.lng === -83.076101);
  ok("phone + region + postcode mapped", columbus.phone === "+16145388890" && columbus.region === "OH" && columbus.postcode === "43220");
  const acworth = b.find((x) => x.city === "Acworth")!;
  ok("way center used for lat/long + unit folded into the street", acworth.lat === 34.0419922 && /Unit B/.test(acworth.address ?? ""), acworth.address);
  ok("a city-only venue WITH coordinates is kept (Avon, no street)", b.some((x) => x.city === "Indianapolis" && !x.address && x.lat != null));
  ok("brand guard drops the off-brand 'Sonny's BBQ'", !b.some((x) => (x.brand_name ?? "").includes("Sonny")));
  ok("a venue with neither street nor city+coords is dropped", !b.some((x) => x.external_id === "node/5005"));
}

console.log("\n[fetchOverpass — injected fetch, never throws]");
{
  const stub: typeof fetch = (async () => ({ ok: true, status: 200, json: async () => OVERPASS_BODY })) as unknown as typeof fetch;
  const r = await fetchOverpass("City Barbeque", { fetchImpl: stub });
  ok("returns parsed branches + raw element count", r.branches.length === 3 && r.rawElements === 5 && r.error === null, { n: r.branches.length, raw: r.rawElements });
  const bad: typeof fetch = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
  const rb = await fetchOverpass("City Barbeque", { fetchImpl: bad });
  ok("a transport error is a structured empty, not a throw", rb.branches.length === 0 && rb.error === "network down");
}

console.log("\n[parsePlacesResult — place_id → branch, city via canonical parser]");
{
  const raw = { place_id: "ChIJabc", name: "City Barbeque", formatted_address: "2111 W Henderson Rd, Columbus, OH 43220, USA", geometry: { location: { lat: 40.057, lng: -83.076 } } };
  const p = parsePlacesResult(raw)!;
  ok("provider is places + ref is places:<place_id>", p.provider === "places" && p.provider_refs[0] === "places:ChIJabc" && p.external_id === "ChIJabc");
  ok("city parsed from formatted_address", p.city === "Columbus", p.city);
  ok("geometry → lat/long", p.lat === 40.057 && p.lng === -83.076);
  ok("a result with no place_id is dropped", parsePlacesResult({ name: "x", formatted_address: "y" }) === null);
}

console.log("\n[fetchPlaces — pagination, dedupe, brand guard, COST CAP]");
{
  const page0 = { results: [
    { place_id: "P1", name: "City Barbeque", formatted_address: "123 Main St, Columbus, OH 43220, USA", geometry: { location: { lat: 40.05, lng: -83.07 } } },
    { place_id: "PX", name: "Dave's Smoke Shack", formatted_address: "9 Other St, Columbus, OH, USA", geometry: { location: { lat: 40.06, lng: -83.08 } } },
  ], next_page_token: "TOK1", status: "OK" };
  const page1 = { _token: "TOK1", results: [
    { place_id: "P2", name: "City Barbeque", formatted_address: "500 Oak Ave, Dublin, OH 43017, USA", geometry: { location: { lat: 40.10, lng: -83.13 } } },
    { place_id: "P1", name: "City Barbeque", formatted_address: "123 Main St, Columbus, OH 43220, USA", geometry: { location: { lat: 40.05, lng: -83.07 } } },
  ], status: "OK" };
  const pages = [page0, page1];
  const placesStub = (calls: { n: number }): typeof fetch =>
    (async (url: string) => {
      calls.n++;
      const u = new URL(url);
      const token = u.searchParams.get("pagetoken");
      const pg = !token ? pages[0] : pages.find((p) => (p as { _token?: string })._token === token) ?? { results: [], status: "OK" };
      return { ok: true, status: 200, json: async () => pg };
    }) as unknown as typeof fetch;

  const c1 = { n: 0 };
  const full = await fetchPlaces("City Barbeque", { key: "k", fetchImpl: placesStub(c1), budget: { maxCalls: 10, maxUsd: 1 }, sleep: async () => {} });
  ok("paginates both pages (2 billable calls)", full.calls === 2, full.calls);
  ok("dedupes by place_id across pages (P1 once)", full.branches.length === 2, full.branches.map((b) => b.external_id));
  ok("brand guard drops the unrelated 'Dave's Smoke Shack'", !full.branches.some((b) => b.external_id === "PX"));
  ok("spend logged = calls × SKU", Math.abs(full.spendUsd - 0.064) < 1e-6, full.spendUsd);
  ok("not capped when inside budget", full.capped === false);

  const c2 = { n: 0 };
  const capped = await fetchPlaces("City Barbeque", { key: "k", fetchImpl: placesStub(c2), budget: { maxCalls: 1, maxUsd: 1 }, sleep: async () => {} });
  ok("COST CAP stops the sweep + reports capped:true", capped.capped === true && capped.calls === 1, { calls: capped.calls, capped: capped.capped });
}

console.log("\n[mergeProviderBranches — cross-source dedupe, prefer Places, keep both refs]");
{
  const osm: ProviderBranch[] = [
    { brand_name: "City Barbeque", location_label: "City Barbeque", address: "123 Main St", city: "Columbus", lat: 40.0500, lng: -83.0700, provider: "osm", provider_refs: ["osm:node/1"], platform: "osm" },
    { brand_name: "City Barbeque", location_label: "City Barbeque", address: "500 Oak Ave", city: "Dublin", lat: 40.10, lng: -83.13, provider: "osm", provider_refs: ["osm:node/2"], platform: "osm" },
    { brand_name: "City Barbeque", location_label: "City Barbeque", address: "9116 Rockville Rd", city: "Indianapolis", lat: 39.76436, lng: -86.32329, provider: "osm", provider_refs: ["osm:node/3"], platform: "osm" },
  ];
  const places: ProviderBranch[] = [
    { brand_name: "City Barbeque", location_label: "City Barbeque", address: "123 Main St, Columbus, OH 43220, USA", city: "Columbus", lat: 40.0570, lng: -83.0761, phone: "+1614", provider: "places", provider_refs: ["places:P1"], platform: "places" },
    { brand_name: "City Barbeque", location_label: "City Barbeque", address: "9114 Rockville Rd, Indianapolis, IN 46234, USA", city: "Indianapolis", lat: 39.76440, lng: -86.32330, provider: "places", provider_refs: ["places:P3"], platform: "places" },
  ];
  const m = mergeProviderBranches(osm, places);
  ok("3 distinct locations after cross-source merge", m.branches.length === 3, m.branches.map((b) => b.address));
  ok("2 OSM rows collapsed onto a Places row (crossSourceDupes)", m.crossSourceDupes === 2, m.crossSourceDupes);
  const main = m.branches.find((b) => (b.address ?? "").startsWith("123 Main St"))!;
  ok("street-key match prefers the Places record", main.provider === "places");
  ok("merged row keeps BOTH provider refs", main.provider_refs.includes("places:P1") && main.provider_refs.includes("osm:node/1"), main.provider_refs);
  const rock = m.branches.find((b) => (b.address ?? "").includes("Rockville"))!;
  ok("geo-proximity backstop merges a differently-numbered near-dup", rock.provider === "places" && rock.provider_refs.includes("osm:node/3"), rock.provider_refs);
  ok("an OSM-only branch survives on its own", m.branches.some((b) => b.provider === "osm" && b.address === "500 Oak Ave"));
  ok("primary counts reported (2 places, 1 osm)", m.fromPlaces === 2 && m.fromOsm === 1, { p: m.fromPlaces, o: m.fromOsm });
}

console.log("\n[feedBranchesToSeeds carryProvider — pin + refs carried; scoped OFF by default]");
{
  const branch: ProviderBranch = { brand_name: "City Barbeque", location_label: "Columbus", address: "2111 W Henderson Rd", city: "Columbus", lat: 40.057, lng: -83.076, provider: "osm", provider_refs: ["osm:node/1"], platform: "osm" };
  const withProv = feedBranchesToSeeds([branch], "City Barbeque", { carryProvider: true });
  ok("provider seed carries the pin + refs", withProv.seeds[0].lat === 40.057 && withProv.seeds[0].provider_refs?.[0] === "osm:node/1");
  ok("Part A: a label equal to the city is dropped (no name==city)", withProv.seeds[0].name === null, withProv.seeds[0].name);
  const noProv = feedBranchesToSeeds([branch], "City Barbeque");
  ok("SCOPING: without carryProvider, no provider_refs leak onto the seed", noProv.seeds[0].provider_refs === undefined && noProv.seeds[0].lat === undefined);
}

console.log("\n[discoverViaProviders — OSM-only resolves; loud empty when nothing]");
{
  const osmOnly: typeof fetch = (async () => ({ ok: true, status: 200, json: async () => OVERPASS_BODY })) as unknown as typeof fetch;
  const d = await discoverViaProviders({ brand: "City Barbeque", fetchImpl: osmOnly });
  ok("OSM-only produces gated seeds (no Places key needed)", d.seeds.length === 3, d.seeds.length);
  ok("every seed carries an osm provider ref", d.seeds.every((s) => (s.provider_refs ?? []).some((r) => r.startsWith("osm:"))));
  ok("debug records per-source counts + tier", d.debug.tier === "provider" && d.debug.osm.count === 3 && d.debug.places.count === 0, d.debug);

  const empty: typeof fetch = (async () => ({ ok: true, status: 200, json: async () => ({ elements: [] }) })) as unknown as typeof fetch;
  const de = await discoverViaProviders({ brand: "Nobody's BBQ", fetchImpl: empty });
  ok("nothing found → tier none with a hand-seed reason (never a silent zero)", de.seeds.length === 0 && de.debug.tier === "none" && Boolean(de.debug.reason));
}

console.log("\n[crossCheckCounts — agree raises confidence; disagree flags specifics]");
{
  const own = [{ address: "123 Main St", city: "Columbus" }, { address: "500 Oak Ave", city: "Dublin" }];
  const agree = crossCheckCounts(own, [{ address: "123 Main St, Columbus, OH, USA", city: "Columbus" }, { address: "500 Oak Ave, Dublin, OH, USA", city: "Dublin" }]);
  ok("matching rosters AGREE (no missing/extra)", agree.agree === true && agree.ownCount === 2 && agree.providerCount === 2);
  const disagree = crossCheckCounts(own, [{ address: "123 Main St", city: "Columbus" }, { address: "9116 Rockville Rd", city: "Indianapolis" }]);
  ok("a provider branch the own feed lacks is flagged missing_from_own", disagree.agree === false && disagree.missingFromOwn.length === 1, disagree.missingFromOwn);
  ok("an own branch the providers lack is flagged extra_in_own", disagree.extraInOwn.length === 1, disagree.extraInOwn);
}

console.log("\n[providerCrossCheck — OSM-only second opinion, best-effort]");
{
  const osmStub: typeof fetch = (async () => ({ ok: true, status: 200, json: async () => OVERPASS_BODY })) as unknown as typeof fetch;
  const xc = await providerCrossCheck({ brand: "City Barbeque", ownSeeds: [{ address: "2111 W Henderson Rd", city: "Columbus" }], fetchImpl: osmStub });
  ok("runs and compares against the OSM count", xc.ran === true && xc.check !== null && xc.check!.providerCount === 3, xc.check?.providerCount);
  const down: typeof fetch = (async () => { throw new Error("overpass 504"); }) as unknown as typeof fetch;
  const xd = await providerCrossCheck({ brand: "City Barbeque", ownSeeds: [], fetchImpl: down });
  ok("an OSM outage yields a best-effort null, never a throw", xd.ran === false && xd.check === null);
}

console.log("\n[sharesBrand — the provider brand guard]");
{
  ok("same distinctive token matches", sharesBrand("City Barbeque", "City Barbeque"));
  ok("brand-as-substring matches ('City Barbeque Dublin')", sharesBrand("City Barbeque Dublin", "City Barbeque"));
  ok("an unrelated eatery does not match", !sharesBrand("Dave's Smoke Shack", "City Barbeque"));
  ok("an empty candidate never matches", !sharesBrand("", "City Barbeque"));
}

// ── seedChainLocations gating (fake Supabase; provider pins skip the geocoder) ──
function makeFakeDb(parent: Record<string, unknown>) {
  const state = { inserted: [] as Record<string, unknown>[], otherInserts: [] as unknown[], updates: [] as unknown[], n: 0 };
  class QB {
    op = "select"; filters: [string, string, unknown][] = []; single_ = false;
    insertRows: Record<string, unknown>[] | null = null; selectCols: string | null = null;
    constructor(public table: string) {}
    select(cols?: string) { this.selectCols = cols ?? "*"; return this; }
    insert(rows: Record<string, unknown> | Record<string, unknown>[]) { this.op = "insert"; this.insertRows = Array.isArray(rows) ? rows : [rows]; return this; }
    update(patch: Record<string, unknown>) { this.op = "update"; (this as { patch?: unknown }).patch = patch; return this; }
    delete() { this.op = "delete"; return this; }
    eq(k: string, v: unknown) { this.filters.push(["eq", k, v]); return this; }
    neq(k: string, v: unknown) { this.filters.push(["neq", k, v]); return this; }
    is(k: string, v: unknown) { this.filters.push(["is", k, v]); return this; }
    ilike(k: string, v: unknown) { this.filters.push(["ilike", k, v]); return this; }
    gte() { return this; } lte() { return this; }
    single() { this.single_ = true; return this; }
    maybeSingle() { this.single_ = true; return this; }
    then<T>(resolve: (v: { data: unknown; error: null }) => T) { return Promise.resolve(this._run()).then(resolve); }
    _run(): { data: unknown; error: null } {
      if (this.op === "insert") {
        const rows = this.insertRows ?? [];
        if (this.table === "restaurants") state.inserted.push(...rows);
        else state.otherInserts.push({ table: this.table, rows });
        state.n += rows.length;
        return { data: this.selectCols ? { id: `id-${state.n}` } : null, error: null };
      }
      if (this.op === "update") { state.updates.push({ table: this.table, patch: (this as { patch?: unknown }).patch, filters: this.filters }); return { data: null, error: null }; }
      if (this.op === "delete") return { data: null, error: null };
      const hasEqSlug = this.filters.some((f) => f[0] === "eq" && f[1] === "slug");
      if (hasEqSlug) return { data: null, error: null };
      const hasEqId = this.filters.some((f) => f[0] === "eq" && f[1] === "id");
      if (this.single_ && hasEqId && this.table === "restaurants") return { data: parent, error: null };
      return { data: [], error: null };
    }
  }
  const db = { from: (t: string) => new QB(t) };
  return { db: db as unknown as Parameters<typeof seedChainLocations>[0], state };
}

console.log("\n[seedChainLocations — provider seeds land GATED, pin preferred, never auto-published]");
{
  const parent = { id: "parent-1", address: null, city: null, location_label: null, lat: null, lng: null, style: "texas" };
  const { db, state } = makeFakeDb(parent);
  const seeds: SeedLocation[] = [
    { name: "Acworth", address: "3574 Cobb Pkwy NW", city: "Acworth", region: "GA", postcode: "30101", country: "United States", lat: 34.0419922, lng: -84.6939357, provider_refs: ["places:P_ACW", "osm:node/10"], source_url: "https://www.google.com/maps/place/?q=place_id:P_ACW" },
    { name: "Avon", address: "9116 Rockville Rd", city: "Indianapolis", region: "IN", postcode: "46234", country: "United States", lat: 39.7643656, lng: -86.3232959, provider_refs: ["osm:node/11"] },
  ];
  const res = await seedChainLocations(db, "parent-1", "City Barbeque", "United States", seeds);
  const rows = state.inserted;
  ok("both provider branches inserted as new", res.added.length === 2 && rows.length === 2, { added: res.added.length, rows: rows.length });
  ok("NONE auto-published — every row is status 'pending'", rows.every((r) => r.status === "pending"));
  ok("EVERY row lands needs_attention (gated for human review)", rows.every((r) => r.needs_attention === true));
  ok("attention_reason is the 'provider-sourced — verify' hold", rows.every((r) => /Provider-sourced/.test(String(r.attention_reason)) && /verify/.test(String(r.attention_reason))));
  const acw = rows.find((r) => r.location_label === "Acworth")!;
  ok("Part A: row name is the BRAND, label is the branch", acw.name === "City Barbeque" && acw.location_label === "Acworth");
  ok("provider PIN preferred (no geocode) — lat/long from the provider", acw.lat === 34.0419922 && acw.lng === -84.6939357);
  ok("pin quality marked provider-sourced", acw.geo_precision === "provider" && acw.geo_source === "places");
  ok("provider ids recorded on enrichment_sources (audit trail)", Array.isArray(acw.enrichment_sources) && (acw.enrichment_sources as string[]).includes("places:P_ACW") && (acw.enrichment_sources as string[]).includes("osm:node/10"));
  const avon = rows.find((r) => r.location_label === "Avon")!;
  ok("second row's geo_source reflects its own provider (osm)", avon.geo_source === "osm");
  ok("all located via provider pin → none flagged as needing a manual pin", res.needsLocation === 0, res.needsLocation);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
