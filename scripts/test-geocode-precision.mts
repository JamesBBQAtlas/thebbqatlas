/**
 * Unit tests for the Part 3 geocode precision gate. Pure logic only — no MapTiler
 * calls: `resolveGeocode` takes an injected `run(q)` so we can script hits.
 *
 * Run: npm run test:geocode
 */
import {
  classifyPrecision,
  resolveGeocode,
  type GeoResult,
} from "../lib/geo/geocode";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`);
  }
}

function hit(place_type: string, lat = 30.4, lng = -88.8): GeoResult {
  const { place_type: pt, precise } = classifyPrecision([place_type]);
  return { lat, lng, country_code: "US", city: "Ocean Springs", country: "United States", place_type: pt, precise };
}

console.log("\n[classifyPrecision]");
ok("address is precise", classifyPrecision(["address"]).precise === true);
ok("poi is precise", classifyPrecision(["poi"]).precise === true);
ok("street is precise", classifyPrecision(["street"]).precise === true);
ok("place (town) is coarse", classifyPrecision(["place"]).precise === false);
ok("municipality is coarse", classifyPrecision(["municipality"]).precise === false);
ok("region is coarse", classifyPrecision(["region"]).precise === false);
ok("postal_code is coarse", classifyPrecision(["postal_code"]).precise === false);
ok("empty is coarse + null type", (() => {
  const c = classifyPrecision([]);
  return c.precise === false && c.place_type === null;
})());
ok("primary type is first element", classifyPrecision(["poi", "address"]).place_type === "poi");

console.log("\n[resolveGeocode — the Ocean Springs / The Shed case]");

await (async () => {
  // Address query resolves ONLY to the town centroid; name+city POI query then
  // finds the real venue. Expect the precise POI hit, coarse discarded.
  const runs: Record<string, GeoResult | null> = {
    "7501 MS-57, Ocean Springs, United States": hit("place"),
    "The Shed BBQ, Ocean Springs, United States": hit("poi", 30.49, -88.79),
    "Ocean Springs, United States": hit("place"),
  };
  const q = Object.keys(runs);
  const { result, coarse } = await resolveGeocode(q, async (x) => runs[x] ?? null);
  ok("returns the precise POI hit", result?.place_type === "poi" && result?.precise === true);
  ok("coarse is null when a precise hit exists", coarse === null);
})();

await (async () => {
  // NOTHING resolves better than town level — must report coarse_only, no pin.
  const runs: Record<string, GeoResult | null> = {
    "7501 MS-57, Ocean Springs, United States": hit("place"),
    "The Shed BBQ, Ocean Springs, United States": hit("municipality"),
    "Ocean Springs, United States": hit("place"),
  };
  const q = Object.keys(runs);
  const { result, coarse } = await resolveGeocode(q, async (x) => runs[x] ?? null);
  ok("no precise result when only centroids exist", result === null);
  ok("coarse centroid is surfaced for context", coarse?.precise === false);
})();

await (async () => {
  // First query is precise — short-circuit, never look at the rest.
  let calls = 0;
  const { result } = await resolveGeocode(["a", "b", "c"], async () => {
    calls++;
    return hit("address");
  });
  ok("precise first hit short-circuits the ladder", result?.precise === true && calls === 1);
})();

await (async () => {
  // Nothing resolves at all.
  const { result, coarse } = await resolveGeocode(["a", "b"], async () => null);
  ok("all-miss returns null result and null coarse", result === null && coarse === null);
})();

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
