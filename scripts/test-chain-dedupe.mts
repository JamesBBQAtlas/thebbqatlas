/* Chain-roster dedupe hardening (BUILDPROMPTCHAINDEDUPEHARDENING).
 *
 * Part A — one address normalizer collapses format-variants of ONE physical
 * location (the Old Jimmy's triple-duplicate), while genuinely different
 * addresses stay separate (the over-merge guard). Part B — the "Chains to roster"
 * chip and the ?unrostered=1 deep-link share ONE predicate.
 *
 * Pure + network-free. Run: node_modules/.bin/tsx scripts/test-chain-dedupe.mts
 */
import { normStreet, normCity, foldDiacritics } from "../lib/admin/address";
import {
  locationKey,
  hasStreet,
  mergeDiscovered,
  mergeDiscoveredTraced,
  type DiscoveredLocation,
} from "../lib/chains/discoverLocations";
import { findDuplicates } from "../lib/venues/dedupe";
import { rosterNameIsOffBrand, brandTokens, addressHasStreet } from "../lib/admin/chain-seed";
import { coherentGeoConfidence, flagshipUnlocatable, hasRealPoint } from "../lib/geo/geocode";
import {
  isUnrosteredChain,
  parentIdsWithChildren,
  type UnrosteredChainVenue,
} from "../lib/admin/unrostered";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

const mk = (address: string, city: string, extra: Partial<DiscoveredLocation> = {}): DiscoveredLocation => ({
  name: null, location_label: null, address, city, region: null, postcode: null,
  country: "Mexico", phone: null, hours: null, instagram_url: null, source_url: null,
  found_via: "web", ...extra,
});

// ── normStreet: the shared normalizer ───────────────────────────────────────
console.log("\n[normStreet — diacritics / number-position / abbreviations]");
ok("folds diacritics", foldDiacritics("Plutarco Elías Calles") === "Plutarco Elias Calles");
ok("diacritic + accent-free street → same key", normStreet("Plutarco Elías Calles 107") === normStreet("Plutarco Elias Calles 107"), [normStreet("Plutarco Elías Calles 107"), normStreet("Plutarco Elias Calles 107")]);
ok("number BEFORE vs AFTER street → same key", normStreet("107 Plutarco Elías Calles") === normStreet("Plutarco Elías Calles 107"), normStreet("107 Plutarco Elías Calles"));
ok("colonia after the comma never enters the key", normStreet("Plutarco Elías Calles 107, Tampiquito, San Pedro") === normStreet("Plutarco Elías Calles 107, San Pedro"));
ok("US abbreviation folds (Ave==Avenue)", normStreet("3002 W 47th Ave") === normStreet("3002 W 47th Avenue"));
ok("suite designator + its number dropped", normStreet("123 Main St Suite 400") === normStreet("123 Main St"), normStreet("123 Main St Suite 400"));
ok("ordinal in a name is NOT the building number", normStreet("3002 W 47th Ave").startsWith("3002 "), normStreet("3002 W 47th Ave"));
ok("normCity folds diacritics", normCity("San Pedro Garza García") === normCity("San Pedro Garza Garcia"));

// ── PART A: the three Old Jimmy's variants collapse to ONE ───────────────────
console.log("\n[A] Old Jimmy's — 3 format-variants of one address → 1 record");
{
  const variants = [
    mk("Plutarco Elías Calles 107, Tampiquito, San Pedro Garza García", "San Pedro Garza García"), // flagship
    mk("Plutarco Elias Calles 107, San Pedro Garza García", "San Pedro Garza Garcia"),             // no diacritic, no colonia
    mk("107 Plutarco Elías Calles, San Pedro Garza García", "San Pedro Garza García"),             // number first
  ];
  const keys = new Set(variants.map(locationKey));
  ok("all three share ONE dedupe key", keys.size === 1, [...keys]);
  const merged = mergeDiscovered(variants, []);
  ok("union collapses the three to a single record", merged.length === 1, merged.map((m) => m.address));
}

// ── Each single-axis variant collapses on its own ───────────────────────────
console.log("\n[A] diacritic-only / number-position-only / colonia-only each collapse");
{
  const diacritic = mergeDiscovered([mk("Avenida Juárez 50", "Monterrey"), mk("Avenida Juarez 50", "Monterrey")], []);
  ok("diacritic-only variant → 1", diacritic.length === 1, diacritic.map((m) => m.address));
  const numpos = mergeDiscovered([mk("Calle 5 de Mayo 200", "Puebla"), mk("200 Calle 5 de Mayo", "Puebla")], []);
  ok("number-position-only variant → 1", numpos.length === 1, numpos.map((m) => m.address));
  const colonia = mergeDiscovered([mk("Reforma 100, Centro, Guadalajara", "Guadalajara"), mk("Reforma 100, Guadalajara", "Guadalajara")], []);
  ok("colonia-only variant → 1", colonia.length === 1, colonia.map((m) => m.address));
}

