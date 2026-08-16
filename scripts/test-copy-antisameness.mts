/* Enrichment copy — anti-sameness (ENRICHMENTPROMPTANTISAMENESS). Pure.
 * Run: node_modules/.bin/tsx scripts/test-copy-antisameness.mts
 */
import {
  OPENING_STYLES,
  openingStyleFor,
  bannedPhrasesIn,
  bannedExamplesIn,
  ungroundedClaims,
  stripPerLocationOperators,
  sanitizePoisonedFacts,
  poisonedFacts,
  sharedPerLocationOperators,
  borrowBrandFactsFromChildren,
  writeVenueCopy,
  type CopyGenerator,
} from "../lib/ai/enrich";
import type { VenueDossier } from "../lib/ai/enrich";

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

console.log("\n[NO INVENTED FACTS — grounding tripwire]");
{
  const sugarfire = { name: "Sugarfire Smokehouse", city: "St. Louis", what_it_is: "barbecue joint", founders_pitmaster: null, established: null, awards_press: [] as string[] };
  // The exact incident: an invented pitmaster named across 8 branches.
  ok("flags an invented 'Chef Dave Molina'", ungroundedClaims("Chef Dave Molina runs the pits here.", sugarfire).some((c) => c.kind === "person" && c.text === "Dave Molina"));
  ok("flags 'run by Dave Molina' (name cleaned, no trailing dot)", ungroundedClaims("The kitchen is run by Dave Molina.", sugarfire).some((c) => c.text === "Dave Molina"));
  ok("flags 'Dave Molina smokes the brisket'", ungroundedClaims("Dave Molina smokes the brisket daily.", sugarfire).some((c) => c.text === "Dave Molina"));
  ok("flags an invented year (facts have none)", ungroundedClaims("Smoking brisket since 1998.", sugarfire).some((c) => c.kind === "year" && c.text === "1998"));

  // Acceptance 1 — a venue whose facts name no person → copy that names no one is clean.
  ok("no-person copy on a no-person venue is clean", ungroundedClaims("A gravel lot, a pit, and a queue down the block.", sugarfire).length === 0);

  // Grounded claims pass — a real pitmaster and a real founding year in the facts.
  const franklin = { name: "Franklin Barbecue", city: "Austin", founders_pitmaster: "Aaron Franklin", established: "2009" };
  ok("a grounded pitmaster + year passes", ungroundedClaims("Aaron Franklin started with a trailer in 2009.", franklin).length === 0);
  ok("an eponymous venue name is not a person invention", ungroundedClaims("Franklin Barbecue sits on the East Side.", franklin).length === 0);
  // A first name invented onto a known surname is still caught (strict grounding).
  ok("an invented first name on a known surname is caught", ungroundedClaims("Chef Reginald Franklin runs it.", franklin).some((c) => c.text === "Reginald Franklin"));

  // Acceptance 4 — an empty-facts venue yields zero invented claims when copy is honest.
  ok("empty-facts venue + honest bare copy → no claims", ungroundedClaims("A barbecue spot in town.", { name: "Smoke Co" }).length === 0);
}

