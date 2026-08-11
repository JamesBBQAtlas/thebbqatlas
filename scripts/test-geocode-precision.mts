/**
 * Unit tests for the Part 3 geocode precision gate. Pure logic only — no MapTiler
 * calls: `resolveGeocode` takes an injected `run(q)` so we can script hits.
 *
 * Run: npm run test:geocode
 */
import {
  classifyPrecision,
  resolveGeocode,
  isTooCoarse,
  decideStructuredGeo,
  extractUKPostcode,
  structuredLadder,
  isSentinelPin,
  type GeoResult,
  type PostcodeAnchor,
} from "../lib/geo/geocode";
import { resolveCountryCode } from "../lib/constants/countries";

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

console.log("\n[isTooCoarse — never pin a country/region centroid (FAIL 4)]");
ok("country is too coarse", isTooCoarse("country") === true);
ok("region is too coarse", isTooCoarse("region") === true);
ok("postal_code is too coarse", isTooCoarse("postal_code") === true);
ok("place (town) is NOT too coarse (legacy-acceptable)", isTooCoarse("place") === false);
ok("address is NOT too coarse", isTooCoarse("address") === false);

await (async () => {
  // The address-less-parent bug: the only hit is a country centroid — it must be
  // dropped entirely, never returned even as a legacy coarse pin.
  const runs: Record<string, GeoResult | null> = {
    "Thatcher Barbecue Company, United States": hit("country", 39.78, -100.44),
  };
  const q = Object.keys(runs);
  const { result, coarse } = await resolveGeocode(q, async (x) => runs[x] ?? null);
  ok("US-centroid country hit is dropped (no result)", result === null);
  ok("US-centroid country hit is NOT kept as coarse", coarse === null);
})();

console.log("\n[geocode-fix — decideStructuredGeo: country-constrained, postcode-anchored, confidence-gated]");
{
  // A precise hit VALIDATED against its postcode anchor → confident, use it.
  const camden: GeoResult = { lat: 51.5401, lng: -0.1374, country_code: "GB", city: "Camden", country: "United Kingdom", place_type: "address", precise: true };
  const anchor: PostcodeAnchor = { lat: 51.5397, lng: -0.138, city: "Camden", source: "postcodes.io" };
  const good = decideStructuredGeo({ address: "88 Royal College Street", postcode: "NW1 0TH", country: "United Kingdom" }, anchor, camden, "GB");
  ok("validated in-postcode hit → confident", good.status === "confident" && good.result?.city === "Camden");
  ok("confident pin carries high confidence + source", good.confidence >= 0.9 && good.source === "maptiler");

  // THE RACK CITY CASE: a precise hit ~21km from the postcode anchor is REJECTED,
  // and we fall back to the postcode anchor (Camden), never Carshalton.
  const carshalton: GeoResult = { lat: 51.352, lng: -0.156, country_code: "GB", city: "Carshalton", country: "United Kingdom", place_type: "address", precise: true };
  const rackCity = decideStructuredGeo({ address: "88 Royal College Street", postcode: "NW1 0TH", country: "United Kingdom" }, anchor, carshalton, "GB");
  ok("Rack City: far-from-anchor precise hit is NOT trusted", rackCity.result?.city !== "Carshalton");
  ok("Rack City: falls back to the postcode anchor (Camden area)", rackCity.source === "postcodes.io" && rackCity.status === "approximate");
  ok("Rack City: anchor pin sits at the postcode, ~Camden not Carshalton", Math.abs((rackCity.result?.lat ?? 0) - 51.54) < 0.05);

  // Wrong-country precise hit is rejected even without an anchor.
  const usHit: GeoResult = { lat: 40.0, lng: -80.0, country_code: "US", city: "Somewhere", country: "United States", place_type: "address", precise: true };
  const wrongCountry = decideStructuredGeo({ address: "1 High St", city: "London", country: "United Kingdom" }, null, usHit, "GB");
  ok("precise hit in the wrong country is rejected", wrongCountry.status !== "confident");

  // Precise hit, no postcode anchor, right country → accepted (0.9, no anchor).
  const noAnchor = decideStructuredGeo({ address: "1 High St", city: "Austin", country: "United States" }, null, usHit, "US");
  ok("precise in-country hit with no anchor → confident @0.9", noAnchor.status === "confident" && noAnchor.confidence === 0.9);

  // Incomplete: no street AND no postcode/city → flagged incomplete, NO pin.
  const incomplete = decideStructuredGeo({ city: null, country: "United Kingdom" }, null, null, "GB");
  ok("incomplete address → flagged, no pin", incomplete.status === "flagged" && incomplete.result === null);
  ok("incomplete uses the 'add a street/postcode' reason", /incomplete address/.test(incomplete.reason ?? ""));

  // Has a street + city but nothing resolved and no anchor → flagged low-confidence.
  const weak = decideStructuredGeo({ address: "999 Nowhere Rd", city: "Smalltown", country: "United States" }, null, null, "US");
  ok("street present but nothing resolved → flagged low-confidence", weak.status === "flagged" && /low-confidence/.test(weak.reason ?? ""));

  // A postcode anchor with NO usable geocoder hit still places an approximate pin.
  const anchorOnly = decideStructuredGeo({ address: "12 Somewhere St", postcode: "NW1 0TH", country: "United Kingdom" }, anchor, null, "GB");
  ok("anchor-only → approximate pin placed (right area)", anchorOnly.status === "approximate" && anchorOnly.result !== null);

  // A too-coarse (postcode-centroid) MapTiler hit is never trusted as precise.
  const coarseHit: GeoResult = { lat: 51.5, lng: -0.12, country_code: "GB", city: "London", country: "United Kingdom", place_type: "postcode", precise: false };
  const coarse = decideStructuredGeo({ address: "1 High St", postcode: "NW1 0TH", country: "United Kingdom" }, anchor, coarseHit, "GB");
  ok("coarse maptiler hit → falls to anchor, not the coarse hit", coarse.source === "postcodes.io");
}