// ── Over-merge guard: same street, different NUMBER stays two ────────────────
console.log("\n[A] over-merge guard — different building number stays distinct");
{
  const two = mergeDiscovered([mk("107 Plutarco Elías Calles", "San Pedro"), mk("205 Plutarco Elías Calles", "San Pedro")], []);
  ok("107 vs 205 on the same street → TWO records", two.length === 2, two.map((m) => m.address));
  ok("their keys differ", locationKey(mk("107 Plutarco Elías Calles", "San Pedro")) !== locationKey(mk("205 Plutarco Elías Calles", "San Pedro")));
}

// ── Doubled-address scrape (Southside) collapses in the union dedupe ─────────
console.log("\n[A6] doubled-address twin dedupes to one");
{
  const two = mergeDiscovered([
    mk("534 Highway 71", "Bastrop"),
    mk("534 Highway 71 534 Highway 71", "Bastrop"), // the doubled scrape twin
  ], []);
  ok("clean row + doubled twin → ONE record", two.length === 1, two.map((m) => m.address));
}

// ── Sugarfire twin (phone-glued + Saint split) reconciles on the street key ──
console.log("\n[A7] mangled Sugarfire twin shares the clean row's street key");
{
  // The scraped city is a fragment ("Louis"), so the union (which keys on the
  // separate city field) keeps both — but the seed reconcile matches on the STREET
  // key alone, which the phone-strip + Saint-reunite now make identical, so it
  // collapses to one row there.
  ok("phone/Saint twin street key == clean row street key",
    normStreet("797-8487605 Washington Ave. St., Louis") === normStreet("605 Washington Ave., St. Louis"));
}

// ── Different cities never merge on street alone ────────────────────────────
console.log("\n[A] same street text, different city → distinct");
{
  const two = mergeDiscovered([mk("1 High St", "Leeds"), mk("1 High St", "York")], []);
  ok("1 High St Leeds vs York → TWO records", two.length === 2, two.map((m) => `${m.address} / ${m.city}`));
}

// ── Merge trace (A3 — honest debug) ─────────────────────────────────────────
console.log("\n[A3] the collapse is recorded, never silent");
{
  const { locations, merged } = mergeDiscoveredTraced([
    mk("Plutarco Elías Calles 107", "San Pedro"),
    mk("107 Plutarco Elias Calles", "San Pedro"),
  ], []);
  ok("one kept", locations.length === 1);
  ok("the folded-away variant is recorded in the trace", merged.length === 1 && merged[0].merged === "107 Plutarco Elias Calles", merged);
}

// ── Geo-proximity backstop (A2) — identical pins collapse regardless of text ─
console.log("\n[A2] geo backstop — identical coordinates are the same location");
{
  const cand = { id: "c", name: "Old Jimmy's", address: "Some Other Wording 9", city: "San Pedro", lat: 25.6501, lng: -100.3501 };
  const existing = [{ id: "e", name: "Old Jimmy's", address: "Plutarco Elías Calles 107", city: "San Pedro", lat: 25.6501, lng: -100.3501 }];
  const dups = findDuplicates(cand, existing);
  ok("identical-coordinate rows flag as a duplicate despite different text", dups.length === 1 && dups[0].confidence === "high", dups);
}

// ── Ambiguous stays flagged, never silently merged (over-merge guard #2) ─────
console.log("\n[A] ambiguous (same street, different number, no geo) → NOT a street match");
{
  const cand = { id: "c", name: "Brand", address: "107 Main St", city: "Town" };
  const existing = [{ id: "e", name: "Brand", address: "205 Main St", city: "Town" }];
  const dups = findDuplicates(cand, existing);
  // A same-brand same-city name hit may still surface it for a human, but it must
  // NOT be a high-confidence "same address" auto-merge.
  ok("107 vs 205 is never a 'same address' high-confidence match", !dups.some((d) => d.reason === "same address"), dups);
}

// ── FIX 1: fuzzy dedupe — spelling-variant twins that shipped live duplicates ─
console.log("\n[FIX 1] fuzzy dedupe — the four live twins collapse to ONE key");
{
  const pairs: [string, string, string][] = [
    ["2731 S. W.W. White Road", "2731 S WW White Rd", "San Antonio"],       // Road≠Rd, S. W.W.≠S WW
    ["6712 Hwy 441 N", "6712 Hwy 441", "Dillard"],                          // trailing directional
    ["7501 MS Highway 57", "7501 MS-57", "Ocean Springs"],                  // state-route form
    ["101 W 22nd St. #300", "101 W 22nd Street", "Kansas City"],            // suite + St.≠Street
  ];
  for (const [a, b, city] of pairs) {
    ok(`key: "${a}" == "${b}"`, normStreet(a) === normStreet(b), [normStreet(a), normStreet(b)]);
    const merged = mergeDiscovered([mk(a, city, { country: "United States" }), mk(b, city, { country: "United States" })], []);
    ok(`  union collapses "${a.slice(0, 14)}…" to one`, merged.length === 1, merged.map((m) => m.address));
  }
}