console.log("\n[NO INVENTED FACTS — part 2: the poisoned FACTS stage]");
{
  // The exact live incident: the invented pitmaster was laundered INTO a facts
  // field, so on re-enrich the grounding found him in the dossier and passed him.
  const poisoned = {
    name: "Sugarfire Smokehouse",
    city: "St. Louis",
    what_it_is: "barbecue joint",
    founders_pitmaster: "Mike Johnson (Chef/Owner), Carolyn Downs (Pastry Chef/Owner); Chef Dave Molina (this location)",
    established: null,
    awards_press: [] as string[],
  };
  // Gap 2 — grounding must NOT treat the laundered field as ground truth: the copy
  // claim "Chef Dave Molina" is now held, even though the poisoned dossier "names" him.
  ok("laundered 'Dave Molina' in the facts no longer grounds the copy claim (HELD)",
    ungroundedClaims("Chef Dave Molina runs the pits here.", poisoned).some((c) => c.kind === "person" && c.text === "Dave Molina"),
    ungroundedClaims("Chef Dave Molina runs the pits here.", poisoned));
  // But the REAL, untagged brand operators still ground — no false hold.
  ok("a real untagged operator (Mike Johnson) still grounds",
    ungroundedClaims("Mike Johnson started the smokehouse.", poisoned).length === 0,
    ungroundedClaims("Mike Johnson started the smokehouse.", poisoned));

  // Gap 1 — the sanitizer strips ONLY the per-location operator, keeps the real ones.
  const s = stripPerLocationOperators(poisoned.founders_pitmaster);
  ok("strip keeps the real founders, drops the per-location operator",
    s.value === "Mike Johnson (Chef/Owner), Carolyn Downs (Pastry Chef/Owner)" && s.stripped.length === 1,
    s);
  ok("a value that is ONLY a per-location operator collapses to null",
    stripPerLocationOperators("Chef Dave Molina (this location)").value === null);
  ok("the 'runs this branch' verb shape is also stripped",
    stripPerLocationOperators("Dave Molina runs this branch").value === null,
    stripPerLocationOperators("Dave Molina runs this branch"));
  ok("a real solo operator (no tag) is untouched",
    stripPerLocationOperators("Aaron Franklin").value === "Aaron Franklin");

  // sanitizePoisonedFacts cleans the whole dossier + reports what it removed.
  const clean = sanitizePoisonedFacts(poisoned);
  ok("sanitizePoisonedFacts drops the poison from founders_pitmaster",
    !/dave molina/i.test(String(clean.dossier.founders_pitmaster)) && clean.stripped.length === 1, clean.dossier.founders_pitmaster);
  ok("sanitizePoisonedFacts leaves a clean dossier's facts intact",
    sanitizePoisonedFacts({ founders_pitmaster: "Aaron Franklin", awards_press: ["Texas Monthly Top 50"] }).stripped.length === 0);
}

console.log("\n[NO INVENTED FACTS — part 2: poisoned-facts detector for the sweep]");
{
  const poisoned = { founders_pitmaster: "Chef Dave Molina (this location)", what_it_is: "barbecue joint" };
  // Acceptance 4 — the detector flags a per-location operator in an existing dossier.
  ok("poisonedFacts flags a '(this location)' operator", poisonedFacts(poisoned).some((p) => p.field === "founders_pitmaster" && /molina/i.test(p.text)));
  ok("poisonedFacts is clean on a real, untagged operator", poisonedFacts({ founders_pitmaster: "Aaron Franklin, Stacy Franklin" }).length === 0);
  ok("poisonedFacts flags a 'runs this branch' assertion in setting_vibe", poisonedFacts({ setting_vibe: "Dave Molina runs this location day to day" }).length === 1);

  // Cross-branch: the same tagged operator across 2+ branches (the Sugarfire shape).
  const branches = [
    { label: "Olivette", founders_pitmaster: "Chef Dave Molina (this location)" },
    { label: "Valley Park", founders_pitmaster: "Chef Dave Molina (this location)" },
    { label: "Downtown", founders_pitmaster: "Mike Johnson (Chef/Owner)" }, // real brand founder, untagged
  ];
  const shared = sharedPerLocationOperators(branches);
  ok("sharedPerLocationOperators flags Molina across 2+ branches", shared.some((s) => /molina/i.test(s.name) && s.branches.length === 2), shared);
  ok("a real untagged brand founder across branches is NOT flagged", !shared.some((s) => /johnson/i.test(s.name)));
  // A brand founder legitimately shared across every branch must never be flagged.
  const realShared = sharedPerLocationOperators([
    { label: "A", founders_pitmaster: "Aaron Franklin" },
    { label: "B", founders_pitmaster: "Aaron Franklin" },
  ]);
  ok("Aaron Franklin shared across branches (untagged) → no false flag", realShared.length === 0, realShared);
}

