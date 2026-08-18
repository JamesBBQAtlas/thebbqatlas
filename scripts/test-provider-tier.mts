/* Location-data provider tier (patch 0061) — Overpass (OSM) + Google Places adapters,
 * cross-source merge/dedupe, gated feed→seeds hand-off, seedChainLocations gating, and
 * the cheap cross-check. Pure + NETWORK-FREE: every provider call goes through an
 * injected `fetch` stub, and the seedChainLocations test uses provider seeds that carry
 * a pin (so the geocoder is never called) with a fake Supabase client.
 * Run: node_modules/.bin/tsx scripts/test-provider-tier.mts
 */
import { overpassQuery, parseOverpass, fetchOverpass, OVERPASS_USER_AGENT, OVERPASS_MIRRORS, tolerantBrandRegex, overpassVariantCounts, resolveWikidataId } from "../lib/web-engine/providers/overpass";
import { parsePlacesResult, fetchPlaces, buildSearchTextRequest, PLACES_SEARCHTEXT_URL, PLACES_FIELD_MASK, type PlacesRegion } from "../lib/web-engine/providers/places";
import { usStateRegions } from "../lib/web-engine/providers/us-regions";
import { sharesBrand, matchesBrandIdentity, brandIdentityKey } from "../lib/web-engine/providers/match";
import {
  mergeProviderBranches,
  discoverViaProviders,
  crossCheckCounts,
  providerCrossCheck,
  formatProviderReceipt,
  providerInformedStop,
  FORCE_PLACES_MAX_USD,
  type ProviderReceipt,
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

console.log("\n[Overpass query builder — tolerant regex + wikidata union, global, out center tags]");
{
  const q = overpassQuery("City Barbeque");
  ok("includes out center tags", /out center tags;/.test(q));
  // 0071 — spelling-tolerant, case-insensitive regex (NO exact equality — that matched 0).
  ok("brand matched by the spelling-tolerant regex (Barbe[qc]ue), case-insensitive", /nwr\["brand"~"City Barbe\[qc\]ue",i\];/.test(q), q);
  ok("name matched by the same tolerant regex", /nwr\["name"~"City Barbe\[qc\]ue",i\];/.test(q), q);
  ok("no exact-equality brand match (=\"...\")", !/\["brand"="City Barbeque"\]/.test(q));
  ok("global — no area/amenity filter appended", !/\["amenity"/.test(q) && !/area/.test(q));

  // 0071 — a known Wikidata id unions in the GOLD-STANDARD brand:wikidata match first.
  const qw = overpassQuery("City Barbeque", { wikidataId: "Q5124505" });
  ok("wikidata id unions in brand:wikidata=Q… first", /nwr\["brand:wikidata"="Q5124505"\];/.test(qw), qw);
  ok("still keeps the tolerant brand + name fallbacks", /\["brand"~"City Barbe\[qc\]ue",i\]/.test(qw) && /\["name"~"City Barbe\[qc\]ue",i\]/.test(qw));
  ok("a malformed wikidata id is ignored (regex-only)", !/brand:wikidata/.test(overpassQuery("City Barbeque", { wikidataId: "not-a-qid" })));

  const esc = overpassQuery("Dinosaur Bar-B-Que");
  ok("regex-escapes special chars in the brand", esc.includes("Bar\\-B\\-Que") || esc.includes("Bar-B-Que"));
}

console.log("\n[tolerantBrandRegex — folds the -que/-cue spelling variance]");
{
  ok("Barbeque folds to Barbe[qc]ue", tolerantBrandRegex("City Barbeque") === "City Barbe[qc]ue");
  ok("Barbecue folds to the same body (either OSM spelling matches)", tolerantBrandRegex("City Barbecue") === "City Barbe[qc]ue");
  ok("case-insensitive fold (BARBEQUE)", tolerantBrandRegex("City BARBEQUE") === "City Barbe[qc]ue");
  const rx = new RegExp(tolerantBrandRegex("City Barbeque"), "i");
  ok("both spellings match the resulting regex", rx.test("City Barbecue") && rx.test("City Barbeque"));
  ok("still escapes non-BBQ metachars", tolerantBrandRegex("A.B (C)").includes("A\\.B \\(C\\)"));
}

console.log("\n[overpassVariantCounts — per-variant attribution so a 0 is diagnosable]");
{
  const body = { elements: [
    { type: "node", id: 1, tags: { "brand:wikidata": "Q5124505", brand: "City Barbeque", name: "City Barbeque" } },
    { type: "node", id: 2, tags: { brand: "City Barbecue", name: "City Barbecue" } },   // -cue spelling → byBrand
    { type: "node", id: 3, tags: { name: "City Barbeque Downtown" } },                   // name-only → byName
    { type: "node", id: 4, tags: { brand: "Sonny's BBQ", name: "Sonny's" } },            // off-brand → none
  ] };
  const v = overpassVariantCounts(body, "City Barbeque", "Q5124505");
  ok("wikidata match attributed to byWikidata", v.byWikidata === 1, v);
  ok("tolerant -cue brand attributed to byBrand", v.byBrand === 1, v);
  ok("name-only attributed to byName", v.byName === 1, v);
  ok("off-brand attributed to none", v.byWikidata + v.byBrand + v.byName === 3, v);
  const vNoQ = overpassVariantCounts(body, "City Barbeque", null);
  ok("without a wikidata id the wikidata element falls to byBrand", vNoQ.byWikidata === 0 && vNoQ.byBrand === 2, vNoQ);
}

console.log("\n[resolveWikidataId — pageprops.wikibase_item off the Wikipedia API]");
{
  let seenUrl = "";
  const wikiStub: typeof fetch = (async (url: string) => {
    seenUrl = String(url);
    return { ok: true, status: 200, json: async () => ({ query: { pages: { "12345": { pageprops: { wikibase_item: "Q5124505" } } } } }) };
  }) as unknown as typeof fetch;
  const q = await resolveWikidataId({ fetchImpl: wikiStub, wikipediaUrl: "https://en.wikipedia.org/wiki/City_Barbeque" });
  ok("resolves the Q-id from the article title", q === "Q5124505", q);
  ok("derives the title from the /wiki/<title> URL", /titles=City_Barbeque/.test(seenUrl), seenUrl);
  const none = await resolveWikidataId({ fetchImpl: wikiStub, wikipediaUrl: null });
  ok("no URL / no title → null (falls back to the tolerant regex)", none === null);
  const bad: typeof fetch = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
  ok("an API error → null, never throws", (await resolveWikidataId({ fetchImpl: bad, title: "X" })) === null);
  const noProp: typeof fetch = (async () => ({ ok: true, status: 200, json: async () => ({ query: { pages: { "1": {} } } }) })) as unknown as typeof fetch;
  ok("a page with no wikibase_item → null", (await resolveWikidataId({ fetchImpl: noProp, title: "X" })) === null);
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

console.log("\n[fetchOverpass — request shape (UA + form-encoded), never throws]");
{
  // Capture the request the adapter actually makes.
  let seenInit: RequestInit | undefined;
  const stub: typeof fetch = (async (_url: string, init: RequestInit) => {
    seenInit = init;
    return { ok: true, status: 200, json: async () => OVERPASS_BODY };
  }) as unknown as typeof fetch;
  const r = await fetchOverpass("City Barbeque", { fetchImpl: stub, endpoint: "https://ov.test/api" });
  ok("returns parsed branches + raw element count", r.branches.length === 3 && r.rawElements === 5 && r.error === null, { n: r.branches.length, raw: r.rawElements });
  const headers = (seenInit?.headers ?? {}) as Record<string, string>;
  ok("POST is form-encoded (not JSON)", seenInit?.method === "POST" && /x-www-form-urlencoded/.test(headers["content-type"]));
  ok("sends a descriptive User-Agent (the 406 fix)", headers["user-agent"] === OVERPASS_USER_AGENT && /thebbqatlas/.test(headers["user-agent"]));
  ok("body is data=<url-encoded QL>", typeof seenInit?.body === "string" && (seenInit!.body as string).startsWith("data=") && /out%20center%20tags/.test(seenInit!.body as string));

  // A 406 on the first mirror falls back to the next and logs the BODY.
  let call = 0;
  const mirrorStub: typeof fetch = (async () => {
    call++;
    if (call === 1) return { ok: false, status: 406, text: async () => "Not Acceptable: set a User-Agent" };
    return { ok: true, status: 200, json: async () => OVERPASS_BODY };
  }) as unknown as typeof fetch;
  const rm = await fetchOverpass("City Barbeque", { fetchImpl: mirrorStub, endpoints: OVERPASS_MIRRORS });
  ok("a 406 retries on the next mirror → 200", call === 2 && rm.branches.length === 3 && rm.error === null, { call, n: rm.branches.length });

  const allFail: typeof fetch = (async () => ({ ok: false, status: 406, text: async () => "blocked: anonymous UA" })) as unknown as typeof fetch;
  const rf = await fetchOverpass("City Barbeque", { fetchImpl: allFail, endpoints: ["https://a.test", "https://b.test"] });
  ok("all mirrors 406 → structured empty, body logged in error", rf.branches.length === 0 && /406/.test(rf.error ?? "") && /blocked/.test(rf.error ?? ""), rf.error);

  const bad: typeof fetch = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
  const rb = await fetchOverpass("City Barbeque", { fetchImpl: bad, endpoint: "https://ov.test/api" });
  ok("a transport error is a structured empty, not a throw", rb.branches.length === 0 && /network down/.test(rb.error ?? ""));
}

console.log("\n[buildSearchTextRequest — Places API (New): POST, header key, field mask]");
{
  const { url, init } = buildSearchTextRequest("SECRET_KEY", { textQuery: "City Barbeque", pageSize: 20 });
  const h = (init.headers ?? {}) as Record<string, string>;
  ok("hits places:searchText (New), not the legacy endpoint", url === PLACES_SEARCHTEXT_URL && /places\.googleapis\.com\/v1\/places:searchText/.test(url) && !/maps\/api\/place\/textsearch/.test(url));
  ok("POST with JSON body", init.method === "POST" && /application\/json/.test(h["Content-Type"]));
  ok("key is in X-Goog-Api-Key header, NOT a ?key= param", h["X-Goog-Api-Key"] === "SECRET_KEY" && !url.includes("key="));
  ok("field mask is present + minimal (New-shape fields)", h["X-Goog-FieldMask"] === PLACES_FIELD_MASK && /places\.id/.test(h["X-Goog-FieldMask"]) && /places\.displayName/.test(h["X-Goog-FieldMask"]));
  ok("textQuery + pageSize in the JSON body", /"textQuery":"City Barbeque"/.test(String(init.body)) && /"pageSize":20/.test(String(init.body)));
}

console.log("\n[parsePlacesResult — New shapes: place.id / displayName.text / location]");
{
  const raw = { id: "ChIJabc", displayName: { text: "City Barbeque" }, formattedAddress: "2111 W Henderson Rd, Columbus, OH 43220, USA", location: { latitude: 40.057, longitude: -83.076 }, nationalPhoneNumber: "(614) 538-8890" };
  const p = parsePlacesResult(raw)!;
  ok("provider is places + ref is places:<id> (New id field)", p.provider === "places" && p.provider_refs[0] === "places:ChIJabc" && p.external_id === "ChIJabc");
  ok("displayName.text → name", p.location_label === "City Barbeque" && p.brand_name === "City Barbeque");
  ok("city parsed from formattedAddress", p.city === "Columbus", p.city);
  ok("location.latitude/longitude → lat/long", p.lat === 40.057 && p.lng === -83.076);
  ok("nationalPhoneNumber → phone", p.phone === "(614) 538-8890");
  ok("a result with no id is dropped", parsePlacesResult({ displayName: { text: "x" }, formattedAddress: "y" }) === null);
  ok("legacy shape (place_id) no longer parses (New-only)", parsePlacesResult({ place_id: "L1", formatted_address: "z" }) === null);
}

console.log("\n[fetchPlaces — New API: pageToken sweep, dedupe, brand guard, COST CAP]");
{
  // New response shape: { places: [...], nextPageToken } — pageToken travels in the POST body.
  const P = (id: string, name: string, addr: string, lat: number, lng: number) => ({ id, displayName: { text: name }, formattedAddress: addr, location: { latitude: lat, longitude: lng } });
  const page0 = { places: [
    P("P1", "City Barbeque", "123 Main St, Columbus, OH 43220, USA", 40.05, -83.07),
    P("PX", "Dave's Smoke Shack", "9 Other St, Columbus, OH, USA", 40.06, -83.08),
  ], nextPageToken: "TOK1" };
  const page1 = { places: [
    P("P2", "City Barbeque", "500 Oak Ave, Dublin, OH 43017, USA", 40.10, -83.13),
    P("P1", "City Barbeque", "123 Main St, Columbus, OH 43220, USA", 40.05, -83.07),
  ] };
  const placesStub = (calls: { n: number }): typeof fetch =>
    (async (_url: string, init: RequestInit) => {
      calls.n++;
      const body = JSON.parse(String(init.body)) as { pageToken?: string };
      const pg = body.pageToken === "TOK1" ? page1 : page0;
      return { ok: true, status: 200, json: async () => pg };
    }) as unknown as typeof fetch;

  const c1 = { n: 0 };
  const full = await fetchPlaces("City Barbeque", { key: "k", fetchImpl: placesStub(c1), budget: { maxCalls: 10, maxUsd: 1 }, sleep: async () => {} });
  ok("paginates both pages via nextPageToken (2 billable calls)", full.calls === 2, full.calls);
  ok("dedupes by place id across pages (P1 once)", full.branches.length === 2, full.branches.map((b) => b.external_id));
  ok("brand guard drops the unrelated 'Dave's Smoke Shack'", !full.branches.some((b) => b.external_id === "PX"));
  ok("spend logged = calls × SKU", Math.abs(full.spendUsd - 0.064) < 1e-6, full.spendUsd);
  ok("not capped when inside budget", full.capped === false);

  const c2 = { n: 0 };
  const capped = await fetchPlaces("City Barbeque", { key: "k", fetchImpl: placesStub(c2), budget: { maxCalls: 1, maxUsd: 1 }, sleep: async () => {} });
  ok("COST CAP stops the sweep + reports capped:true", capped.capped === true && capped.calls === 1, { calls: capped.calls, capped: capped.capped });

  // A New-API error body { error: { status, message } } surfaces, never throws.
  const denied: typeof fetch = (async () => ({ ok: false, status: 403, json: async () => ({ error: { code: 403, status: "PERMISSION_DENIED", message: "legacy API not enabled" } }) })) as unknown as typeof fetch;
  const rd = await fetchPlaces("City Barbeque", { key: "k", fetchImpl: denied, budget: { maxCalls: 3, maxUsd: 1 }, sleep: async () => {} });
  ok("an API error surfaces status+message, no branches, no throw", rd.branches.length === 0 && rd.status === "PERMISSION_DENIED" && /legacy/.test(rd.error ?? ""), { s: rd.status, e: rd.error });
}

console.log("\n[fetchPlaces — geographic sweep: per-region locationRestriction, per-region counts, resume]");
{
  const P = (id: string, name: string, addr: string, lat: number, lng: number) => ({ id, displayName: { text: name }, formattedAddress: addr, location: { latitude: lat, longitude: lng } });
  // A stub that returns a distinct branch keyed off the locationRestriction (so each
  // region contributes its own store), single page each.
  const sweepStub = (log: { regions: (unknown | undefined)[] }): typeof fetch =>
    (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { locationRestriction?: { rectangle?: { low: { latitude: number } } } };
      log.regions.push(body.locationRestriction);
      const lat = body.locationRestriction?.rectangle?.low.latitude ?? 0;
      const id = `S${lat}`;
      return { ok: true, status: 200, json: async () => ({ places: [P(id, "City Barbeque", `100 Main St ${id}, Town, ST, USA`, lat, -83)] }) };
    }) as unknown as typeof fetch;

  const regions: PlacesRegion[] = [
    { key: "national" },
    { key: "OH", locationRestriction: { rectangle: { low: { latitude: 38.3, longitude: -84.9 }, high: { latitude: 42.4, longitude: -80.5 } } } },
    { key: "GA", locationRestriction: { rectangle: { low: { latitude: 30.3, longitude: -85.7 }, high: { latitude: 35.1, longitude: -80.8 } } } },
  ];
  const log1 = { regions: [] as (unknown | undefined)[] };
  const swept = await fetchPlaces("City Barbeque", { key: "k", fetchImpl: sweepStub(log1), regions, budget: { maxCalls: 100, maxUsd: 3 }, sleep: async () => {} });
  ok("sweeps every region (3 calls, one per region)", swept.calls === 3, swept.calls);
  ok("national query carries NO locationRestriction; states DO", log1.regions[0] === undefined && !!log1.regions[1] && !!log1.regions[2]);
  ok("per-region counts recorded for the receipt", swept.perRegion.length === 3 && swept.perRegion.every((r) => r.count === 1), swept.perRegion);
  ok("regionsSwept lists all three keys, nothing remaining", swept.regionsSwept.join(",") === "national,OH,GA" && swept.regionsRemaining.length === 0, { s: swept.regionsSwept, r: swept.regionsRemaining });
  ok("not capped inside budget", swept.capped === false);

  // Resume — skipRegionKeys skips already-swept regions and prepends them to regionsSwept.
  const log2 = { regions: [] as (unknown | undefined)[] };
  const resumed = await fetchPlaces("City Barbeque", { key: "k", fetchImpl: sweepStub(log2), regions, skipRegionKeys: ["national", "OH"], budget: { maxCalls: 100, maxUsd: 3 }, sleep: async () => {} });
  ok("resume skips already-swept regions (only GA hit)", resumed.calls === 1 && log2.regions.length === 1, { calls: resumed.calls });
  ok("regionsSwept carries the prior cursor + the new region", resumed.regionsSwept.join(",") === "national,OH,GA", resumed.regionsSwept);

  // Cap trips mid-sweep — the unreached regions become the resume cursor (no silent truncation).
  const log3 = { regions: [] as (unknown | undefined)[] };
  const cap = await fetchPlaces("City Barbeque", { key: "k", fetchImpl: sweepStub(log3), regions, budget: { maxCalls: 2, maxUsd: 3 }, sleep: async () => {} });
  ok("cap stops the sweep short + reports capped", cap.capped === true && cap.calls === 2, { calls: cap.calls, capped: cap.capped });
  ok("the unreached region is the resume cursor", cap.regionsRemaining.includes("GA") && !cap.regionsSwept.includes("GA"), { swept: cap.regionsSwept, remaining: cap.regionsRemaining });
}

console.log("\n[usStateRegions — 50 states + DC as rectangle-restricted sweep regions]");
{
  const regions = usStateRegions();
  ok("covers 51 regions (50 states + DC)", regions.length === 51, regions.length);
  ok("every region has a rectangle locationRestriction", regions.every((r) => "rectangle" in (r.locationRestriction ?? {})));
  const oh = regions.find((r) => r.key === "OH")!;
  ok("OH box is a sane US envelope (west/south of east/north, lng negative)", !!oh && oh.locationRestriction!.rectangle.low.longitude < 0 && oh.locationRestriction!.rectangle.low.latitude < oh.locationRestriction!.rectangle.high.latitude);
}

console.log("\n[formatProviderReceipt + providerInformedStop — the cost UX (Part C)]");
{
  const complete: ProviderReceipt = { found: 74, osm: 61, places: 13, deduped: 0, spendUsd: 0.9, capUsd: FORCE_PLACES_MAX_USD, regionsSwept: 48, regionsTotal: 50, capped: false };
  const line = formatProviderReceipt(complete);
  ok("receipt shows found + per-source + regions + spend/cap", /Found 74 locations/.test(line) && /OSM 61/.test(line) && /Places 13/.test(line) && /swept 48\/50 regions/.test(line) && /\$0\.90 \(cap \$3\.00\)/.test(line), line);
  ok("a completed run has NO informed-stop notice", providerInformedStop(complete) === null);

  const cappedR: ProviderReceipt = { found: 40, osm: 25, places: 15, deduped: 2, spendUsd: 3.0, capUsd: FORCE_PLACES_MAX_USD, regionsSwept: 30, regionsTotal: 50, capped: true, expectedTotal: 76 };
  const stop = providerInformedStop(cappedR)!;
  ok("informed stop fires when capped, with a remaining estimate", /Stopped at the \$3\.00 cap/.test(stop) && /~36 likely remaining/.test(stop) && /20 regions not yet swept/.test(stop) && /Continue sweeping/.test(stop), stop);
  ok("capped receipt still renders the deduped count", /deduped 2/.test(formatProviderReceipt(cappedR)));

  const singleRegion: ProviderReceipt = { found: 1, osm: 1, places: 0, deduped: 0, spendUsd: 0, capUsd: 0.6, regionsSwept: 1, regionsTotal: 1, capped: false };
  ok("singular grammar + region part hidden for a single region", /Found 1 location ·/.test(formatProviderReceipt(singleRegion)) && !/regions/.test(formatProviderReceipt(singleRegion)));
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

  // 0071 integration — wikipediaUrl resolves the Wikidata id (fed into the OSM query),
  // fullSweep drives the geographic Places sweep at the raised cap, skipRegionKeys resumes.
  let sawWikidataInQL = false;
  const placesHits: string[] = [];
  const integ: typeof fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (/wikipedia\.org/.test(u)) {
      return { ok: true, status: 200, json: async () => ({ query: { pages: { "1": { pageprops: { wikibase_item: "Q5124505" } } } } }) };
    }
    if (/googleapis\.com/.test(u)) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { locationRestriction?: { rectangle?: { low: { latitude: number } } } };
      const lat = body.locationRestriction?.rectangle?.low.latitude;
      const key = lat != null ? `S${lat}` : "national";
      placesHits.push(key);
      return { ok: true, status: 200, json: async () => ({ places: [{ id: `PL_${key}`, displayName: { text: "City Barbeque" }, formattedAddress: `100 Main St ${key}, Town, ST, USA`, location: { latitude: lat ?? 39, longitude: -83 } }] }) };
    }
    // Overpass — assert the wikidata union made it into the QL, return the fixture.
    const qlBody = String(init?.body ?? "");
    if (/brand%3Awikidata%22%3D%22Q5124505/.test(qlBody) || /brand:wikidata"="Q5124505/.test(decodeURIComponent(qlBody))) sawWikidataInQL = true;
    return { ok: true, status: 200, json: async () => OVERPASS_BODY };
  }) as unknown as typeof fetch;

  const full = await discoverViaProviders({
    brand: "City Barbeque",
    fetchImpl: integ,
    placesKey: "k",
    wikipediaUrl: "https://en.wikipedia.org/wiki/City_Barbeque",
    fullSweep: true,
    sleep: async () => {},
  });
  ok("wikidata id resolved from the wikipedia link + cached on the result", full.wikidataId === "Q5124505", full.wikidataId);
  ok("the resolved wikidata id was unioned into the Overpass QL", sawWikidataInQL);
  ok("fullSweep ran the geographic Places sweep (national + uncovered states)", full.regionsSwept.length > 1 && full.regionsSwept[0] === "national", full.regionsSwept.length);
  ok("OSM-covered states are skipped by the gap-fill (OH/GA/IN not re-swept)", !full.regionsSwept.includes("OH") && !full.regionsSwept.includes("GA"), full.regionsSwept.filter((s) => ["OH", "GA", "IN"].includes(s)));
  ok("debug exposes the sweep + variant diagnostics", full.debug.regionsSwept > 1 && typeof full.debug.osm.variants.byBrand === "number", full.debug.osm.variants);

  // Resume — a cached wikidataId skips the wiki lookup; skipRegionKeys resumes the sweep.
  let wikiCalled = false;
  const integ2: typeof fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (/wikipedia\.org/.test(u)) { wikiCalled = true; return { ok: true, status: 200, json: async () => ({}) }; }
    if (/googleapis\.com/.test(u)) return { ok: true, status: 200, json: async () => ({ places: [] }) };
    return { ok: true, status: 200, json: async () => OVERPASS_BODY };
  }) as unknown as typeof fetch;
  const resumed = await discoverViaProviders({
    brand: "City Barbeque", fetchImpl: integ2, placesKey: "k",
    wikidataId: "Q5124505", fullSweep: true, skipRegionKeys: ["national"], sleep: async () => {},
  });
  ok("a cached wikidata id skips the Wikipedia lookup", wikiCalled === false);
  ok("skipRegionKeys resumes — 'national' carried, not re-swept", resumed.regionsSwept.includes("national"));
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

