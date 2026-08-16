/* Enrichment copy — anti-sameness (ENRICHMENTPROMPTANTISAMENESS). Pure.
 * Run: node_modules/.bin/tsx scripts/test-copy-antisameness.mts
 */
import { OPENING_STYLES, openingStyleFor, bannedPhrasesIn } from "../lib/ai/enrich";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

console.log("\n[§3 opening-type rotation]");
ok("there are exactly 7 opening types", OPENING_STYLES.length === 7, OPENING_STYLES.length);
ok("every opening type has a distinct key", new Set(OPENING_STYLES.map((s) => s.key)).size === 7);
ok("openingStyleFor is deterministic", openingStyleFor("abc") === openingStyleFor("abc"));
ok("openingStyleFor returns 0..6", [...Array(50)].every((_, i) => {
  const v = openingStyleFor(`venue-${i}`);
  return Number.isInteger(v) && v >= 0 && v < 7;
}));
{
  // A batch of venues should SPREAD across the types, not collapse to one.
  const buckets = new Set([...Array(140)].map((_, i) => openingStyleFor(`restaurant-${i}`)));
  ok("a batch spreads across ≥6 of the 7 types", buckets.size >= 6, [...buckets].sort());
  // Adjacent-id venues rarely share a type (the "no two back-to-back" spirit).
  let adjacentSame = 0;
  for (let i = 1; i < 140; i++) if (openingStyleFor(`restaurant-${i}`) === openingStyleFor(`restaurant-${i - 1}`)) adjacentSame++;
  ok("adjacent venues seldom share a type (< 1 in 4)", adjacentSame < 35, adjacentSame);
}

console.log("\n[§1 banned-phrase detector]");
ok("flags 'refuses to apologise for it'", bannedPhrasesIn("it runs out of a gas station and refuses to apologise for it").includes("apologise-construction"));
ok("flags 'unapologetic'", bannedPhrasesIn("an unapologetic pit").includes("apologise-construction"));
ok("flags 'no apology'", bannedPhrasesIn("a pit, a queue, no apology").includes("apologise-construction"));
ok("flags 'knows exactly what it is'", bannedPhrasesIn("a place that knows exactly what it is").includes("knows-what-it-is"));
ok("flags 'let the meat do the talking'", bannedPhrasesIn("they let the meat do the talking").includes("do-the-talking"));
ok("flags 'no gimmicks'", bannedPhrasesIn("no gimmicks here").includes("no-gimmicks"));
ok("flags paired 'no frills, no'", bannedPhrasesIn("no frills, no fuss").includes("paired-no"));
ok("flags 'you don't need a storefront'", bannedPhrasesIn("you don't need a storefront to serve great brisket").includes("no-storefront"));

console.log("\n[detector is conservative — clean copy is clean]");
ok("a clean sentence flags nothing", bannedPhrasesIn("Since 1968 the Millers have smoked brisket over post oak on Highway 290.").length === 0);
ok("the word 'apology' in a real context still flags (intended)", bannedPhrasesIn("no apology").length === 1);
// The rewritten in-prompt Joe's example must itself be clean (no reintroduced tic).
const joesExample = "Joe's does something most restaurants wouldn't dare: it runs out of a working petrol station, and the queue past the pumps says nobody minds. Since 1996, people have lined up for burnt ends, ribs, and the Z-Man. No pretense — a pit, a griddle, and food that earns its line. Fill the tank. Then fill the plate.";
ok("the reference Joe's example is itself clean of banned tics", bannedPhrasesIn(joesExample).length === 0, bannedPhrasesIn(joesExample));

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