console.log("\n[§1 banned-phrase — the write-time detector names the real phrase]");
{
  ok("bannedExamplesIn returns the actual phrase, not the label",
    bannedExamplesIn("they offer no shortcuts, no filler").some((s) => /no shortcuts, no/i.test(s)),
    bannedExamplesIn("they offer no shortcuts, no filler"));
  ok("case-insensitive: 'No apologies' catches", bannedPhrasesIn("No apologies here").includes("apologise-construction"));
  ok("'doesn't apologise' catches", bannedPhrasesIn("it doesn't apologise for the wait").includes("apologise-construction"));
  ok("examples + labels agree in count for a mixed sample",
    bannedExamplesIn("no gimmicks, and it knows exactly what it is").length === bannedPhrasesIn("no gimmicks, and it knows exactly what it is").length);
}

console.log("\n[§1 banned-phrase — ENFORCED at write time in writeVenueCopy]");
{
  const dossier = {
    name: "Smoke Yard", city: "Austin", country: "United States",
    what_it_is: "Central Texas barbecue joint", bbq_style: "Central Texas",
    specialities: ["brisket"], awards_press: [] as string[], unknowns: [] as string[],
  } as unknown as VenueDossier;

  // Case A — first draft trips §1 ("no shortcuts, no…"); the retry is clean → taken.
  const promptsA: string[] = [];
  const genThenClean: CopyGenerator = async (userPrompt) => {
    promptsA.push(userPrompt);
    return promptsA.length === 1
      ? { data: { hook: "Brisket, and plenty of it.", description: "Post oak, early hours. No shortcuts, no filler." }, usage: { in_tokens: 10, out_tokens: 20 }, model: "test" }
      : { data: { hook: "Brisket, and plenty of it.", description: "Post oak, and they open early." }, usage: { in_tokens: 5, out_tokens: 8 }, model: "test" };
  };
  const outA = await writeVenueCopy(dossier, { generate: genThenClean });
  ok("a banned draft is REGENERATED (2 writer calls)", promptsA.length === 2, promptsA.length);
  ok("the retry NAMES the offending phrase", /REWRITE REQUIRED/.test(promptsA[1]) && /no shortcuts/i.test(promptsA[1]));
  ok("a clean retry is accepted, not held", outA.needs_attention === false, outA.attention_reason);
  ok("the published copy carries NO §1 phrase", bannedPhrasesIn(`${outA.hook}\n${outA.description}`).length === 0, `${outA.hook} / ${outA.description}`);
  ok("usage sums across both attempts", outA.usage.in_tokens === 15 && outA.usage.out_tokens === 28, outA.usage);

  // Case B — the tic survives the one retry → the venue is HELD, never published.
  let callsB = 0;
  const genAlwaysBad: CopyGenerator = async () => {
    callsB++;
    return { data: { hook: "A place that knows exactly what it is.", description: "Brisket, and it doesn't apologise for it." }, usage: { in_tokens: 1, out_tokens: 1 }, model: "test" };
  };
  const outB = await writeVenueCopy(dossier, { generate: genAlwaysBad });
  ok("a surviving tic HOLDS the venue (needs_attention)", outB.needs_attention === true);
  ok("regenerated exactly once (2 calls total)", callsB === 2, callsB);
  ok("the hold reason names the banned phrase", /banned phrase/i.test(outB.attention_reason ?? "") && /apolog/i.test(outB.attention_reason ?? ""), outB.attention_reason);

  // Acceptance 4 — a clean first draft is untouched (no needless regeneration).
  let callsC = 0;
  const genClean: CopyGenerator = async () => {
    callsC++;
    return { data: { hook: "Brisket, and plenty of it.", description: "Post oak, and they open early." }, usage: { in_tokens: 3, out_tokens: 4 }, model: "test" };
  };
  const outC = await writeVenueCopy(dossier, { generate: genClean });
  ok("a clean first draft is not regenerated (1 call)", callsC === 1, callsC);
  ok("clean copy publishes (needs_attention false)", outC.needs_attention === false);
}