console.log("\n[brandIdentityKey / matchesBrandIdentity — the STRICT gate (0073)]");
{
  // Normalisation folds every BBQ spelling to one identity key.
  ok("'City Barbeque' → 'city bbq'", brandIdentityKey("City Barbeque") === "city bbq", brandIdentityKey("City Barbeque"));
  ok("'City Barbecue' folds to the same key", brandIdentityKey("City Barbecue") === "city bbq");
  ok("'City BBQ' folds to the same key", brandIdentityKey("City BBQ") === "city bbq");
  ok("'City Bar-B-Que' folds to the same key", brandIdentityKey("City Bar-B-Que") === "city bbq", brandIdentityKey("City Bar-B-Que"));
  ok("® / punctuation stripped", brandIdentityKey("City Barbeque®") === "city bbq");

  // EXACT identity accepts the real chain, however it's spelled…
  ok("exact brand accepted", matchesBrandIdentity("City Barbeque", "City Barbeque"));
  ok("'City BBQ' accepted for 'City Barbeque'", matchesBrandIdentity("City BBQ", "City Barbeque"));
  ok("'Mission BBQ' accepted for 'Mission BBQ'", matchesBrandIdentity("Mission BBQ", "Mission BBQ"));
  // …and REJECTS the loose matches that flooded 0072 (all passed sharesBrand).
  ok("REJECTS 'Park City BBQ'", !matchesBrandIdentity("Park City BBQ", "City Barbeque"));
  ok("REJECTS 'Salt Lake City BBQ'", !matchesBrandIdentity("Salt Lake City BBQ", "City Barbeque"));
  ok("REJECTS 'City BBQ Express' (extra token)", !matchesBrandIdentity("City BBQ Express", "City Barbeque"));
  ok("REJECTS 'Gatlin's BBQ'", !matchesBrandIdentity("Gatlin's BBQ", "City Barbeque"));
  ok("REJECTS a bare city name", !matchesBrandIdentity("Moab", "City Barbeque"));
  ok("empty candidate never matches", !matchesBrandIdentity("", "City Barbeque") && !matchesBrandIdentity(null, "City Barbeque"));
  // The exact loose cases sharesBrand WOULD have let through — proof the gate is stricter.
  ok("sharesBrand let 'Park City BBQ' through; identity does not", sharesBrand("Park City BBQ", "City Barbeque") && !matchesBrandIdentity("Park City BBQ", "City Barbeque"));
}

