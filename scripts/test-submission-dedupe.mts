/**
 * Unit tests for the Part D submission dedupe — the guard that stops a "new
 * venue" submission (or a review submitted through it, the Shilla class) from
 * materialising a duplicate. Pure logic (findDuplicates). Run: npm run test:dedupe
 */
import { findDuplicates, normName, nameSimilarity, type VenueLike } from "../lib/venues/dedupe";

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

const existing: VenueLike[] = [
  { id: "shilla", name: "Shilla", slug: "shilla-zurich", address: "Gerechtigkeitsgasse 1", city: "Zurich", lat: 47.3705, lng: 8.5426 },
  { id: "burnt", name: "Burnt Ends", slug: "burnt-ends", address: "20 Teck Lim Rd", city: "Singapore", lat: 1.2792, lng: 103.8412 },
];

console.log("\n[the Shilla case — a review submitted as a 'new venue']");
{
  // Same name + same city (no address/geo — the user only typed a note).
  const m = findDuplicates({ name: "Shilla", city: "Zurich" }, existing);
  ok("flags the existing Shilla by name + city", m.length > 0 && m[0].id === "shilla");
  ok("high confidence on an exact name+city match", m[0]?.confidence === "high");
}

console.log("\n[same physical address is a high-confidence dup]");
{
  const m = findDuplicates({ name: "Different Name", address: "Gerechtigkeitsgasse 1", city: "Zurich" }, existing);
  ok("same normalised street → matched", m.some((x) => x.id === "shilla"));
}

console.log("\n[geo proximity within ~100m]");
{
  const m = findDuplicates({ name: "Some Grill", lat: 47.37055, lng: 8.54262 }, existing);
  ok("within a few metres → matched", m.some((x) => x.id === "shilla"));
}

console.log("\n[a genuinely different venue is NOT a duplicate]");
{
  const m = findDuplicates({ name: "Smoky Joes", address: "500 Elm St", city: "Austin", lat: 30.27, lng: -97.74 }, existing);
  ok("no match for an unrelated venue", m.length === 0);
}

console.log("\n[same brand, DIFFERENT city is a new branch, not a dup]");
{
  // Shilla in a different city should NOT flag as a duplicate of Zurich (name path requires same city).
  const m = findDuplicates({ name: "Shilla", city: "Geneva" }, existing);
  ok("different city → not flagged as a duplicate", !m.some((x) => x.id === "shilla"));
}

console.log("\n[name normalisation]");
ok("'Franklin BBQ' ≈ 'Franklin Barbecue'", nameSimilarity(normName("Franklin BBQ"), normName("Franklin Barbecue")) >= 0.82);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
