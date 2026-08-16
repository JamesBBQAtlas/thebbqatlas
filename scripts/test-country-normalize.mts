/* Canonical country normalization (BUILDPROMPTCOUNTRYNORMALIZE).
 *
 * One shared canonicalCountry(): ISO codes, native names, and variants all
 * collapse to a single canonical English name; unknown + ambiguous ("Georgia")
 * inputs are NOT confidently recognised (the write site flags them). Plus a guard
 * that the bundled seed data carries only canonical country names.
 *
 * Pure. Run: node_modules/.bin/tsx scripts/test-country-normalize.mts
 */
import { canonicalCountry, isRecognizedCountry } from "../lib/constants/countries";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

console.log("\n[ISO alpha-2 / alpha-3 codes → canonical name]");
ok("MX → Mexico", canonicalCountry("MX") === "Mexico");
ok("DE → Germany", canonicalCountry("DE") === "Germany");
ok("US → United States", canonicalCountry("US") === "United States");
ok("GB → United Kingdom", canonicalCountry("GB") === "United Kingdom");
ok("MEX (alpha-3) → Mexico", canonicalCountry("MEX") === "Mexico");
ok("DEU (alpha-3) → Germany", canonicalCountry("DEU") === "Germany");
ok("lower-case mx → Mexico", canonicalCountry("mx") === "Mexico");

console.log("\n[native-language names → canonical English]");
ok("Deutschland → Germany", canonicalCountry("Deutschland") === "Germany");
ok("México (diacritic) → Mexico", canonicalCountry("México") === "Mexico");
ok("España → Spain", canonicalCountry("España") === "Spain");
ok("Brasil → Brazil", canonicalCountry("Brasil") === "Brazil");
ok("日本 → Japan", canonicalCountry("日本") === "Japan");

console.log("\n[variants / casing]");
ok("USA → United States", canonicalCountry("USA") === "United States");
ok("U.S. → United States", canonicalCountry("U.S.") === "United States");
ok("UK → United Kingdom", canonicalCountry("UK") === "United Kingdom");
ok("lowercase 'france' → France (canonical casing)", canonicalCountry("france") === "France");
ok("UPPER 'FRANCE' → France", canonicalCountry("FRANCE") === "France");

console.log("\n[recognition — recognised names accepted]");
for (const c of ["Mexico", "Germany", "United States", "United Kingdom", "France", "Japan", "Brazil", "Australia"]) {
  ok(`recognised: ${c}`, isRecognizedCountry(c));
}
ok("recognised via code: MX", isRecognizedCountry("MX"));
ok("recognised via native: Deutschland", isRecognizedCountry("Deutschland"));

console.log("\n[unknown → flagged, not silently stored]");
ok("unknown 'Freedonia' → not recognised", isRecognizedCountry("Freedonia") === false);
ok("unknown value kept raw (never lost)", canonicalCountry("Freedonia") === "Freedonia");
ok("empty → not recognised", isRecognizedCountry("") === false && isRecognizedCountry(null) === false);

console.log("\n[Georgia — ambiguous (country vs US state) → human review]");
ok("Georgia is NOT auto-converted (kept raw)", canonicalCountry("Georgia") === "Georgia");
ok("Georgia is NOT auto-recognised → flags for a human", isRecognizedCountry("Georgia") === false);

console.log("\n[guard — bundled seed data carries only canonical country names]");
{
  const data = require("../data/restaurants.json");
  const arr: { country?: string | null }[] = Array.isArray(data) ? data : (data.restaurants ?? data.venues ?? []);
  const bad = [...new Set(
    arr.map((r) => (r.country ?? "").trim()).filter(Boolean)
      .filter((c) => !isRecognizedCountry(c) || canonicalCountry(c) !== c)
  )];
  ok(`all ${arr.length} seed rows use canonical country names`, bad.length === 0, bad);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