console.log("\n[fetchPlaces — 0073 identity gate + street gate + pagination stop]");
{
  const mk = (id: string, name: string, addr: string) => ({ id, displayName: { text: name }, formattedAddress: addr, location: { latitude: 40, longitude: -83 } });
  // A generic-query region page: one real City Barbeque + loosely-matched noise +
  // a centroid-only "City BBQ" (no street). Only the real branch must survive.
  const noisyPage = { places: [
    mk("REAL", "City Barbeque", "2111 W Henderson Rd, Columbus, OH 43220, USA"),
    mk("LOOSE1", "Park City BBQ", "10 Resort Dr, Park City, UT 84060, USA"),
    mk("LOOSE2", "Salt Lake City BBQ", "5 State St, Salt Lake City, UT 84101, USA"),
    mk("CENTROID", "City Barbeque", "Moab, UT 84532, USA"),          // right name, NO street → drop
    mk("GATLINS", "Gatlin's BBQ", "1221 19th St, Houston, TX 77008, USA"),
  ], nextPageToken: "N2" };
  const onlyNoise = { places: [
    mk("N1", "Kansas City Barbeque", "5 Any St, Kansas City, MO, USA"),
    mk("N2", "Bubba's BBQ", "9 Rib Ln, Austin, TX, USA"),
  ], nextPageToken: "N3" };

  // Region 1 returns the noisy page then would paginate; region "empty" returns only noise.
  let calls1 = 0;
  const stub1: typeof fetch = (async (_u: string, init: RequestInit) => {
    calls1++;
    const b = JSON.parse(String(init.body)) as { pageToken?: string };
    return { ok: true, status: 200, json: async () => (b.pageToken ? { places: [] } : noisyPage) };
  }) as unknown as typeof fetch;
  const r1 = await fetchPlaces("City Barbeque", { key: "k", fetchImpl: stub1, budget: { maxCalls: 10, maxUsd: 1 }, sleep: async () => {} });
  ok("keeps ONLY the exact-name branch with a street (1 of 5)", r1.branches.length === 1 && r1.branches[0].external_id === "REAL", r1.branches.map((b) => b.external_id));
  ok("drops the right-name-but-centroid result (no street)", !r1.branches.some((b) => b.external_id === "CENTROID"));
  ok("drops the loose 'Park City BBQ' / 'Salt Lake City BBQ' / 'Gatlin's'", !r1.branches.some((b) => ["LOOSE1", "LOOSE2", "GATLINS"].includes(b.external_id!)));

  // PAGINATION STOP — a region whose FIRST page has zero real matches must not
  // paginate (one billable call), so a generic query never floods to the cap.
  let calls2 = 0;
  const stubNoise: typeof fetch = (async () => { calls2++; return { ok: true, status: 200, json: async () => onlyNoise }; }) as unknown as typeof fetch;
  const r2 = await fetchPlaces("City Barbeque", { key: "k", fetchImpl: stubNoise, budget: { maxCalls: 10, maxUsd: 1 }, sleep: async () => {} });
  ok("a 0-match region stops after ONE call (no flood)", calls2 === 1 && r2.branches.length === 0, { calls: calls2, n: r2.branches.length });
}