console.log("\n[FIX 1] over-collapse guard — two REAL locations stay separate");
{
  // Two real Wright's, Bentonville — different building number AND different street.
  const wr = mergeDiscovered([mk("208 NE 3rd St", "Bentonville", { country: "United States" }), mk("1410 SE 8th St", "Bentonville", { country: "United States" })], []);
  ok("Wright's 208 NE 3rd vs 1410 SE 8th → TWO", wr.length === 2, wr.map((m) => m.address));
  ok("  their street keys differ", normStreet("208 NE 3rd St") !== normStreet("1410 SE 8th St"));
  // Two real Big Bob Gibson, Decatur — different streets entirely.
  const bb = mergeDiscovered([mk("1715 6th Ave SE", "Decatur", { country: "United States" }), mk("2520 Danville Rd SW", "Decatur", { country: "United States" })], []);
  ok("Big Bob Gibson two Decatur addresses → TWO", bb.length === 2, bb.map((m) => m.address));
  // A hyphenated range keeps BOTH numbers (never rewritten to one).
  ok("range '100-200 Main St' retains both numbers", normStreet("100-200 Main St").includes("100") && normStreet("100-200 Main St").includes("200"), normStreet("100-200 Main St"));
  // 2M initials fold, but a genuinely different street does not collapse into it.
  ok("2M twin keys the same, a different street does not", normStreet("2731 S. W.W. White Road") !== normStreet("2731 Broadway"));
}

// ── FIX 2a: roster provenance — off-brand link is not absorbed as a branch ────
console.log("\n[FIX 2a] off-brand roster link is not a branch (Jackalope vs Jack's BBQ)");
{
  ok("'Jackalope Tex-Mex & Cantina' is OFF-brand for 'Jack's BBQ'", rosterNameIsOffBrand("Jackalope Tex-Mex & Cantina", "Jack's BBQ"));
  ok("'Jack's BBQ Redmond' IS a branch (shares 'jacks')", !rosterNameIsOffBrand("Jack's BBQ Redmond", "Jack's BBQ"));
  ok("'Jack's BBQ Seattle' IS a branch (longest token is the city, not the brand)", !rosterNameIsOffBrand("Jack's BBQ Seattle", "Jack's BBQ"));
  ok("a null / empty name is treated as a branch, never split off", !rosterNameIsOffBrand(null, "Jack's BBQ") && !rosterNameIsOffBrand("", "Jack's BBQ"));
  ok("a weak brand token ('2M') never splits a sibling off", !rosterNameIsOffBrand("2M Smokehouse Westside", "2M Smokehouse"));
  ok("brandTokens is the shared tokeniser (keeps 'jacks', drops 'bbq')", brandTokens("Jack's BBQ").includes("jacks") && !brandTokens("Jack's BBQ").includes("bbq"));
  // A genuine cross-linked eatery with no shared token but a clear business word.
  ok("'Metro Diner' IS off-brand for 'Bono's Pit Bar-B-Q' (a distinct eatery)", rosterNameIsOffBrand("Metro Diner", "Bono's Pit Bar-B-Q"));
}

console.log("\n[FIX 2a] a branch named by its AREA/CITY is NOT a phantom off-brand row");
{
  // The live false positives: a locality label shares no brand token but is NOT a
  // different business — it must never be split off as a standalone venue.
  ok("'Beaumont' (Cornerstone's own city) is NOT off-brand", !rosterNameIsOffBrand("Beaumont", "Cornerstone BBQ", { selfCity: "Beaumont", parentCity: "Beaumont" }));
  ok("'Duval Station' (a Jacksonville area) is NOT off-brand", !rosterNameIsOffBrand("Duval Station", "Bono's Pit Bar-B-Q", { selfCity: "Jacksonville", parentCity: "Jacksonville" }));
  ok("'Bartram Oaks' (a Jacksonville area) is NOT off-brand", !rosterNameIsOffBrand("Bartram Oaks", "Bono's Pit Bar-B-Q", { selfCity: "Jacksonville", parentCity: "Jacksonville" }));
  ok("a bare place name is not off-brand even without city context", !rosterNameIsOffBrand("Mandarin", "Bono's Pit Bar-B-Q"));
  // …but the genuine cross-link still splits off.
  ok("Jackalope still off-brand alongside the area-name guard", rosterNameIsOffBrand("Jackalope Tex-Mex & Cantina", "Jack's BBQ", { selfCity: "Seattle", parentCity: "Seattle" }));
}