console.log("\n[geocode-fix — extractUKPostcode]");
ok("pulls NW1 0TH from a full address", extractUKPostcode("88 Royal College Street, London, NW1 0TH") === "NW1 0TH");
ok("pulls SE1 3SU (no space variant)", extractUKPostcode("8-9 Snowsfields, SE13SU") === "SE1 3SU" || extractUKPostcode("8-9 Snowsfields, SE1 3SU") === "SE1 3SU");
ok("returns null when there's no UK postcode", extractUKPostcode("123 Main St, Austin, TX 78704") === null);

console.log("\n[pin-fixes — country-code mapping (the constraint that silently never applied)]");
ok("resolveCountryCode('United States') → US (was null!)", resolveCountryCode(null, "United States") === "US");
ok("resolveCountryCode('United Kingdom') → GB", resolveCountryCode(null, "United Kingdom") === "GB");
ok("resolveCountryCode('United Arab Emirates') → AE", resolveCountryCode(null, "United Arab Emirates") === "AE");
ok("variant 'USA' still → US", resolveCountryCode(null, "USA") === "US");

console.log("\n[pin-fixes — the query ladder drops the ZIP so the street can resolve]");
{
  const rungs = structuredLadder({ address: "601 E Main St", city: "Arlington", region: "TX", postcode: "76010", country: "United States" });
  ok("rung 1 is the full query (with ZIP)", /76010/.test(rungs[0]));
  ok("rung 2 drops the postcode (the Arlington fix)", rungs.length > 1 && !/76010/.test(rungs[1]) && /601 E Main St/.test(rungs[1]) && /Arlington/.test(rungs[1]));
  ok("a POI-by-name rung exists", rungs.some((r) => r.length > 0));
  ok("no empty rungs", rungs.every((r) => r.trim().length > 0));
}
{
  // A US street address that resolves precisely (no anchor for US) → confident.
  const usHit: GeoResult = { lat: 32.736, lng: -97.108, country_code: "US", city: "Arlington", country: "United States", place_type: "address", precise: true };
  const decided = decideStructuredGeo({ address: "601 E Main St", city: "Arlington", region: "TX", postcode: "76010", country: "United States" }, null, usHit, "US");
  ok("a precise US address hit → confident (not low-confidence)", decided.status === "confident");
  // The ZIP-centroid hit MapTiler returned for the over-specified query is rejected.
  const zipCentroid: GeoResult = { lat: 32.7, lng: -97.1, country_code: "US", city: "Arlington", country: "United States", place_type: "postcode", precise: false };
  const rej = decideStructuredGeo({ address: "601 E Main St", city: "Arlington", postcode: "76010", country: "United States" }, null, zipCentroid, "US");
  ok("a ZIP-centroid (postcode) hit is NOT accepted as confident", rej.status !== "confident");
}

console.log("\n[pin-fixes — isSentinelPin (0,0 + country centroids are 'no pin')]");
ok("(0,0) is a sentinel", isSentinelPin(0, 0) === true);
ok("US centroid (39.7837,-100.4459) is a sentinel", isSentinelPin(39.7837305527552, -100.445882119238) === true);
ok("US centroid within tolerance is a sentinel", isSentinelPin(39.784, -100.446) === true);
ok("a real Arlington pin is NOT a sentinel", isSentinelPin(32.736, -97.108) === false);
ok("null is not a sentinel (it's genuinely no-pin)", isSentinelPin(null, null) === false);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
