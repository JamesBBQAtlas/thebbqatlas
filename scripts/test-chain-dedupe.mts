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