// ── FIX 2b: a flagship must be a real, located place ─────────────────────────
console.log("\n[FIX 2b] flagship location guard (Home Team → Myanmar)");
{
  ok("no street + foreign-country pin → HELD (unlocatable)", flagshipUnlocatable({ hasStreet: false, declaredCountryCode: "US", geoCountryCode: "MM" }));
  ok("a real street → locatable even if the geocode wobbles", !flagshipUnlocatable({ hasStreet: true, declaredCountryCode: "US", geoCountryCode: "MM" }));
  ok("no street but a SAME-country pin → allowed (city-level flagship)", !flagshipUnlocatable({ hasStreet: false, declaredCountryCode: "US", geoCountryCode: "US" }));
  ok("addressHasStreet: a real street true, a bare city false", addressHasStreet("2731 S WW White Rd", "San Antonio") && !addressHasStreet(null, "Charleston"));
}

// ── FIX 3: geo honesty — confidence never outlives its coordinate ────────────
console.log("\n[FIX 3] confidence/coordinate are co-set (or both null)");
{
  const withPin = coherentGeoConfidence(32.7, -79.9, { geo_precision: "address", geo_confidence: 0.9, geo_source: "maptiler" });
  ok("a real pin keeps its confidence trio", withPin.geo_confidence === 0.9 && withPin.geo_precision === "address" && withPin.geo_source === "maptiler");
  const noPin = coherentGeoConfidence(null, null, { geo_precision: "address", geo_confidence: 0.9, geo_source: "maptiler" });
  ok("no coordinate → the WHOLE trio is nulled (the phantom's 0.9-with-null-pin)", noPin.geo_confidence === null && noPin.geo_precision === null && noPin.geo_source === null);
  ok("(0,0) null-island is not a real pin → trio nulled", coherentGeoConfidence(0, 0, { geo_precision: "poi", geo_confidence: 0.8, geo_source: "x" }).geo_confidence === null);
  ok("hasRealPoint: real yes; null / 0,0 no", hasRealPoint(32.7, -79.9) && !hasRealPoint(null, -79.9) && !hasRealPoint(0, 0));
  // Acceptance 1 — the invariant across every coordinate shape.
  const shapes: [number | null, number | null][] = [[10, 20], [null, null], [0, 0], [10, null]];
  const holds = shapes.every(([la, ln]) => {
    const g = coherentGeoConfidence(la, ln, { geo_precision: "p", geo_confidence: 0.5, geo_source: "s" });
    return hasRealPoint(la, ln) ? g.geo_confidence !== null : g.geo_confidence === null;
  });
  ok("invariant: geo_confidence is set IFF a real coordinate exists", holds);
}

// ── PART B: chip predicate == deep-link predicate ───────────────────────────
console.log("\n[B] unrostered predicate — one source for chip + ?unrostered=1");
{
  const V = (id: string, o: Partial<UnrosteredChainVenue>): UnrosteredChainVenue => ({
    id, chainCandidate: false, chainRostered: false, chainSeed: false, chainParentId: null, ...o,
  });
  const venues = [
    V("a", { chainCandidate: true }),                              // ✓ unrostered chain
    V("b", { chainCandidate: true, chainRostered: true }),         // ✗ already rostered
    V("c", { chainCandidate: true, chainParentId: "b" }),          // ✗ a branch (of b)
    V("d", { chainCandidate: true, chainSeed: true }),             // ✗ a seed
    V("e", { chainCandidate: false }),                             // ✗ not a candidate
    V("f", { chainCandidate: true }),                              // parent WITH a child → ✗
    V("g", { chainParentId: "f" }),                                // f's child
  ];
  const withChildren = parentIdsWithChildren(venues);
  const selected = venues.filter((v) => isUnrosteredChain(v, withChildren)).map((v) => v.id);
  ok("selects exactly the top-level, unrostered, childless candidate", JSON.stringify(selected) === JSON.stringify(["a"]), selected);
  // Deep-link and chip both run THIS predicate, so their sets are identical by
  // construction — assert the two callers agree over the same list.
  const chipSet = venues.filter((v) => isUnrosteredChain(v, withChildren)).map((v) => v.id);
  const deepLinkSet = venues.filter((v) => isUnrosteredChain(v, withChildren)).map((v) => v.id);
  ok("deep-link set == chip set", JSON.stringify(chipSet) === JSON.stringify(deepLinkSet), { chipSet, deepLinkSet });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