console.log("\n[parseOverpass — 0073 strict identity + brand:wikidata hard signal]");
{
  const body = { elements: [
    { type: "node", id: 1, lat: 40, lon: -83, tags: { brand: "City Barbeque", name: "City Barbeque", "addr:housenumber": "1", "addr:street": "A St", "addr:city": "Columbus" } },
    { type: "node", id: 2, lat: 41, lon: -84, tags: { "brand:wikidata": "Q5124505", name: "CityBBQ Downtown", "addr:housenumber": "2", "addr:street": "B St", "addr:city": "Dublin" } }, // no brand tag, odd name — accepted on the wikidata hard signal
    { type: "node", id: 3, lat: 42, lon: -85, tags: { brand: "Park City BBQ", name: "Park City BBQ", "addr:housenumber": "3", "addr:street": "C St", "addr:city": "Park City" } }, // loose — REJECTED
  ] };
  const strict = parseOverpass(body, "City Barbeque", { wikidataId: "Q5124505" });
  ok("exact-brand element kept", strict.some((b) => b.external_id === "node/1"));
  ok("brand:wikidata hard-signal element kept despite an off-name", strict.some((b) => b.external_id === "node/2"));
  ok("loose 'Park City BBQ' element REJECTED", !strict.some((b) => b.external_id === "node/3"));
  ok("exactly the 2 real branches", strict.length === 2, strict.map((b) => b.external_id));
  // Without the wikidata id, the odd-named node/2 is no longer hard-signalled → dropped.
  const noWd = parseOverpass(body, "City Barbeque");
  ok("no wikidata id → the odd-named node is dropped (strict identity only)", !noWd.some((b) => b.external_id === "node/2") && noWd.length === 1, noWd.map((b) => b.external_id));
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