console.log("\n[BRAND FALLBACK — a thin flagship borrows its branches' facts before holding]");
{
  const thinFlagship = {
    name: "Hickory's Smokehouse", city: "Rhos-on-Sea", what_it_is: null, bbq_style: null,
    established: null, website: null, instagram: null, founders_pitmaster: null,
    setting_vibe: null, cook_method: null, wood_fuel: null, price_band: null,
    also_known_as: [] as string[], specialities: [] as string[], awards_press: [] as string[],
    unknowns: ["what_it_is", "established"], is_chain: true,
  } as unknown as VenueDossier;
  const richChild = {
    ...thinFlagship, location_label: "Chester",
    what_it_is: "British barbecue smokehouse", bbq_style: "American BBQ",
    established: "2010", founders_pitmaster: "Neil McDonnell", specialities: ["ribs"],
  } as unknown as VenueDossier;

  // Fix 3 poison rule — borrow pure function: brand facts cross, per-location does NOT.
  const poisonChild = { ...richChild, founders_pitmaster: "Chef Dave Molina (this location)" } as unknown as VenueDossier;
  const bPoison = borrowBrandFactsFromChildren(thinFlagship, [poisonChild]);
  ok("a per-location operator is NOT borrowed to the flagship", !/molina/i.test(String(bPoison.dossier.founders_pitmaster ?? "")), bPoison.dossier.founders_pitmaster);
  ok("but a real brand fact (what_it_is) IS borrowed", bPoison.dossier.what_it_is === "British barbecue smokehouse" && bPoison.borrowed.includes("what_it_is"));
  const bReal = borrowBrandFactsFromChildren(thinFlagship, [{ ...thinFlagship, founders_pitmaster: "Aaron Franklin" } as unknown as VenueDossier]);
  ok("a real untagged brand founder IS borrowed", bReal.dossier.founders_pitmaster === "Aaron Franklin" && bReal.borrowed.includes("founders_pitmaster"));
  ok("nothing borrowed when children carry no brand facts", borrowBrandFactsFromChildren(thinFlagship, [{ ...thinFlagship } as unknown as VenueDossier]).borrowed.length === 0);

  // Acceptance 1 — the flagship WRITES on the second pass from its branches' facts.
  const callsA: string[] = [];
  const genA: CopyGenerator = async (prompt) => {
    callsA.push(prompt);
    return /British barbecue smokehouse/.test(prompt)
      ? { data: { hook: "Smoke over the seafront.", description: "A British barbecue smokehouse; the story runs back to 2010." }, usage: { in_tokens: 5, out_tokens: 9 }, model: "t" }
      : { data: { needs_attention: true, reason: "thin dossier" }, usage: { in_tokens: 3, out_tokens: 0 }, model: "t" };
  };
  const outA = await writeVenueCopy(thinFlagship, { isFlagship: true, siblingDossiers: [richChild], generate: genA });
  ok("a thin flagship with rich children is WRITTEN, not held", outA.needs_attention === false && Boolean(outA.description), outA.attention_reason);
  ok("the borrow ran a second pass (2 generate calls)", callsA.length === 2, callsA.length);
  ok("the second prompt carries the borrowed brand fact", /British barbecue smokehouse/.test(callsA[1] ?? ""));
  ok("the borrowed year grounds the copy (no invented-fact hold)", !/not found in this venue/.test(outA.attention_reason ?? ""));

  // Acceptance 2 — genuinely factless (children add nothing) still HOLDS.
  const callsB: string[] = [];
  const genB: CopyGenerator = async (prompt) => { callsB.push(prompt); return { data: { needs_attention: true }, usage: { in_tokens: 1, out_tokens: 0 }, model: "t" }; };
  const outB = await writeVenueCopy(thinFlagship, { isFlagship: true, siblingDossiers: [{ ...thinFlagship } as unknown as VenueDossier], generate: genB });
  ok("a flagship whose children have no brand facts still HOLDS", outB.needs_attention === true);
  ok("no wasted second pass when the borrow adds nothing", callsB.length === 1, callsB.length);

  // Acceptance 4 — a standalone venue (no children) is untouched: one pass, holds.
  const callsC: string[] = [];
  const genC: CopyGenerator = async (prompt) => { callsC.push(prompt); return { data: { needs_attention: true }, usage: { in_tokens: 1, out_tokens: 0 }, model: "t" }; };
  const outC = await writeVenueCopy(thinFlagship, { generate: genC });
  ok("a standalone thin venue holds with NO borrow pass", outC.needs_attention === true && callsC.length === 1, callsC.length);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
